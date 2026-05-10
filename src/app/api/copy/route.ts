// app/api/copy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';

// SOURCE:      ws-fpo   → AZURE_STORAGE_CONNECTION_STRING (index 0)
// DESTINATION: weather  → AZURE_STORAGE_CONNECTION_STRING2 (index 2)
const SOURCE_CONTAINER = 'ws-fpo';
const DEST_CONTAINER   = 'weather';

async function runCopy(): Promise<NextResponse> {
  try {
    const sourceService = new AzureBlobService(SOURCE_CONTAINER, 0);
    const destService   = new AzureBlobService(DEST_CONTAINER,   2);

    // 1. List blobs already in DESTINATION
    let destBlobNames = new Set<string>();
    try {
      const destBlobs = await destService.listBlobs();
      destBlobNames   = new Set(destBlobs.map((b: any) => b.name));
      console.log(`📋 [copy] ${destBlobNames.size} blobs already in ${DEST_CONTAINER}`);
    } catch {
      console.log(`ℹ️ [copy] Could not list destination blobs — will attempt to copy all`);
    }

    // 2. List all blobs in SOURCE
    const allBlobs = await sourceService.listBlobs();
    console.log(`📋 [copy] All blobs in source (${SOURCE_CONTAINER}):`, allBlobs.map((b: any) => b.name));

    // 3. Filter by extension (case-insensitive)
    const dataBlobs = allBlobs.filter(
      (b: any) =>
        b.name.toLowerCase().endsWith('.json') ||
        b.name.toLowerCase().endsWith('.csv')
    );
    console.log(`📋 [copy] Data blobs after filter:`, dataBlobs.map((b: any) => b.name));
    console.log(`📋 [copy] ${dataBlobs.length} data blobs found in ${SOURCE_CONTAINER}`);

    // 4. Find blobs not yet in destination
    const newBlobs = dataBlobs.filter((b: any) => !destBlobNames.has(b.name));
    console.log(`📋 [copy] ${newBlobs.length} new blobs to copy to ${DEST_CONTAINER}`);

    if (newBlobs.length === 0) {
      return NextResponse.json({
        success:     true,
        message:     'Nothing new to copy',
        totalInDest: destBlobNames.size,
      });
    }

    // 5. Copy each new blob
    const copiedBlobs:  string[] = [];
    const skippedBlobs: string[] = [];

    for (const blob of newBlobs) {
      let content = '';
      try {
        content = await sourceService.downloadBlob(blob.name);
      } catch (err) {
        console.warn(`⚠️ [copy] Could not download ${blob.name}:`, err);
        skippedBlobs.push(blob.name);
        continue;
      }

      try {
        const contentType = blob.name.toLowerCase().endsWith('.json') ? 'application/json' : 'text/csv';
        await destService.uploadBlob(blob.name, content, contentType);
        copiedBlobs.push(blob.name);
        console.log(`📤 [copy] Copied: ${blob.name} → ${DEST_CONTAINER}`);
      } catch (err) {
        console.warn(`⚠️ [copy] Failed to upload ${blob.name}:`, err);
        skippedBlobs.push(blob.name);
      }
    }

    console.log(`✅ [copy] Done — ${copiedBlobs.length} copied, ${skippedBlobs.length} skipped`);

    return NextResponse.json({
      success:      true,
      source:       SOURCE_CONTAINER,
      destination:  DEST_CONTAINER,
      copiedBlobs:  copiedBlobs.length,
      skippedBlobs: skippedBlobs.length,
      copied:       copiedBlobs,
      skipped:      skippedBlobs,
      totalInDest:  destBlobNames.size + copiedBlobs.length,
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [copy] Failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // ── Azure EventGrid webhook validation (GET with ?validationCode=...) ──────
  const validationCode = request.nextUrl.searchParams.get('validationCode');
  if (validationCode) {
    console.log('🔐 [copy] Azure webhook GET validation');
    return NextResponse.json({ validationResponse: validationCode });
  }

  console.log(`⏰ [copy] GET trigger — ${SOURCE_CONTAINER} → ${DEST_CONTAINER}`);
  return runCopy();
}

export async function POST(request: NextRequest) {
  // ── Azure EventGrid validation (POST with JSON body) ──────────────────────
  let body: any;
  try {
    const text = await request.text();
    body = JSON.parse(text);
  } catch {
    body = {};
  }

  // Validation handshake — array with SubscriptionValidationEvent
  if (Array.isArray(body)) {
    const ev = body.find(
      (e: any) => e.eventType === 'Microsoft.EventGrid.SubscriptionValidationEvent'
    );
    if (ev) {
      console.log('🔐 [copy] Azure EventGrid POST validation handshake');
      return NextResponse.json({ validationResponse: ev.data.validationCode });
    }
    // Real blob-created events — run the copy
    console.log(`📨 [copy] EventGrid POST event received — running copy`);
    return runCopy();
  }

  // Manual POST trigger
  console.log(`🔧 [copy] Manual POST trigger — ${SOURCE_CONTAINER} → ${DEST_CONTAINER}`);
  return runCopy();
}