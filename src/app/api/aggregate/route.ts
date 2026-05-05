import { NextRequest, NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';
import { csvParser } from '@/lib/csvParser';

// SOURCE:      aqs-frc → AZURE_STORAGE_CONNECTION_STRING1 (index 1)
// DESTINATION: weather → AZURE_STORAGE_CONNECTION_STRING2 (index 2)
const SOURCE_CONTAINER = 'aqs-frc';
const DEST_CONTAINER   = 'weather';

/**
 * Decode a Base64 encoded JSON body from IoT Hub blob format
 */
function decodeBody(base64: string): any {
  try {
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Safely parse potentially concatenated JSON objects.
 * IoT Hub sometimes writes multiple events into one blob file like:
 * {"event1"...}{"event2"...}
 * This function extracts all valid JSON objects from the content.
 */
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
          const obj = JSON.parse(content.slice(start, i + 1));
          results.push(obj);
        } catch {
          // skip malformed object
        }
        start = -1;
      }
    }
  }

  return results;
}

/**
 * Parse a JSON blob from aqs-frc (IoT Hub format)
 * Handles single or concatenated JSON objects in one blob
 */
function parseJsonBlob(content: string, blobName: string, lastModified: Date): any[] {
  try {
    const rawObjects = extractJsonObjects(content);

    if (rawObjects.length === 0) {
      console.warn(`⚠️ No valid JSON objects found in ${blobName}`);
      return [];
    }

    const results: any[] = [];

    for (const raw of rawObjects) {
      const body = decodeBody(raw.Body);
      if (!body) {
        console.warn(`⚠️ Could not decode Body in ${blobName}`);
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
        source: 'iot-hub-json'
      });
    }

    return results;
  } catch (err) {
    console.warn(`⚠️ Failed to parse JSON blob ${blobName}:`, err);
    return [];
  }
}

/**
 * Parse a CSV blob
 */
async function parseCsvBlob(content: string, blobName: string, lastModified: Date): Promise<any[]> {
  try {
    const parsed = await csvParser.parseFromString(content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      transform: (value: string, field: string | number) => {
        if (typeof value !== 'string') return value;
        value = value.trim();
        if (!value || value.toLowerCase() === 'null') return null;
        const numericFields = ['tempC', 'humidity', 'pressure', 'irradiance', 'avgWindSpeed', 'rainRatePerHour', 'direction'];
        if (numericFields.includes(String(field))) {
          const num = parseFloat(value);
          if (!isNaN(num) && isFinite(num)) return num;
        }
        return value;
      }
    });

    const row = parsed.data?.[0];
    if (!row) return [];

    return [{
      ...row,
      time: new Date(lastModified).toISOString(),
      blobName,
      source: 'csv'
    }];
  } catch (err) {
    console.warn(`⚠️ Failed to parse CSV blob ${blobName}:`, err);
    return [];
  }
}

