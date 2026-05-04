// src/app/api/stations/route.ts
// GET  /api/stations        — return all stations with lat/lng
// POST /api/stations        — upsert a station's location (admin only)

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── GET — public, returns all stations with coordinates ───────────────────────
export async function GET() {
  try {
    const stations = await prisma.weatherStation.findMany({
      orderBy: { containerName: 'asc' },
    });
    return NextResponse.json({ success: true, stations });
  } catch (error) {
    console.error('[API] GET /api/stations error:', error);
    return NextResponse.json({ error: 'Failed to fetch stations' }, { status: 500 });
  }
}

// ── POST — admin only, upsert location for a container ────────────────────────
export async function POST(request: NextRequest) {
  try {
    // Auth check — reuse your existing session logic
    const sessionToken = request.cookies.get('session')?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session.user.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { containerName, displayName, lat, lng } = body;

    if (!containerName) {
      return NextResponse.json({ error: 'containerName is required' }, { status: 400 });
    }

    if (lat !== undefined && (typeof lat !== 'number' || lat < -90 || lat > 90)) {
      return NextResponse.json({ error: 'Invalid latitude' }, { status: 400 });
    }

    if (lng !== undefined && (typeof lng !== 'number' || lng < -180 || lng > 180)) {
      return NextResponse.json({ error: 'Invalid longitude' }, { status: 400 });
    }

    // Upsert — create if not exists, update if exists
    const station = await prisma.weatherStation.upsert({
      where: { containerName },
      update: {
        ...(displayName !== undefined && { displayName }),
        ...(lat !== undefined && { lat }),
        ...(lng !== undefined && { lng }),
      },
      create: {
        containerName,
        displayName: displayName || null,
        lat: lat || null,
        lng: lng || null,
      },
    });

    return NextResponse.json({ success: true, station });
  } catch (error) {
    console.error('[API] POST /api/stations error:', error);
    return NextResponse.json({ error: 'Failed to save station' }, { status: 500 });
  }
}