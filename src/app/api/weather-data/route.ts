// app/api/weather-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';
import { csvParser } from '@/lib/csvParser';

// Type definitions
interface BlobItem {
  name: string;
  lastModified: string | Date;
  size: number;
  url?: string;
  contentType?: string;
}

interface CachedData {
  data: any;
  timestamp: number;
}

// In-memory cache with TTL
const cache = new Map<string, CachedData>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getFromCache(key: string): any {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const containerName = body.containerName || 'ws-tawyeen';
    const limit = body.limit || 50; // Limit records per request
    const offset = body.offset || 0;

    console.log(`📡 [API] Fetching weather data from container: ${containerName}`);

    const cacheKey = `${containerName}-list`;
    let blobs = getFromCache(cacheKey);

    if (!blobs) {
      const azureService = new AzureBlobService(containerName);

      const containerExists = await azureService.containerExists();
      if (!containerExists) {
        return NextResponse.json(
          { error: `Container '${containerName}' does not exist` },
          { status: 404 }
        );
      }

      blobs = await azureService.listBlobs();
      setCache(cacheKey, blobs);
    }

    console.log(`📋 [API] Found ${blobs.length} blobs in container`);

    if (blobs.length === 0) {
      return NextResponse.json(
        { error: 'No files found in container' },
        { status: 404 }
      );
    }

    // Filter CSV files and sort by modified date (newest first)
    const weatherBlobs = (blobs as BlobItem[])
      .filter((blob: BlobItem) => blob.name.endsWith('.csv'))
      .sort((a: BlobItem, b: BlobItem) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    if (weatherBlobs.length === 0) {
      return NextResponse.json(
        { error: 'No CSV files found in container' },
        { status: 404 }
      );
    }

    console.log(`📄 [API] Found ${weatherBlobs.length} CSV files, fetching latest ${limit}`);

    // Only process the latest N files (pagination)
    const paginatedBlobs = weatherBlobs.slice(offset, offset + limit);
    const allDataWithTimestamps: any[] = [];

    for (const blob of paginatedBlobs) {
      try {
        console.log(`📄 [API] Downloading blob: ${blob.name}`);
        const azureService = new AzureBlobService(containerName);
        const csvContent = await azureService.downloadBlob(blob.name);

        if (!csvContent || csvContent.trim().length === 0) {
          console.warn(`⚠️ [API] Skipping empty file: ${blob.name}`);
          continue;
        }

        const parsed = await csvParser.parseFromString(csvContent, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: false,
          delimiter: '',
          transform: (value: string, field: string | number) => {
            if (typeof value === 'string') {
              value = value.trim();

              if (value === '' || value.toLowerCase() === 'null' || value.toLowerCase() === 'n/a') {
                return null;
              }

              const num = parseFloat(value);
              if (!isNaN(num) && isFinite(num)) {
                return num;
              }
            }
            return value;
          }
        });

        if (parsed.data && parsed.data.length > 0) {
          const blobTime = blob.lastModified ? new Date(blob.lastModified) : new Date();

          const dataRow = {
            ...parsed.data[0],
            time: blobTime.toISOString(),
            timestamp: blobTime.toISOString(),
            fullDateTime: blobTime.toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            }),
            blobName: blob.name
          };

          allDataWithTimestamps.push(dataRow);
        }
      } catch (error) {
        console.error(`❌ [API] Error processing blob ${blob.name}:`, error);
        continue;
      }
    }

    allDataWithTimestamps.sort((a: any, b: any) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    console.log(`✅ [API] Combined ${allDataWithTimestamps.length} data points`);

    if (!allDataWithTimestamps || allDataWithTimestamps.length === 0) {
      return NextResponse.json(
        { error: 'Failed to parse CSV data or no data rows found' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: allDataWithTimestamps,
      pagination: {
        offset,
        limit,
        total: weatherBlobs.length,
        hasMore: offset + limit < weatherBlobs.length
      },
      metadata: {
        totalRows: allDataWithTimestamps.length,
        totalFiles: weatherBlobs.length,
        headers: Object.keys(allDataWithTimestamps[0] || {}).filter(k =>
          !['time', 'timestamp', 'fullDateTime', 'blobName'].includes(k)
        ),
        blobInfo: {
          name: weatherBlobs[0].name,
          lastModified: weatherBlobs[0].lastModified,
          size: weatherBlobs[0].size,
          url: weatherBlobs[0].url
        },
        parsedAt: new Date().toISOString()
      }
    }, { status: 200 });

  } catch (error) {
    console.error('❌ [API] Error fetching weather data:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return NextResponse.json(
      {
        error: 'Failed to fetch weather data',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const containerName = searchParams.get('container') || 'ws-tawyeen';

    console.log(`📡 [API GET] Listing blobs in container: ${containerName}`);

    const cacheKey = `${containerName}-list`;
    let blobs = getFromCache(cacheKey);

    if (!blobs) {
      const azureService = new AzureBlobService(containerName);

      const containerExists = await azureService.containerExists();
      if (!containerExists) {
        return NextResponse.json(
          { error: `Container '${containerName}' does not exist` },
          { status: 404 }
        );
      }

      blobs = await azureService.listBlobs();
      setCache(cacheKey, blobs);
    }

    return NextResponse.json({
      success: true,
      container: containerName,
      blobCount: blobs.length,
      blobs: blobs.map((blob: BlobItem) => ({
        name: blob.name,
        lastModified: blob.lastModified,
        size: blob.size,
        contentType: blob.contentType
      }))
    }, { status: 200 });

  } catch (error) {
    console.error('❌ [API GET] Error listing blobs:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return NextResponse.json(
      {
        error: 'Failed to list blobs',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}