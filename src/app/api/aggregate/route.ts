// app/api/aggregate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';
import { csvParser } from '@/lib/csvParser';

/**
 * Generic aggregation route.
 * Works for ALL containers regardless of which storage account they live in.
 * Handles both CSV blobs (ws-* stations) and JSON blobs (IoT Hub format, e.g. weather).
 *
 * GET  /api/aggregate?container=ws-tawyeen&index=0
 * GET  /api/aggregate?container=weather&index=2&force=true
 * POST /api/aggregate  { "containerName": "ws-honeypark", "connectionIndex": 0 }
 */

// ─── JSON (IoT Hub) helpers ───────────────────────────────────────────────────

function decodeBody(base64: string): any {
  try {
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

function extractJsonObjects(content: string): any[] {
  const results: any[] = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (content[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          results.push(JSON.parse(content.slice(start, i + 1)));
        } catch { /* skip malformed */ }
        start = -1;
      }
    }
  }
  return results;
}

function parseJsonBlob(content: string, blobName: string, lastModified: Date): any[] {
  const rawObjects = extractJsonObjects(content);
  if (rawObjects.length === 0) {
    console.warn(`⚠️ [aggregate] No valid JSON objects in ${blobName}`);
    return [];
  }

  const results: any[] = [];
  for (const raw of rawObjects) {
    const body = decodeBody(raw.Body);
    if (!body) {
      console.warn(`⚠️ [aggregate] Could not decode Body in ${blobName}`);
      continue;
    }
    results.push({
      tempC:           body.temperature ?? null,
      humidity:        body.humidity    ?? null,
      pressure:        body.pressure    ?? null,
      latitude:        body.latitude    ?? null,
      longitude:       body.longitude   ?? null,
      altitude:        body.altitude    ?? null,
      irradiance:      null,
      avgWindSpeed:    null,
      direction:       null,
      compassDir:      null,
      rainRatePerHour: null,
      time: body.timestamp
        ? new Date(body.timestamp).toISOString()
        : raw.EnqueuedTimeUtc
        ? new Date(raw.EnqueuedTimeUtc).toISOString()
        : new Date(lastModified).toISOString(),
      blobName,
      source: 'iot-hub-json',
    });
  }
  return results;
}

// ─── CSV helper ───────────────────────────────────────────────────────────────

async function parseCsvBlob(
  content: string,
  blobName: string,
  lastModified: Date
): Promise<any[]> {
  const parsed = await csvParser.parseFromString(content, {
    header:         true,
    skipEmptyLines: true,
    dynamicTyping:  false,
    transform: (value: string, field: string | number) => {
      if (typeof value !== 'string') return value;
      value = value.trim();
      if (!value || value.toLowerCase() === 'null') return null;
      const numericFields = [
        'tempC', 'humidity', 'pressure', 'irradiance',
        'avgWindSpeed', 'rainRatePerHour', 'direction',
      ];
      if (numericFields.includes(String(field))) {
        const num = parseFloat(value);
        if (!isNaN(num) && isFinite(num)) return num;
      }
      return value;
    },
  });

  const row = parsed.data?.[0];
  if (!row) return [];

  return [{
    ...row,
    time:     new Date(lastModified).toISOString(),
    blobName,
    source:   'csv',
  }];
}

// ─── Main aggregation ─────────────────────────────────────────────────────────

