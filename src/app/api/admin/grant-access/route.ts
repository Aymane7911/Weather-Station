// api/admin/grant-access/route.ts (FIXED)
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Check if user is authenticated and is admin
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session')?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const userId = await verifySession(sessionToken);

    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user?.isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { userId: targetUserId, containerName } = await request.json();

    if (!targetUserId || !containerName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if access already exists
    const existingAccess = await prisma.containerAccess.findUnique({
      where: {
        userId_containerName: {
          userId: targetUserId,
          containerName,
        },
      },
    });

    if (existingAccess) {
      return NextResponse.json(
        { error: 'Access already granted' },
        { status: 400 }
      );
    }

    // Grant access
    await prisma.containerAccess.create({
      data: {
        userId: targetUserId,
        containerName,
      },
    });

    // Update user's isAccessGranted flag if this is their first container
    const userAccess = await prisma.containerAccess.count({
      where: { userId: targetUserId },
    });

    if (userAccess === 1) {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { isAccessGranted: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Grant access error:', error);
    return NextResponse.json(
      { error: 'Failed to grant access' },
      { status: 500 }
    );
  }
}
