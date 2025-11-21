// app/api/containers/list/route.ts
import { NextResponse } from 'next/server';
import { BlobServiceClient } from '@azure/storage-blob';

export async function GET() {
  try {
    console.log('📡 [API] Fetching list of containers from Azure Storage');

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    
    if (!connectionString) {
      throw new Error('Azure Storage connection string not found in environment variables');
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containers = [];
    
    // List all containers
    for await (const container of blobServiceClient.listContainers({
      includeMetadata: true
    })) {
      // Filter for weather station containers (starting with 'ws-')
      // You can modify this filter based on your naming convention
      if (container.name.startsWith('ws-')) {
        containers.push({
          name: container.name,
          lastModified: container.properties.lastModified,
          metadata: container.metadata
        });
      }
    }

    console.log(`✅ [API] Found ${containers.length} weather station containers`);

    return NextResponse.json({
      success: true,
      containers,
      total: containers.length
    }, { status: 200 });

  } catch (error) {
    console.error('❌ [API] Error listing containers:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to list containers',
        details: errorMessage 
      },
      { status: 500 }
    );
  }
}

// Optional: Add POST endpoint if you need to filter by specific criteria
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { prefix = 'ws-', includeAll = false } = body;

    console.log(`📡 [API POST] Fetching containers with prefix: ${prefix}`);

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    
    if (!connectionString) {
      throw new Error('Azure Storage connection string not found in environment variables');
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containers = [];
    
    // List all containers
    for await (const container of blobServiceClient.listContainers({
      includeMetadata: true
    })) {
      // Apply filter based on includeAll flag
      if (includeAll || container.name.startsWith(prefix)) {
        containers.push({
          name: container.name,
          lastModified: container.properties.lastModified,
          metadata: container.metadata
        });
      }
    }

    console.log(`✅ [API POST] Found ${containers.length} containers`);

    return NextResponse.json({
      success: true,
      containers,
      total: containers.length,
      filter: { prefix, includeAll }
    }, { status: 200 });

  } catch (error) {
    console.error('❌ [API POST] Error listing containers:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to list containers',
        details: errorMessage 
      },
      { status: 500 }
    );
  }
}