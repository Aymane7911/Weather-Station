// app/api/weather-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';

// ─── Module-level cache (persists across requests in the same process) ────────
const cache: Record<string, {
  data:      any[];
  timestamp: number;
  promise:   Promise<any[]> | null;
}> = {};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function isFresh(key: string): boolean {
  const entry = cache[key];
  return !!entry && !!entry.data.length && (Date.now() - entry.timestamp < CACHE_TTL);
}

/**
 * Build a cache key that is unique per container + connection account.
 * This prevents ws-tawyeen (index 0) from colliding with a hypothetical
 * same-named container on a different account.
 */
function cacheKey(containerName: string, connectionIndex: 0 | 1 | 2): string {
  return `${connectionIndex}:${containerName}`;
}

async function fetchFromAzure(containerName: string, connectionIndex: 0 | 1 | 2): Promise<any[]> {
  console.log(`📥 [weather-data] Downloading aggregated.json for ${containerName} (index ${connectionIndex})`);
  const service = new AzureBlobService(containerName, connectionIndex);
  const content = await service.downloadBlob('aggregated.json');
  const parsed  = JSON.parse(content);
  const data: any[] = parsed.data || [];
  console.log(`✅ [weather-data] Loaded ${data.length} data points from ${containerName}`);
  return data;
}

async function getData(containerName: string, connectionIndex: 0 | 1 | 2): Promise<any[]> {
  const key = cacheKey(containerName, connectionIndex);

  // 1. Cache hit
  if (isFresh(key)) {
    console.log(`⚡ [weather-data] Serving ${containerName} from memory cache`);
    return cache[key].data;
  }

  // 2. Deduplicate concurrent requests
  if (cache[key]?.promise) {
    console.log(`⏳ [weather-data] Waiting for in-flight fetch for ${containerName}...`);
    return cache[key].promise!;
  }

  // 3. Stale-while-revalidate
  if (cache[key]?.data?.length) {
    console.log(`🔄 [weather-data] Returning stale data for ${containerName}, refreshing in background...`);
    cache[key].promise = fetchFromAzure(containerName, connectionIndex)
      .then(data => {
        cache[key] = { data, timestamp: Date.now(), promise: null };
        return data;
      })
      .catch(err => {
        console.error(`❌ [weather-data] Background refresh failed for ${containerName}:`, err);
        cache[key].promise = null;
        return cache[key].data;
      });
    return cache[key].data;
  }

  // 4. Cold start
  const promise = fetchFromAzure(containerName, connectionIndex)
    .then(data => {
      cache[key] = { data, timestamp: Date.now(), promise: null };
      return data;
    })
    .catch(err => {
      if (cache[key]) cache[key].promise = null;
      throw err;
    });

  cache[key] = { data: [], timestamp: 0, promise };
  return promise;
}

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      containerName   = 'ws-tawyeen',
      connectionIndex = 0,            // ← NEW: client passes this, defaults to 0
      latestOnly      = false,
      page            = 1,
      pageSize        = 500,
      startDate,
      endDate,
    } = body;

    // Validate connectionIndex
    const safeIndex = ([0, 1, 2].includes(connectionIndex) ? connectionIndex : 0) as 0 | 1 | 2;

    const allData = await getData(containerName, safeIndex);

    if (!allData.length) {
      return NextResponse.json(
        { error: `No data found for ${containerName}. Run /api/aggregate first.` },
        { status: 404 }
      );
    }

    // Mode 1: Latest only
    if (latestOnly) {
      const latest = allData[allData.length - 1];
      return NextResponse.json({
        success: true,
        data:    [latest],
        pagination: { hasMore: false, totalFiles: allData.length },
        metadata: {
          totalFiles: allData.length,
          blobInfo:   { name: latest.blobName, lastModified: latest.time },
          parsedAt:   new Date().toISOString(),
        },
      });
    }

    // Mode 2: Date range
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date(0);
      const end   = endDate   ? new Date(endDate)   : new Date();
      end.setHours(23, 59, 59, 999);

      const filtered = allData.filter(d => {
        const t = new Date(d.time);
        return t >= start && t <= end;
      });

      return NextResponse.json({
        success: true,
        data:    filtered,
        pagination: { hasMore: false, totalFiles: allData.length, returnedCount: filtered.length },
        metadata:   { totalRows: filtered.length, parsedAt: new Date().toISOString() },
      });
    }

    // Mode 3: Paginated / full
    const startIdx  = (page - 1) * pageSize;
    const pageData  = allData.slice(startIdx, startIdx + pageSize);
    const totalPages = Math.ceil(allData.length / pageSize);

    return NextResponse.json({
      success: true,
      data:    pageData,
      pagination: {
        page,
        pageSize,
        totalFiles:    allData.length,
        totalPages,
        hasMore:       page < totalPages,
        returnedCount: pageData.length,
      },
      metadata: {
        totalRows:  pageData.length,
        totalFiles: allData.length,
        blobInfo: {
          name:         allData[allData.length - 1]?.blobName,
          lastModified: allData[allData.length - 1]?.time,
        },
        parsedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [weather-data] Error:', msg);
    return NextResponse.json(
      { error: 'Failed to fetch weather data', details: msg },
      { status: 500 }
    );
  }
}