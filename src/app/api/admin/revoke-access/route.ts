
// api/admin/revoke-access/route.ts (FIXED)
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

    // Check if access exists before trying to delete
    const existingAccess = await prisma.containerAccess.findUnique({
      where: {
        userId_containerName: {
          userId: targetUserId,
          containerName,
        },
      },
    });

    if (!existingAccess) {
      return NextResponse.json(
        { error: 'Access does not exist' },
        { status: 404 }
      );
    }

    // Revoke access
    await prisma.containerAccess.delete({
      where: {
        userId_containerName: {
          userId: targetUserId,
          containerName,
        },
      },
    });

    // Update user's isAccessGranted flag if they have no more containers
    const remainingAccess = await prisma.containerAccess.count({
      where: { userId: targetUserId },
    });

    if (remainingAccess === 0) {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { isAccessGranted: false },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Revoke access error:', error);
    return NextResponse.json(
      { error: 'Failed to revoke access' },
      { status: 500 }
    );
  }
}