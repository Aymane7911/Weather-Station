// app/api/user/accessible-containers/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  try {
    const currentUser = await requireAuth();

    // Admin users can see all containers
    if (currentUser.isAdmin) {
      return NextResponse.json({
        hasAccess: true,
        isAdmin: true,
        containers: [], // Frontend will fetch all containers
      });
    }

    // Check if user has been granted access
    if (!currentUser.isAccessGranted) {
      return NextResponse.json({
        hasAccess: false,
        isAdmin: false,
        containers: [],
      });
    }

    // Get user's accessible containers
    const containerAccess = await prisma.containerAccess.findMany({
      where: { userId: currentUser.id },
      select: {
        containerName: true,
        grantedAt: true,
      },
    });

    // If user has isAccessGranted=true but no containers assigned, deny access
    if (containerAccess.length === 0) {
      return NextResponse.json({
        hasAccess: false,
        isAdmin: false,
        containers: [],
      });
    }

    return NextResponse.json({
      hasAccess: true,
      isAdmin: false,
      containers: containerAccess.map((ca: { containerName: string; grantedAt: Date }) => ca.containerName),
    });
  } catch (error) {
    console.error('Get accessible containers error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch accessible containers' },
      { status: 500 }
    );
  }
}