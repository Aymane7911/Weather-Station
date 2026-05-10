// /api/rain-data/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const today = new Date();

  // Use provided dates, or fall back to 3 months ago
  const startDate = searchParams.get('start') ?? fmt(new Date(today.setMonth(today.getMonth() - 3)));
  const endDate = searchParams.get('end') ?? fmt(new Date());

  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=25.555582&longitude=56.080717` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&hourly=precipitation` +
    `&timezone=UTC`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return NextResponse.json({ error: 'Open-Meteo failed' }, { status: 502 });
  const data = await res.json();
  return NextResponse.json(data);
}