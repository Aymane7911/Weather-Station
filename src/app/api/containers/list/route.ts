// app/api/containers/list/route.ts
import { NextResponse } from 'next/server';
import { BlobServiceClient } from '@azure/storage-blob';

export async function GET() {
  try {
    console.log('📡 [API] Fetching ALL containers from Azure Storage');

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    
    if (!connectionString) {
      throw new Error('Azure Storage connection string not found in environment variables');
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containers = [];
    
    // Collect all containers at once using Promise-based approach
    const containerPromises: Promise<any>[] = [];
    
    for await (const container of blobServiceClient.listContainers({
      includeMetadata: true
    })) {
      // Push all containers that start with 'ws-' into array immediately
      if (container.name.startsWith('ws-')) {
        containers.push({
          name: container.name,
          lastModified: container.properties.lastModified,
          metadata: container.metadata || {},
          displayName: container.metadata?.displayName || container.name
        });
      }
    }

    // Sort containers by name for consistent ordering
    containers.sort((a, b) => a.name.localeCompare(b.name));

    console.log(`✅ [API] Found ${containers.length} weather station containers`);
    console.log(`📋 [API] Container names:`, containers.map(c => c.name));

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

// Optional: Add POST endpoint for filtered queries
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { prefix = 'ws-', includeAll = false } = body;

    console.log(`📡 [API POST] Fetching containers with prefix: ${prefix}, includeAll: ${includeAll}`);

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    
    if (!connectionString) {
      throw new Error('Azure Storage connection string not found in environment variables');
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containers = [];
    
    // Fetch all containers in one go
    for await (const container of blobServiceClient.listContainers({
      includeMetadata: true
    })) {
      // Apply filter based on includeAll flag
      if (includeAll || container.name.startsWith(prefix)) {
        containers.push({
          name: container.name,
          lastModified: container.properties.lastModified,
          metadata: container.metadata || {},
          displayName: container.metadata?.displayName || container.name
        });
      }
    }

    // Sort containers by name
    containers.sort((a, b) => a.name.localeCompare(b.name));

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