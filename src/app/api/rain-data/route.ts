import { NextResponse } from 'next/server';

export async function GET() {
  const today = new Date();
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const fmt = (d: Date) => d.toISOString().split('T')[0];

  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=25.555582&longitude=56.080717` +
    `&start_date=${fmt(oneMonthAgo)}&end_date=${fmt(today)}` +
    `&hourly=precipitation` +        // ← changed from minutely_15
    `&timezone=Asia%2FDubai`;

  const res = await fetch(url);
  if (!res.ok) return NextResponse.json({ error: 'Open-Meteo failed' }, { status: 502 });
  const data = await res.json();
  return NextResponse.json(data);
}