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

interface ParsedWeatherData {
  [key: string]: any;
}

// Advanced caching with multiple layers
const blobListCache = new Map<string, CachedData>();
const parsedDataCache = new Map<string, CachedData>();
const BLOB_LIST_TTL = 10 * 60 * 1000; // 10 minutes
const PARSED_DATA_TTL = 30 * 60 * 1000; // 30 minutes

function getFromCache(cache: Map<string, CachedData>, key: string): any {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < BLOB_LIST_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCache(cache: Map<string, CachedData>, key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// Optimized CSV parser with minimal processing
async function parseCSVFast(csvContent: string): Promise<ParsedWeatherData | null> {
  try {
    const parsed = await csvParser.parseFromString(csvContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      delimiter: '',
      fastMode: true, // Enable fast mode if available
      transform: (value: string, field: string | number) => {
  if (typeof value !== 'string') return value;
  value = value.trim();
  
  if (!value || value.toLowerCase() === 'null' || value.toLowerCase() === 'n/a') {
    return null;
  }
  
  // Only parse numbers for specific fields
  const numericFields = ['tempC', 'humidity', 'pressure', 'irradiance', 'avgWindSpeed', 'rainRatePerHour', 'direction'];
  if (numericFields.includes(String(field))) {
    const num = parseFloat(value);
    if (!isNaN(num) && isFinite(num)) {
      // ADD THIS: Apply +92 offset to pressure values
      if (String(field) === 'pressure') {
        return num + 92;
      }
      return num;
    }
  }
  
  return value;
}
    });

    return parsed.data?.[0] || null;
  } catch (error) {
    console.error('Error parsing CSV:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const containerName = body.containerName || 'ws-tawyeen';

    console.log(`📡 [API] Fetching ALL weather data - Container: ${containerName}`);

    const blobCacheKey = `${containerName}-list`;
    let blobs = getFromCache(blobListCache, blobCacheKey);

    // Fetch blob list if not cached
    if (!blobs) {
      console.log('📝 [API] Blob list cache miss - fetching from Azure');
      const azureService = new AzureBlobService(containerName);

      const containerExists = await azureService.containerExists();
      if (!containerExists) {
        return NextResponse.json(
          { error: `Container '${containerName}' does not exist` },
          { status: 404 }
        );
      }

      blobs = await azureService.listBlobs();
      setCache(blobListCache, blobCacheKey, blobs);
    } else {
      console.log('✅ [API] Using cached blob list');
    }

    if (!blobs || blobs.length === 0) {
      return NextResponse.json(
        { error: 'No files found in container' },
        { status: 404 }
      );
    }

    // Filter and sort CSV files (already sorted by Azure)
    const weatherBlobs = (blobs as BlobItem[])
      .filter((blob: BlobItem) => blob.name.endsWith('.csv'))
      .sort((a: BlobItem, b: BlobItem) => 
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      );

    if (weatherBlobs.length === 0) {
      return NextResponse.json(
        { error: 'No CSV files found in container' },
        { status: 404 }
      );
    }

    console.log(`📋 [API] Total CSV files: ${weatherBlobs.length}, Processing ALL files`);

    // Process ALL blobs (no pagination)
    const allDataWithTimestamps: ParsedWeatherData[] = [];
    const azureService = new AzureBlobService(containerName);

    // Parallel processing with Promise.all for faster execution
    const processingPromises = weatherBlobs.map(async (blob: BlobItem) => {
      try {
        const dataCacheKey = `${containerName}-${blob.name}`;
        
        // Check if parsed data is cached
        let dataRow = getFromCache(parsedDataCache, dataCacheKey);
        
        if (!dataRow) {
          console.log(`📥 [API] Downloading: ${blob.name}`);
          const csvContent = await azureService.downloadBlob(blob.name);

          if (!csvContent || csvContent.trim().length === 0) {
            console.warn(`⚠️ [API] Empty file skipped: ${blob.name}`);
            return null;
          }

          const parsed = await parseCSVFast(csvContent);
          if (!parsed) {
            console.warn(`⚠️ [API] Parse failed: ${blob.name}`);
            return null;
          }

          const blobTime = blob.lastModified ? new Date(blob.lastModified) : new Date();

          dataRow = {
            ...parsed,
            time: blobTime.toISOString(),
            timestamp: blobTime.toISOString(),
            blobName: blob.name
          };

          // Cache the parsed data
          setCache(parsedDataCache, dataCacheKey, dataRow);
        } else {
          console.log(`✅ [API] Using cached data: ${blob.name}`);
        }

        return dataRow;
      } catch (error) {
        console.error(`❌ [API] Error processing ${blob.name}:`, error);
        return null;
      }
    });

    // Wait for all blob downloads and parsing to complete
    const results = await Promise.all(processingPromises);
    const validResults = results.filter((item): item is ParsedWeatherData => item !== null);

    if (validResults.length === 0) {
      return NextResponse.json(
        { error: 'Failed to parse CSV data' },
        { status: 500 }
      );
    }

    // Sort by timestamp
    validResults.sort((a: any, b: any) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    console.log(`✅ [API] Successfully processed ${validResults.length} data points (ALL DATA)`);

    const headers = Object.keys(validResults[0] || {}).filter(k =>
      !['time', 'timestamp', 'fullDateTime', 'blobName'].includes(k)
    );

    return NextResponse.json({
      success: true,
      data: validResults,
      pagination: {
        total: weatherBlobs.length,
        hasMore: false // Always false since we're fetching all data
      },
      metadata: {
        totalRows: validResults.length,
        totalFiles: weatherBlobs.length,
        headers,
        blobInfo: {
          name: weatherBlobs[0].name,
          lastModified: weatherBlobs[0].lastModified,
          size: weatherBlobs[0].size,
          url: weatherBlobs[0].url
        },
        parsedAt: new Date().toISOString(),
        cachedResults: results.length - validResults.length
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

    console.log(`📡 [API GET] Listing blobs: ${containerName}`);

    const cacheKey = `${containerName}-list`;
    let blobs = getFromCache(blobListCache, cacheKey);

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
      setCache(blobListCache, cacheKey, blobs);
    }

    return NextResponse.json({
      success: true,
      container: containerName,
      blobCount: blobs.length,
      blobs: (blobs as BlobItem[]).map((blob: BlobItem) => ({
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