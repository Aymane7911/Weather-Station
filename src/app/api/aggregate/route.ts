import { NextRequest, NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';
import { csvParser } from '@/lib/csvParser';

// SOURCE:      aqs-frc  → AZURE_STORAGE_CONNECTION_STRING1 (index 1)
// DESTINATION: weather  → AZURE_STORAGE_CONNECTION_STRING2 (index 2)
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
 * Parse a JSON blob from aqs-frc (IoT Hub format)
 */
function parseJsonBlob(content: string, blobName: string, lastModified: Date): any | null {
  try {
    const raw = JSON.parse(content);

    const body = decodeBody(raw.Body);
    if (!body) {
      console.warn(`⚠️ Could not decode Body for ${blobName}`);
      return null;
    }

    return {
      tempC:         body.temperature   ?? null,
      humidity:      body.humidity      ?? null,
      pressure:      body.pressure      ?? null,
      latitude:      body.latitude      ?? null,
      longitude:     body.longitude     ?? null,
      altitude:      body.altitude      ?? null,
      irradiance:    null,
      avgWindSpeed:  null,
      direction:     null,
      compassDir:    null,
      rainRatePerHour: null,
      time: body.timestamp
        ? new Date(body.timestamp).toISOString()
        : raw.EnqueuedTimeUtc
        ? new Date(raw.EnqueuedTimeUtc).toISOString()
        : new Date(lastModified).toISOString(),
      blobName,
      source: 'iot-hub-json'
    };
  } catch (err) {
    console.warn(`⚠️ Failed to parse JSON blob ${blobName}:`, err);
    return null;
  }
}

/**
 * Parse a CSV blob
 */
async function parseCsvBlob(content: string, blobName: string, lastModified: Date): Promise<any | null> {
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
    if (!row) return null;

    return {
      ...row,
      time: new Date(lastModified).toISOString(),
      blobName,
      source: 'csv'
    };
  } catch (err) {
    console.warn(`⚠️ Failed to parse CSV blob ${blobName}:`, err);
    return null;
  }
}

async function runAggregation(): Promise<NextResponse> {
  try {
    // Source:      aqs-frc  (STRING1 → index 1)
    // Destination: weather  (STRING2 → index 2)
    const sourceService = new AzureBlobService(SOURCE_CONTAINER, 1);
    const destService   = new AzureBlobService(DEST_CONTAINER,   2);

    // 1. Load existing aggregated.json from DESTINATION (weather / STRING2)
    let existingData: any[]    = [];
    let lastProcessedBlob      = '';

    try {
      const existing = await destService.downloadBlob('aggregated.json');
      const parsed   = JSON.parse(existing);
      existingData       = parsed.data              || [];
      lastProcessedBlob  = parsed.lastProcessedBlob || '';
      console.log(`✅ Loaded ${existingData.length} existing data points from ${DEST_CONTAINER}`);
    } catch {
      console.log(`ℹ️ No existing aggregated.json in ${DEST_CONTAINER} — will create it`);
    }

    // 2. List all blobs from SOURCE (aqs-frc / STRING1)
    //    Accept .json and .csv, exclude aggregated.json itself
    const allBlobs  = await sourceService.listBlobs();
    const dataBlobs = allBlobs
      .filter(b =>
        (b.name.endsWith('.json') || b.name.endsWith('.csv')) &&
        b.name !== 'aggregated.json'
      )
      .sort((a, b) =>
        new Date(a.lastModified!).getTime() - new Date(b.lastModified!).getTime()
      );

    console.log(`📋 Found ${dataBlobs.length} data blobs (JSON + CSV) in ${SOURCE_CONTAINER}`);

    // 3. Find only new blobs since last run
    const lastIdx  = dataBlobs.findIndex(b => b.name === lastProcessedBlob);
    const newBlobs = lastIdx === -1 ? dataBlobs : dataBlobs.slice(lastIdx + 1);

    console.log(`📋 ${newBlobs.length} new blobs to process from ${SOURCE_CONTAINER}`);

    if (newBlobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nothing new to process',
        totalPoints: existingData.length
      });
    }

    // 4. Download and parse new blobs
    const newData: any[] = [];
    for (const blob of newBlobs) {
      try {
        const content     = await sourceService.downloadBlob(blob.name);
        const lastModified = blob.lastModified ? new Date(blob.lastModified) : new Date();

        let row: any | null = null;

        if (blob.name.endsWith('.json')) {
          row = parseJsonBlob(content, blob.name, lastModified);
        } else if (blob.name.endsWith('.csv')) {
          row = await parseCsvBlob(content, blob.name, lastModified);
        }

        if (row) newData.push(row);
      } catch (err) {
        console.warn(`⚠️ Skipped ${blob.name}:`, err);
      }
    }

    // 5. Merge and upload to DESTINATION (weather / STRING2)
    const allData  = [...existingData, ...newData];
    const lastBlob = dataBlobs[dataBlobs.length - 1];

    const aggregated = JSON.stringify({
      lastProcessedBlob: lastBlob?.name || lastProcessedBlob,
      lastUpdated:       new Date().toISOString(),
      totalPoints:       allData.length,
      data:              allData
    });

    await destService.uploadBlob('aggregated.json', aggregated, 'application/json');

    console.log(`✅ Done — ${allData.length} total points (${newData.length} new) → saved to ${DEST_CONTAINER}`);

    return NextResponse.json({
      success:           true,
      source:            SOURCE_CONTAINER,
      destination:       DEST_CONTAINER,
      newPoints:         newData.length,
      totalPoints:       allData.length,
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

  console.log(`⏰ [TRIGGER] Running aggregation: ${SOURCE_CONTAINER} → ${DEST_CONTAINER}`);
  return runAggregation();
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
  return runAggregation();
}