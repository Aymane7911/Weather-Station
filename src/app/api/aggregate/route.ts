import { NextRequest, NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';
import { csvParser } from '@/lib/csvParser';

async function runAggregation(containerName: string): Promise<NextResponse> {
  try {
    const service = new AzureBlobService(containerName);
    const containerClient = (service as any).containerClient;

    // 1. Load existing aggregated data if it exists
    let existingData: any[] = [];
    let lastProcessedBlob = '';

    try {
      const existing = await service.downloadBlob('aggregated.json');
      const parsed = JSON.parse(existing);
      existingData = parsed.data || [];
      lastProcessedBlob = parsed.lastProcessedBlob || '';
      console.log(`✅ Loaded ${existingData.length} existing data points`);
    } catch {
      console.log('ℹ️ No existing aggregated.json — will create it');
    }

    // 2. Get all CSV blobs and find only the NEW ones since last run
    const allBlobs = await service.listBlobs();
    const csvBlobs = allBlobs
      .filter(b => b.name.endsWith('.csv'))
      .sort((a, b) =>
        new Date(a.lastModified!).getTime() - new Date(b.lastModified!).getTime()
      );

    const lastIdx = csvBlobs.findIndex(b => b.name === lastProcessedBlob);
    const newBlobs = lastIdx === -1 ? csvBlobs : csvBlobs.slice(lastIdx + 1);

    console.log(`📋 ${newBlobs.length} new blobs to process`);

    if (newBlobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nothing new to process',
        totalPoints: existingData.length
      });
    }

    // 3. Download and parse only the new files
    const newData: any[] = [];
    for (const blob of newBlobs) {
      try {
        const content = await service.downloadBlob(blob.name);
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
        if (row) {
          newData.push({
            ...row,
            time: new Date(blob.lastModified!).toISOString(),
            blobName: blob.name
          });
        }
      } catch (err) {
        console.warn(`⚠️ Skipped ${blob.name}:`, err);
      }
    }

    // 4. Merge old + new and save back as one file
    const allData = [...existingData, ...newData];
    const lastBlob = csvBlobs[csvBlobs.length - 1];

    const aggregated = JSON.stringify({
      lastProcessedBlob: lastBlob?.name || lastProcessedBlob,
      lastUpdated: new Date().toISOString(),
      totalPoints: allData.length,
      data: allData
    });

    const blockBlobClient = containerClient.getBlockBlobClient('aggregated.json');
    await blockBlobClient.upload(
      aggregated,
      Buffer.byteLength(aggregated),
      { blobHTTPHeaders: { blobContentType: 'application/json' } }
    );

    console.log(`✅ Done — ${allData.length} total points (${newData.length} new)`);

    return NextResponse.json({
      success: true,
      newPoints: newData.length,
      totalPoints: allData.length,
      lastProcessedBlob: lastBlob?.name
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Aggregation failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Called by Azure Event Grid webhook or manually
export async function GET(request: NextRequest) {
  // Handle Azure Event Grid webhook validation handshake
  const validationCode = request.nextUrl.searchParams.get('validationCode');
  if (validationCode) {
    console.log('🔐 Azure webhook validation request received');
    return NextResponse.json({ validationResponse: validationCode });
  }

  const containerName = request.nextUrl.searchParams.get('container') || 'ws-tawyeen';
  console.log(`⏰ [TRIGGER] Running aggregation for container: ${containerName}`);
  return runAggregation(containerName);
}

// Called manually via curl/PowerShell or by Azure Event Grid (POST events)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  // Handle Azure Event Grid validation via POST
  if (Array.isArray(body)) {
    const validationEvent = body.find((e: any) => e.eventType === 'Microsoft.EventGrid.SubscriptionValidationEvent');
    if (validationEvent) {
      console.log('🔐 Azure webhook validation event received');
      return NextResponse.json({
        validationResponse: validationEvent.data.validationCode
      });
    }
  }

  const containerName = body.containerName || request.nextUrl.searchParams.get('container') || 'ws-tawyeen';
  console.log(`🔧 [MANUAL] Running aggregation for container: ${containerName}`);
  return runAggregation(containerName);
}