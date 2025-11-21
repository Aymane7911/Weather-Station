// app/api/blobs/list/route.ts
import { NextResponse } from 'next/server';
import { AzureBlobService } from '@/lib/azure';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const container = searchParams.get('container') || 'trainingdata';
    
    const azureService = new AzureBlobService(container);
    const blobs = await azureService.listBlobs();
    
    const grouped = {
      camelTracker: blobs.filter(b => b.name.startsWith('race_') && !b.name.includes('tracker_')),
      jockeyRobot: blobs.filter(b => b.name.startsWith('tracker_')),
      other: blobs.filter(b => !b.name.startsWith('race_') && !b.name.startsWith('tracker_'))
    };
    
    return NextResponse.json({
      container,
      totalBlobs: blobs.length,
      grouped,
      allBlobs: blobs
    });
    
  } catch (error) {
    console.error('❌ Error listing blobs:', error);
    return NextResponse.json(
      { error: 'Failed to list blobs', details: String(error) },
      { status: 500 }
    );
  }
}