async function runAggregation(force = false): Promise<NextResponse> {
  try {
    const sourceService = new AzureBlobService(SOURCE_CONTAINER, 1);
    const destService   = new AzureBlobService(DEST_CONTAINER,   2);

    // 1. Load existing aggregated.json from DESTINATION (weather)
    let existingData: any[] = [];
    let lastProcessedBlob   = '';

    if (force) {
      console.log(`⚡ [FORCE] Skipping existing data — reprocessing all blobs from ${SOURCE_CONTAINER}`);
    } else {
      try {
        const existing = await destService.downloadBlob('aggregated.json');
        const parsed   = JSON.parse(existing);
        existingData      = parsed.data              || [];
        lastProcessedBlob = parsed.lastProcessedBlob || '';
        console.log(`✅ Loaded ${existingData.length} existing data points from ${DEST_CONTAINER}`);
      } catch {
        console.log(`ℹ️ No existing aggregated.json in ${DEST_CONTAINER} — will create it`);
      }
    }

    // 2. Load the set of blob names already present in DESTINATION
    //    This is used exclusively to decide whether to copy a raw blob —
    //    it is independent from the parse cursor (lastProcessedBlob).
    let destBlobNames = new Set<string>();
    try {
      const destBlobs = await destService.listBlobs();
      destBlobNames   = new Set(destBlobs.map((b: any) => b.name));
      console.log(`📋 Found ${destBlobNames.size} blobs already in ${DEST_CONTAINER}`);
    } catch {
      console.log(`ℹ️ Could not list destination blobs — will attempt to copy all`);
    }

    // 3. List all blobs from SOURCE (aqs-frc)
    const allBlobs  = await sourceService.listBlobs();
    const dataBlobs = allBlobs
      .filter((b: any) =>
        (b.name.endsWith('.json') || b.name.endsWith('.csv')) &&
        b.name !== 'aggregated.json'
      )
      .sort((a: any, b: any) =>
        new Date(a.lastModified!).getTime() - new Date(b.lastModified!).getTime()
      );

    console.log(`📋 Found ${dataBlobs.length} data blobs (JSON + CSV) in ${SOURCE_CONTAINER}`);

    // 4. Find blobs to PARSE — those after the last processed cursor
    const lastIdx    = force ? -1 : dataBlobs.findIndex((b: any) => b.name === lastProcessedBlob);
    const parseBlobs = lastIdx === -1 ? dataBlobs : dataBlobs.slice(lastIdx + 1);

    console.log(`📋 ${parseBlobs.length} blobs to parse from ${SOURCE_CONTAINER}${force ? ' (forced)' : ''}`);

    // 5. Build the superset of blobs to download:
    //    - All parseBlobs (need content for aggregation)
    //    - All sourceBlobs NOT yet in destination (need content for raw copy)
    //    We deduplicate by name so each blob is downloaded at most once.
    const copyOnlyBlobs = dataBlobs.filter(
      (b: any) => !destBlobNames.has(b.name) && !parseBlobs.find((p: any) => p.name === b.name)
    );

    const parseBlobNames = new Set(parseBlobs.map((b: any) => b.name));
    const allBlobsToFetch = [
      ...parseBlobs,
      ...copyOnlyBlobs,
    ];

    console.log(`📋 ${copyOnlyBlobs.length} additional blobs to copy-only (not yet in ${DEST_CONTAINER})`);

    if (allBlobsToFetch.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nothing new to process or copy',
        totalPoints: existingData.length
      });
    }

    // 6. Download each blob — copy raw if not in destination, parse if in parseBlobs
    const newData: any[]         = [];
    const copiedBlobs: string[]  = [];
    const skippedBlobs: string[] = [];

    for (const blob of allBlobsToFetch) {
      let content = '';

      try {
        content = await sourceService.downloadBlob(blob.name);
      } catch (err) {
        console.warn(`⚠️ Could not download ${blob.name}:`, err);
        skippedBlobs.push(blob.name);
        continue;
      }

      const lastModified = blob.lastModified ? new Date(blob.lastModified) : new Date();

      // ── A. Copy raw blob ONLY if it does not already exist in DESTINATION ──
      //      This check is purely destination-based — force mode does NOT
      //      re-copy blobs that are already present.
      const alreadyInDest = destBlobNames.has(blob.name);
      if (!alreadyInDest) {
        try {
          const contentType = blob.name.endsWith('.json') ? 'application/json' : 'text/csv';
          await destService.uploadBlob(blob.name, content, contentType);
          copiedBlobs.push(blob.name);
          console.log(`📤 Copied raw blob: ${blob.name} → ${DEST_CONTAINER}`);
        } catch (err) {
          console.warn(`⚠️ Failed to copy ${blob.name}:`, err);
        }
      } else {
        console.log(`⏭️ Skipped copy (already exists in ${DEST_CONTAINER}): ${blob.name}`);
      }

      // ── B. Parse into normalized data points (only for parse-cursor blobs) ──
      if (parseBlobNames.has(blob.name)) {
        try {
          let rows: any[] = [];
          if (blob.name.endsWith('.json')) {
            rows = parseJsonBlob(content, blob.name, lastModified);
          } else if (blob.name.endsWith('.csv')) {
            rows = await parseCsvBlob(content, blob.name, lastModified);
          }
          newData.push(...rows);
        } catch (err) {
          console.warn(`⚠️ Failed to parse ${blob.name}:`, err);
        }
      }
    }

    // 7. Merge and upload aggregated.json to DESTINATION (weather)
    //    Only update aggregated.json if there were blobs to parse.
    if (parseBlobs.length === 0) {
      console.log(`ℹ️ No new blobs to parse — aggregated.json unchanged`);
      return NextResponse.json({
        success:           true,
        forced:            force,
        source:            SOURCE_CONTAINER,
        destination:       DEST_CONTAINER,
        newPoints:         0,
        totalPoints:       existingData.length,
        copiedBlobs:       copiedBlobs.length,
        skippedBlobs:      skippedBlobs.length,
        lastProcessedBlob: lastProcessedBlob,
        message:           'No new data to aggregate; raw copy-only blobs handled above'
      });
    }

    const allData  = [...existingData, ...newData];
    const lastBlob = dataBlobs[dataBlobs.length - 1];

    const aggregated = JSON.stringify({
      lastProcessedBlob: lastBlob?.name || lastProcessedBlob,
      lastUpdated:       new Date().toISOString(),
      totalPoints:       allData.length,
      data:              allData
    });

    await destService.uploadBlob('aggregated.json', aggregated, 'application/json');

    console.log(`✅ Done — ${allData.length} total points (${newData.length} new) → aggregated.json saved to ${DEST_CONTAINER}`);
    console.log(`📦 ${copiedBlobs.length} new raw blobs copied to ${DEST_CONTAINER}`);

    return NextResponse.json({
      success:           true,
      forced:            force,
      source:            SOURCE_CONTAINER,
      destination:       DEST_CONTAINER,
      newPoints:         newData.length,
      totalPoints:       allData.length,
      copiedBlobs:       copiedBlobs.length,
      skippedBlobs:      skippedBlobs.length,
      lastProcessedBlob: lastBlob?.name
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Aggregation failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const validationCode = request.nextUrl.searchParams.get('validationCode');
  if (validationCode) {
    console.log('🔐 Azure webhook validation request received');
    return NextResponse.json({ validationResponse: validationCode });
  }

  const force = request.nextUrl.searchParams.get('force') === 'true';
  console.log(`⏰ [TRIGGER] Running aggregation: ${SOURCE_CONTAINER} → ${DEST_CONTAINER}${force ? ' (FORCED)' : ''}`);
  return runAggregation(force);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  if (Array.isArray(body)) {
    const validationEvent = body.find((e: any) => e.eventType === 'Microsoft.EventGrid.SubscriptionValidationEvent');
    if (validationEvent) {
      console.log('🔐 Azure webhook validation event received');
      return NextResponse.json({ validationResponse: validationEvent.data.validationCode });
    }
  }

  console.log(`🔧 [MANUAL] Running aggregation: ${SOURCE_CONTAINER} → ${DEST_CONTAINER}`);
  return runAggregation(false);
}