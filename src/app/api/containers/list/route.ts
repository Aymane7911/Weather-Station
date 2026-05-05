// app/api/containers/list/route.ts
import { NextResponse } from 'next/server';
import { BlobServiceClient } from '@azure/storage-blob';

/**
 * Each entry in SOURCES defines one Azure Storage account to query.
 * connectionIndex must match what AzureBlobService expects (0 | 1 | 2).
 * prefixes: only containers whose name starts with one of these are included.
 * If prefixes is empty / omitted, ALL containers from that account are included.
 */
const SOURCES: {
  envKey: string;
  connectionIndex: 0 | 1 | 2;
  prefixes: string[];
}[] = [
  {
    // wstation account — ws-tawyeen, ws-frc, ws-honeypark
    envKey:          'AZURE_STORAGE_CONNECTION_STRING',
    connectionIndex: 0,
    prefixes:        ['ws-'],
  },
  {
    // weatherstorage01 account — weather container
    envKey:          'AZURE_STORAGE_CONNECTION_STRING2',
    connectionIndex: 2,
    prefixes:        ['weather'],   // exact name match via startsWith
  },
];

async function listFromSource(source: typeof SOURCES[number]) {
  const connStr = process.env[source.envKey];
  if (!connStr) {
    console.warn(`⚠️ [containers/list] ${source.envKey} not set — skipping`);
    return [];
  }

  const client     = BlobServiceClient.fromConnectionString(connStr);
  const containers: any[] = [];

  for await (const c of client.listContainers({ includeMetadata: true })) {
    const include =
      source.prefixes.length === 0 ||
      source.prefixes.some(p => c.name.startsWith(p));

    if (include) {
      containers.push({
        name:            c.name,
        lastModified:    c.properties.lastModified,
        metadata:        c.metadata || {},
        displayName:     c.metadata?.displayName || c.name,
        connectionIndex: source.connectionIndex,   // ← key addition
      });
    }
  }

  console.log(
    `✅ [containers/list] ${source.envKey} → ${containers.length} containers:`,
    containers.map(c => c.name)
  );
  return containers;
}

export async function GET() {
  try {
    // Query all sources in parallel
    const results = await Promise.all(SOURCES.map(listFromSource));
    const containers = results.flat().sort((a, b) => a.name.localeCompare(b.name));

    console.log(`✅ [containers/list] Total: ${containers.length} containers across all accounts`);

    return NextResponse.json({
      success:    true,
      containers,
      total:      containers.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [containers/list] Error:', msg);
    return NextResponse.json(
      { success: false, error: 'Failed to list containers', details: msg },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // Keep POST for backward compat — just delegates to the same logic
  return GET();
}