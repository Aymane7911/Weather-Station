// app/api/copy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';

const PAIRS: { source: string; sourceIndex: 0 | 1 | 2; dest: string; destIndex: 0 | 1 | 2 }[] = [
  { source: 'ws-tawyeen', sourceIndex: 0, dest: 'weather',    destIndex: 2 },
  { source: 'weather',    sourceIndex: 2, dest: 'ws-tawyeen', destIndex: 0 },
];

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
    console.log(`📋 [copy] ${destBlobNames.size} blobs already in ${destContainer}`);
  } catch {
    console.log(`ℹ️ [copy] Could not list ${destContainer} — will copy all`);
  }

  const allBlobs  = await sourceService.listBlobs();
  const dataBlobs = allBlobs.filter(
    (b: any) =>
      (b.name.toLowerCase().endsWith('.json') || b.name.toLowerCase().endsWith('.csv')) &&
      b.name !== 'aggregated.json'
  );

  const newBlobs = dataBlobs.filter((b: any) => !destBlobNames.has(b.name));
  console.log(`📋 [copy] ${sourceContainer} → ${destContainer}: ${newBlobs.length} new blobs`);

  if (newBlobs.length === 0) return { copied: 0, skipped: 0, blobs: [] };

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
      const contentType = blob.name.toLowerCase().endsWith('.json')
        ? 'application/json' : 'text/csv';
      await destService.uploadBlob(blob.name, content, contentType);
      copiedBlobs.push(blob.name);
      console.log(`📤 [copy] ${sourceContainer} → ${destContainer}: ${blob.name}`);
    } catch (err) {
      console.warn(`⚠️ [copy] Failed to upload ${blob.name}:`, err);
      skippedBlobs.push(blob.name);
    }
  }

  return { copied: copiedBlobs.length, skipped: skippedBlobs.length, blobs: copiedBlobs };
}

async function runCopy(): Promise<NextResponse> {
  try {
    const results = await Promise.all(
      PAIRS.map(p => copyDirection(p.source, p.sourceIndex, p.dest, p.destIndex))
    );

    const [fwd, rev] = results;

    console.log(`✅ [copy] Done — fwd: ${fwd.copied} copied, rev: ${rev.copied} copied`);

    return NextResponse.json({
      success: true,
      forward: { source: 'ws-tawyeen', dest: 'weather',    ...fwd },
      reverse: { source: 'weather',    dest: 'ws-tawyeen', ...rev },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [copy] Failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const validationCode = request.nextUrl.searchParams.get('validationCode');
  if (validationCode) {
    console.log('🔐 [copy] Azure webhook GET validation');
    return NextResponse.json({ validationResponse: validationCode });
  }
  console.log(`⏰ [copy] GET trigger — bidirectional sync`);
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
      console.log('🔐 [copy] Azure EventGrid POST validation handshake');
      return NextResponse.json({ validationResponse: ev.data.validationCode });
    }
    console.log(`📨 [copy] EventGrid POST event — running bidirectional sync`);
    return runCopy();
  }

  console.log(`🔧 [copy] Manual POST trigger — bidirectional sync`);
  return runCopy();
}