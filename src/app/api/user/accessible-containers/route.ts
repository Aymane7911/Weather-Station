// app/api/user/accessible-containers/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  try {
    const currentUser = await requireAuth();

    // Admin users can see all containers
    if (currentUser.isAdmin) {
      console.log(`✅ [Accessible Containers] Admin user ${currentUser.email} - granting access to all containers`);
      
      return NextResponse.json({
        hasAccess: true,
        isAdmin: true,
        containers: [], // Empty array signals frontend to fetch all containers
        message: 'Admin has access to all containers'
      });
    }

    // Check if user has been granted access
    if (!currentUser.isAccessGranted) {
      console.log(`❌ [Accessible Containers] User ${currentUser.email} - access not granted`);
      
      return NextResponse.json({
        hasAccess: false,
        isAdmin: false,
        containers: [],
        message: 'Access not granted. Please contact an administrator.'
      });
    }

    // Get user's accessible containers with related metadata
    const containerAccess = await prisma.containerAccess.findMany({
      where: { userId: currentUser.id },
      select: {
        containerName: true,
        grantedAt: true,
      },
      orderBy: {
        containerName: 'asc'
      }
    });

    // If user has isAccessGranted=true but no containers assigned, deny access
    if (containerAccess.length === 0) {
      console.log(`⚠️ [Accessible Containers] User ${currentUser.email} - access granted but no containers assigned`);
      
      return NextResponse.json({
        hasAccess: false,
        isAdmin: false,
        containers: [],
        message: 'No containers assigned. Please contact an administrator.'
      });
    }

    const containerNames = containerAccess.map(ca => ca.containerName);
    
    console.log(`✅ [Accessible Containers] User ${currentUser.email} - has access to ${containerNames.length} containers:`, containerNames);

    return NextResponse.json({
      hasAccess: true,
      isAdmin: false,
      containers: containerNames,
      total: containerNames.length,
      message: `Access granted to ${containerNames.length} container(s)`
    });
    
  } catch (error) {
    console.error('❌ [Accessible Containers] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { 
          error: 'Not authenticated',
          hasAccess: false,
          isAdmin: false,
          containers: []
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Failed to fetch accessible containers',
        hasAccess: false,
        isAdmin: false,
        containers: []
      },
      { status: 500 }
    );
  }
}