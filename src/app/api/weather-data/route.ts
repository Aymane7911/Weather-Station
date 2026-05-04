import { NextRequest, NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';

// ─── Module-level cache (persists across requests in the same process) ────────
// This lives outside the handler so it survives between requests.
const cache: Record<string, {
  data: any[];
  timestamp: number;
  promise: Promise<any[]> | null; // in-flight dedupe
}> = {};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function isFresh(containerName: string): boolean {
  const entry = cache[containerName];
  return !!entry && !!entry.data.length && (Date.now() - entry.timestamp < CACHE_TTL);
}

async function fetchFromAzure(containerName: string): Promise<any[]> {
  console.log(`📥 [API] Downloading aggregated.json for ${containerName}`);
  const service = new AzureBlobService(containerName);
  const content = await service.downloadBlob('aggregated.json');
  const parsed = JSON.parse(content);
  const data: any[] = parsed.data || [];
  console.log(`✅ [API] Loaded and cached ${data.length} data points`);
  return data;
}

async function getData(containerName: string): Promise<any[]> {
  // 1. Cache hit — return instantly
  if (isFresh(containerName)) {
    console.log('⚡ [API] Serving from memory cache');
    return cache[containerName].data;
  }

  // 2. Deduplicate concurrent requests — if a fetch is already in-flight,
  //    wait for it instead of launching a second Azure download.
  if (cache[containerName]?.promise) {
    console.log('⏳ [API] Waiting for in-flight fetch...');
    return cache[containerName].promise;
  }

  // 3. Stale-while-revalidate — if we have old data, return it immediately
  //    and refresh in the background so the NEXT request is fast.
  if (cache[containerName]?.data?.length) {
    console.log('🔄 [API] Returning stale data, refreshing in background...');
    cache[containerName].promise = fetchFromAzure(containerName)
      .then(data => {
        cache[containerName] = { data, timestamp: Date.now(), promise: null };
        return data;
      })
      .catch(err => {
        console.error('❌ [API] Background refresh failed:', err);
        cache[containerName].promise = null;
        return cache[containerName].data; // keep using stale on error
      });
    return cache[containerName].data; // return stale immediately
  }

  // 4. Cold start — no data yet, must wait for first fetch
  const promise = fetchFromAzure(containerName)
    .then(data => {
      cache[containerName] = { data, timestamp: Date.now(), promise: null };
      return data;
    })
    .catch(err => {
      if (cache[containerName]) cache[containerName].promise = null;
      throw err;
    });

  // Store promise for deduplication
  cache[containerName] = { data: [], timestamp: 0, promise };
  return promise;
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      containerName = 'ws-tawyeen',
      latestOnly = false,
      page = 1,
      pageSize = 500,
      startDate,
      endDate,
    } = body;

    const allData = await getData(containerName);

    if (!allData.length) {
      return NextResponse.json(
        { error: 'No data found. Run /api/aggregate first.' },
        { status: 404 }
      );
    }

    // Mode 1: Latest only
    if (latestOnly) {
      const latest = allData[allData.length - 1];
      return NextResponse.json({
        success: true,
        data: [latest],
        pagination: { hasMore: false, totalFiles: allData.length },
        metadata: {
          totalFiles: allData.length,
          blobInfo: { name: latest.blobName, lastModified: latest.time },
          parsedAt: new Date().toISOString(),
        },
      });
    }

    // Mode 2: Date range
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date();
      end.setHours(23, 59, 59, 999);

      const filtered = allData.filter(d => {
        const t = new Date(d.time);
        return t >= start && t <= end;
      });

      return NextResponse.json({
        success: true,
        data: filtered,
        pagination: { hasMore: false, totalFiles: allData.length, returnedCount: filtered.length },
        metadata: { totalRows: filtered.length, parsedAt: new Date().toISOString() },
      });
    }

    // Mode 3: Paginated / full
    const startIdx = (page - 1) * pageSize;
    const pageData = allData.slice(startIdx, startIdx + pageSize);
    const totalPages = Math.ceil(allData.length / pageSize);

    return NextResponse.json({
      success: true,
      data: pageData,
      pagination: {
        page,
        pageSize,
        totalFiles: allData.length,
        totalPages,
        hasMore: page < totalPages,
        returnedCount: pageData.length,
      },
      metadata: {
        totalRows: pageData.length,
        totalFiles: allData.length,
        blobInfo: {
          name: allData[allData.length - 1]?.blobName,
          lastModified: allData[allData.length - 1]?.time,
        },
        parsedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [API] Error:', msg);
    return NextResponse.json(
      { error: 'Failed to fetch weather data', details: msg },
      { status: 500 }
    );
  }
}