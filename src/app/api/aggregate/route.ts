// app/api/aggregate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';
import { csvParser } from '@/lib/csvParser';

/**
 * Generic aggregation route.
 * Works for ALL containers regardless of which storage account they live in.
 *
 * Pass { containerName, connectionIndex } in the query string (GET) or body (POST).
 *
 * Examples:
 *   GET  /api/aggregate?container=ws-tawyeen&index=0
 *   GET  /api/aggregate?container=weather&index=2&force=true
 *   POST /api/aggregate  { "containerName": "ws-honeypark", "connectionIndex": 0 }
 */

async function runAggregation(
  containerName:   string,
  connectionIndex: 0 | 1 | 2,
  force = false
): Promise<NextResponse> {
  try {
    const service = new AzureBlobService(containerName, connectionIndex);

    // 1. Load existing aggregated.json
    let existingData: any[]  = [];
    let lastProcessedBlob    = '';

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

    // 2. List all CSV blobs (sorted oldest → newest)
    const allBlobs  = await service.listBlobs();
    const csvBlobs  = allBlobs
      .filter(b => b.name.endsWith('.csv') && b.name !== 'aggregated.json')
      .sort((a, b) =>
        new Date(a.lastModified!).getTime() - new Date(b.lastModified!).getTime()
      );

    console.log(`📋 [aggregate] ${csvBlobs.length} CSV blobs found in ${containerName}`);

    // 3. Find new blobs since last run
    const lastIdx  = force ? -1 : csvBlobs.findIndex(b => b.name === lastProcessedBlob);
    const newBlobs = lastIdx === -1 ? csvBlobs : csvBlobs.slice(lastIdx + 1);

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
      try {
        const content = await service.downloadBlob(blob.name);
        const parsed  = await csvParser.parseFromString(content, {
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
        if (row) {
          newData.push({
            ...row,
            time:     new Date(blob.lastModified!).toISOString(),
            blobName: blob.name,
          });
        }
      } catch (err) {
        console.warn(`⚠️ [aggregate] Skipped ${blob.name}:`, err);
      }
    }

    // 5. Merge and save aggregated.json back into the SAME container
    const allData  = [...existingData, ...newData];
    const lastBlob = csvBlobs[csvBlobs.length - 1];

    const aggregated = JSON.stringify({
      lastProcessedBlob: lastBlob?.name || lastProcessedBlob,
      lastUpdated:       new Date().toISOString(),
      totalPoints:       allData.length,
      data:              allData,
    });

    await service.uploadBlob('aggregated.json', aggregated, 'application/json');

    console.log(
      `✅ [aggregate] Done — ${allData.length} total points (${newData.length} new) → ` +
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

export async function GET(request: NextRequest) {
  // Azure EventGrid webhook validation handshake
  const validationCode = request.nextUrl.searchParams.get('validationCode');
  if (validationCode) {
    return NextResponse.json({ validationResponse: validationCode });
  }

  const container = request.nextUrl.searchParams.get('container') || 'ws-tawyeen';
  const rawIndex  = parseInt(request.nextUrl.searchParams.get('index') || '0');
  const index     = ([0, 1, 2].includes(rawIndex) ? rawIndex : 0) as 0 | 1 | 2;
  const force     = request.nextUrl.searchParams.get('force') === 'true';

  console.log(`⏰ [aggregate] GET trigger — container: ${container}, index: ${index}, force: ${force}`);
  return runAggregation(container, index, force);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  // Azure EventGrid validation via POST
  if (Array.isArray(body)) {
    const ev = body.find((e: any) => e.eventType === 'Microsoft.EventGrid.SubscriptionValidationEvent');
    if (ev) {
      return NextResponse.json({ validationResponse: ev.data.validationCode });
    }
  }

  const container = body.containerName   || 'ws-tawyeen';
  const rawIndex  = body.connectionIndex ?? 0;
  const index     = ([0, 1, 2].includes(rawIndex) ? rawIndex : 0) as 0 | 1 | 2;
  const force     = body.force === true;

  console.log(`🔧 [aggregate] POST trigger — container: ${container}, index: ${index}, force: ${force}`);
  return runAggregation(container, index, force);
}