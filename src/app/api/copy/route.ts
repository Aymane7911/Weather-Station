import { NextRequest, NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';

// SOURCE:      aqs-frc → AZURE_STORAGE_CONNECTION_STRING1 (index 1)
// DESTINATION: weather → AZURE_STORAGE_CONNECTION_STRING2 (index 2)
const SOURCE_CONTAINER = 'aqs-frc';
const DEST_CONTAINER   = 'weather';

async function runCopy(): Promise<NextResponse> {
  try {
    const sourceService = new AzureBlobService(SOURCE_CONTAINER, 1);
    const destService   = new AzureBlobService(DEST_CONTAINER,   2);

    // 1. List all blobs already in DESTINATION
    let destBlobNames = new Set<string>();
    try {
      const destBlobs = await destService.listBlobs();
      destBlobNames   = new Set(destBlobs.map((b: any) => b.name));
      console.log(`📋 ${destBlobNames.size} blobs already in ${DEST_CONTAINER}`);
    } catch {
      console.log(`ℹ️ Could not list destination blobs — will attempt to copy all`);
    }

    // 2. List all data blobs in SOURCE
    const allBlobs  = await sourceService.listBlobs();
    const dataBlobs = allBlobs.filter(
      (b: any) => b.name.endsWith('.json') || b.name.endsWith('.csv')
    );

    console.log(`📋 ${dataBlobs.length} data blobs found in ${SOURCE_CONTAINER}`);

    // 3. Find blobs not yet in destination
    const newBlobs = dataBlobs.filter((b: any) => !destBlobNames.has(b.name));

    console.log(`📋 ${newBlobs.length} new blobs to copy to ${DEST_CONTAINER}`);

    if (newBlobs.length === 0) {
      return NextResponse.json({
        success:     true,
        message:     'Nothing new to copy',
        totalInDest: destBlobNames.size
      });
    }

    // 4. Copy each new blob to destination
    const copiedBlobs:  string[] = [];
    const skippedBlobs: string[] = [];

    for (const blob of newBlobs) {
      let content = '';

      try {
        content = await sourceService.downloadBlob(blob.name);
      } catch (err) {
        console.warn(`⚠️ Could not download ${blob.name}:`, err);
        skippedBlobs.push(blob.name);
        continue;
      }

      try {
        const contentType = blob.name.endsWith('.json') ? 'application/json' : 'text/csv';
        await destService.uploadBlob(blob.name, content, contentType);
        copiedBlobs.push(blob.name);
        console.log(`📤 Copied: ${blob.name} → ${DEST_CONTAINER}`);
      } catch (err) {
        console.warn(`⚠️ Failed to copy ${blob.name}:`, err);
        skippedBlobs.push(blob.name);
      }
    }

    console.log(`✅ Done — ${copiedBlobs.length} blobs copied, ${skippedBlobs.length} skipped`);

    return NextResponse.json({
      success:      true,
      source:       SOURCE_CONTAINER,
      destination:  DEST_CONTAINER,
      copiedBlobs:  copiedBlobs.length,
      skippedBlobs: skippedBlobs.length,
      copied:       copiedBlobs,
      skipped:      skippedBlobs,
      totalInDest:  destBlobNames.size + copiedBlobs.length
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Copy failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const validationCode = request.nextUrl.searchParams.get('validationCode');
  if (validationCode) {
    console.log('🔐 Azure webhook validation request received');
    return NextResponse.json({ validationResponse: validationCode });
  }

  console.log(`⏰ [TRIGGER] Copying new blobs: ${SOURCE_CONTAINER} → ${DEST_CONTAINER}`);
  return runCopy();
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  if (Array.isArray(body)) {
    const validationEvent = body.find(
      (e: any) => e.eventType === 'Microsoft.EventGrid.SubscriptionValidationEvent'
    );
    if (validationEvent) {
      console.log('🔐 Azure webhook validation event received');
      return NextResponse.json({ validationResponse: validationEvent.data.validationCode });
    }
  }

  console.log(`🔧 [MANUAL] Copying new blobs: ${SOURCE_CONTAINER} → ${DEST_CONTAINER}`);
  return runCopy();
}