async function runAggregation(
  containerName:   string,
  connectionIndex: 0 | 1 | 2,
  force = false
): Promise<NextResponse> {
  try {
    const service = new AzureBlobService(containerName, connectionIndex);

    // 1. Load existing aggregated.json
    let existingData: any[] = [];
    let lastProcessedBlob   = '';

    if (force) {
      console.log(`⚡ [aggregate] FORCE — reprocessing all blobs in ${containerName}`);
    } else {
      try {
        const existing    = await service.downloadBlob('aggregated.json');
        const parsed      = JSON.parse(existing);
        existingData      = parsed.data              || [];
        lastProcessedBlob = parsed.lastProcessedBlob || '';
        console.log(`✅ [aggregate] Loaded ${existingData.length} existing points from ${containerName}`);
      } catch {
        console.log(`ℹ️ [aggregate] No aggregated.json in ${containerName} — will create it`);
      }
    }

    // 2. List all data blobs (CSV + JSON), exclude aggregated.json itself
    const allBlobs   = await service.listBlobs();
    const dataBlobs  = allBlobs
      .filter(b =>
        (b.name.endsWith('.csv') || b.name.endsWith('.json')) &&
        b.name !== 'aggregated.json'
      )
      .sort((a, b) =>
        new Date(a.lastModified!).getTime() - new Date(b.lastModified!).getTime()
      );

    console.log(`📋 [aggregate] ${dataBlobs.length} data blobs (CSV + JSON) found in ${containerName}`);

    // 3. Find new blobs since last run
    const lastIdx  = force ? -1 : dataBlobs.findIndex(b => b.name === lastProcessedBlob);
    const newBlobs = lastIdx === -1 ? dataBlobs : dataBlobs.slice(lastIdx + 1);

    console.log(`📋 [aggregate] ${newBlobs.length} new blobs to process${force ? ' (forced)' : ''}`);

    if (newBlobs.length === 0) {
      return NextResponse.json({
        success:     true,
        message:     'Nothing new to process',
        container:   containerName,
        totalPoints: existingData.length,
      });
    }

    // 4. Download + parse each new blob
    const newData: any[] = [];

    for (const blob of newBlobs) {
      let content = '';
      try {
        content = await service.downloadBlob(blob.name);
      } catch (err) {
        console.warn(`⚠️ [aggregate] Could not download ${blob.name}:`, err);
        continue;
      }

      const lastModified = blob.lastModified ? new Date(blob.lastModified) : new Date();

      try {
        let rows: any[] = [];

        if (blob.name.endsWith('.json')) {
          rows = parseJsonBlob(content, blob.name, lastModified);
        } else if (blob.name.endsWith('.csv')) {
          rows = await parseCsvBlob(content, blob.name, lastModified);
        }

        newData.push(...rows);
        console.log(`✅ [aggregate] Parsed ${rows.length} row(s) from ${blob.name}`);
      } catch (err) {
        console.warn(`⚠️ [aggregate] Failed to parse ${blob.name}:`, err);
      }
    }

    // 5. Merge and save aggregated.json back into the SAME container
    const allData  = [...existingData, ...newData];
    const lastBlob = dataBlobs[dataBlobs.length - 1];

    const aggregated = JSON.stringify({
      lastProcessedBlob: lastBlob?.name || lastProcessedBlob,
      lastUpdated:       new Date().toISOString(),
      totalPoints:       allData.length,
      data:              allData,
    });

    await service.uploadBlob('aggregated.json', aggregated, 'application/json');

    console.log(
      `✅ [aggregate] Done — ${allData.length} total (${newData.length} new) → ` +
      `aggregated.json saved in ${containerName} (index ${connectionIndex})`
    );

    return NextResponse.json({
      success:           true,
      forced:            force,
      container:         containerName,
      connectionIndex,
      newPoints:         newData.length,
      totalPoints:       allData.length,
      lastProcessedBlob: lastBlob?.name,
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [aggregate] Failed for ${containerName}:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const validationCode = request.nextUrl.searchParams.get('validationCode');
  if (validationCode) {
    return NextResponse.json({ validationResponse: validationCode });
  }

  const container = request.nextUrl.searchParams.get('container') || 'ws-tawyeen';
  const rawIndex  = parseInt(request.nextUrl.searchParams.get('index') || '0');
  const index     = ([0, 1, 2].includes(rawIndex) ? rawIndex : 0) as 0 | 1 | 2;
  const force     = request.nextUrl.searchParams.get('force') === 'true';

  console.log(`⏰ [aggregate] GET — container: ${container}, index: ${index}, force: ${force}`);
  return runAggregation(container, index, force);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  if (Array.isArray(body)) {
    const ev = body.find((e: any) => e.eventType === 'Microsoft.EventGrid.SubscriptionValidationEvent');
    if (ev) return NextResponse.json({ validationResponse: ev.data.validationCode });
  }

  const container = body.containerName   || 'ws-tawyeen';
  const rawIndex  = body.connectionIndex ?? 0;
  const index     = ([0, 1, 2].includes(rawIndex) ? rawIndex : 0) as 0 | 1 | 2;
  const force     = body.force === true;

  console.log(`🔧 [aggregate] POST — container: ${container}, index: ${index}, force: ${force}`);
  return runAggregation(container, index, force);
}