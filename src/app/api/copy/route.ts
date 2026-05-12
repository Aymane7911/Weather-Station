// app/api/copy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';

const SOURCE_CONTAINER = 'ws-fpo';
const DEST_CONTAINER   = 'weather';

// ── Debounce + lock to prevent concurrent/flooding runs ───────────────────────
let isRunning = false;
let lastRunAt = 0;
const DEBOUNCE_MS = 10_000; // 10 seconds between runs

async function runCopy(): Promise<NextResponse> {
  const now = Date.now();

  if (now - lastRunAt < DEBOUNCE_MS) {
    return NextResponse.json({ success: true, message: 'Debounced — too soon since last run' });
  }

  if (isRunning) {
    return NextResponse.json({ success: true, message: 'Already running — skipped' });
  }

  isRunning = true;
  lastRunAt = now;

  try {
    const sourceService = new AzureBlobService(SOURCE_CONTAINER, 0);
    const destService   = new AzureBlobService(DEST_CONTAINER,   2);

    // 1. List blobs already in destination
    let destBlobNames = new Set<string>();
    try {
      const destBlobs = await destService.listBlobs();
      destBlobNames   = new Set(destBlobs.map((b: any) => b.name));
    } catch {}

    // 2. List blobs in source
    const allBlobs  = await sourceService.listBlobs();
    const dataBlobs = allBlobs.filter(
      (b: any) =>
        (b.name.toLowerCase().endsWith('.json') || b.name.toLowerCase().endsWith('.csv')) &&
        b.name !== 'aggregated.json'
    );

    // 3. Find new blobs only
    const newBlobs = dataBlobs.filter((b: any) => !destBlobNames.has(b.name));

    if (newBlobs.length === 0) {
      return NextResponse.json({ success: true, message: 'Nothing new to copy' });
    }

    // 4. Copy each new blob
    const copiedBlobs:  string[] = [];
    const skippedBlobs: string[] = [];

    for (const blob of newBlobs) {
      let content = '';
      try {
        content = await sourceService.downloadBlob(blob.name);
      } catch {
        skippedBlobs.push(blob.name);
        continue;
      }
      try {
        const contentType = blob.name.toLowerCase().endsWith('.json')
          ? 'application/json' : 'text/csv';
        await destService.uploadBlob(blob.name, content, contentType);
        copiedBlobs.push(blob.name);
      } catch {
        skippedBlobs.push(blob.name);
      }
    }

    // Only log if something happened
    if (copiedBlobs.length > 0) {
      console.log(`✅ [copy] ${copiedBlobs.length} copied, ${skippedBlobs.length} skipped`);
    }

    return NextResponse.json({
      success:      true,
      source:       SOURCE_CONTAINER,
      destination:  DEST_CONTAINER,
      copiedBlobs:  copiedBlobs.length,
      skippedBlobs: skippedBlobs.length,
      copied:       copiedBlobs,
      skipped:      skippedBlobs,
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [copy] Failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    isRunning = false;
  }
}

export async function GET(request: NextRequest) {
  const validationCode = request.nextUrl.searchParams.get('validationCode');
  if (validationCode) {
    return NextResponse.json({ validationResponse: validationCode });
  }
  return runCopy();
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    const text = await request.text();
    body = JSON.parse(text);
  } catch {
    body = {};
  }

  if (Array.isArray(body)) {
    const ev = body.find(
      (e: any) => e.eventType === 'Microsoft.EventGrid.SubscriptionValidationEvent'
    );
    if (ev) {
      return NextResponse.json({ validationResponse: ev.data.validationCode });
    }
    return runCopy();
  }

  return runCopy();
}