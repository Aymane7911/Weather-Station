// app/api/weather-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';
import { csvParser } from '@/lib/csvParser';

export async function POST(request: NextRequest) {
  try {
    // Parse request body (containerName is optional, defaults to 'ws-tawyeen')
    const body = await request.json().catch(() => ({}));
    const containerName = body.containerName || 'ws-tawyeen';

    console.log(`📡 [API] Fetching weather data from container: ${containerName}`);

    // Initialize Azure Blob Service
    const azureService = new AzureBlobService(containerName);

    // Check if container exists
    const containerExists = await azureService.containerExists();
    if (!containerExists) {
      return NextResponse.json(
        { error: `Container '${containerName}' does not exist` },
        { status: 404 }
      );
    }

    // List all blobs in the container
    const blobs = await azureService.listBlobs();
    console.log(`📋 [API] Found ${blobs.length} blobs in container`);

    if (blobs.length === 0) {
      return NextResponse.json(
        { error: 'No files found in container' },
        { status: 404 }
      );
    }

    // Find all weather CSV files and sort by modified date
    const weatherBlobs = blobs.filter(blob => blob.name.endsWith('.csv'));

    if (weatherBlobs.length === 0) {
      return NextResponse.json(
        { error: 'No CSV files found in container' },
        { status: 404 }
      );
    }

    console.log(`📄 [API] Found ${weatherBlobs.length} CSV files, processing all for historical data`);

    // Download and parse all CSV files to build historical timeline
    const allDataWithTimestamps: any[] = [];

    for (const blob of weatherBlobs) {
      try {
        console.log(`📄 [API] Downloading blob: ${blob.name}`);
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
          // Use the blob's last modified time as the timestamp for this data point
          const blobTime = blob.lastModified ? new Date(blob.lastModified) : new Date();
          
          // Add timestamp to the data row (assuming each CSV has one measurement)
          const dataRow = {
            ...parsed.data[0], // Take the first (and likely only) row
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

    // Sort by timestamp (oldest to newest)
    allDataWithTimestamps.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    console.log(`✅ [API] Combined ${allDataWithTimestamps.length} data points from ${weatherBlobs.length} files`);

    // Check if we have any data
    if (!allDataWithTimestamps || allDataWithTimestamps.length === 0) {
      return NextResponse.json(
        { error: 'Failed to parse CSV data or no data rows found' },
        { status: 500 }
      );
    }

    // Extract metadata from the latest file
    const latestBlob = weatherBlobs[0];

    // Return successful response
    return NextResponse.json({
      success: true,
      data: allDataWithTimestamps,
      metadata: {
        totalRows: allDataWithTimestamps.length,
        totalFiles: weatherBlobs.length,
        headers: Object.keys(allDataWithTimestamps[0] || {}).filter(k => 
          !['time', 'timestamp', 'fullDateTime', 'blobName'].includes(k)
        ),
        blobInfo: {
          name: latestBlob.name,
          lastModified: latestBlob.lastModified,
          size: latestBlob.size,
          url: latestBlob.url
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

// Optional: Add GET endpoint to list available blobs in ws-tawyeen container
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const containerName = searchParams.get('container') || 'ws-tawyeen';

    console.log(`📡 [API GET] Listing blobs in container: ${containerName}`);

    const azureService = new AzureBlobService(containerName);
    
    // Check if container exists
    const containerExists = await azureService.containerExists();
    if (!containerExists) {
      return NextResponse.json(
        { error: `Container '${containerName}' does not exist` },
        { status: 404 }
      );
    }

    const blobs = await azureService.listBlobs();

    return NextResponse.json({
      success: true,
      container: containerName,
      blobCount: blobs.length,
      blobs: blobs.map(blob => ({
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