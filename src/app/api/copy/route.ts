// app/api/copy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';

const PAIRS: { source: string; sourceIndex: 0 | 1 | 2; dest: string; destIndex: 0 | 1 | 2 }[] = [
  { source: 'ws-fpo', sourceIndex: 0, dest: 'weather',    destIndex: 2 },
  { source: 'weather',    sourceIndex: 2, dest: 'ws-fpo', destIndex: 0 },
];

// ── Simple in-process lock to prevent concurrent runs ─────────────────────────
let isRunning = false;
let lastRunAt = 0;
const DEBOUNCE_MS = 10_000; // wait 10s before allowing another run

async function copyDirection(
  sourceContainer: string, sourceIndex: 0 | 1 | 2,
  destContainer:   string, destIndex:   0 | 1 | 2
) {
  const sourceService = new AzureBlobService(sourceContainer, sourceIndex);
  const destService   = new AzureBlobService(destContainer,   destIndex);

  let destBlobNames = new Set<string>();
  try {
    const destBlobs = await destService.listBlobs();
    destBlobNames   = new Set(destBlobs.map((b: any) => b.name));
  } catch {}

  const allBlobs  = await sourceService.listBlobs();
  const dataBlobs = allBlobs.filter(
    (b: any) =>
      (b.name.toLowerCase().endsWith('.json') || b.name.toLowerCase().endsWith('.csv')) &&
      b.name !== 'aggregated.json'
  );

  const newBlobs = dataBlobs.filter((b: any) => !destBlobNames.has(b.name));
  if (newBlobs.length === 0) return { copied: 0, skipped: 0, blobs: [] };

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

  return { copied: copiedBlobs.length, skipped: skippedBlobs.length, blobs: copiedBlobs };
}

async function runCopy(): Promise<NextResponse> {
  const now = Date.now();

  // Debounce — if a run finished recently, skip
  if (now - lastRunAt < DEBOUNCE_MS) {
    return NextResponse.json({ success: true, message: 'Debounced — too soon since last run' });
  }

  // Lock — if already running, skip
  if (isRunning) {
    return NextResponse.json({ success: true, message: 'Already running — skipped' });
  }

  isRunning = true;
  lastRunAt = now;

  try {
    const results = await Promise.all(
      PAIRS.map(p => copyDirection(p.source, p.sourceIndex, p.dest, p.destIndex))
    );

    const [fwd, rev] = results;

    // Only log if something actually happened
    if (fwd.copied > 0 || rev.copied > 0) {
      console.log(`✅ [copy] fwd: ${fwd.copied} copied, rev: ${rev.copied} copied`);
    }

    return NextResponse.json({
      success: true,
      forward: { source: 'ws-tawyeen', dest: 'weather',    ...fwd },
      reverse: { source: 'weather',    dest: 'ws-tawyeen', ...rev },
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