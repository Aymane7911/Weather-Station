// app/api/auth/check-admin/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Get session token from cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session')?.value;

    if (!sessionToken) {
      return NextResponse.json({ isAdmin: false }, { status: 200 });
    }

    // Find session in database
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: { user: true }
    });

    // Check if session exists and is valid
    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ isAdmin: false }, { status: 200 });
    }

    // Check if user is admin
    const isAdmin = session.user.isAdmin || false;

    return NextResponse.json({ 
      isAdmin,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Error checking admin status:', error);
    return NextResponse.json({ 
      isAdmin: false,
      error: 'Failed to check admin status'
    }, { status: 200 });
  }
}