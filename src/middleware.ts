// middleware.ts (FIXED)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const protectedRoutes = ['/selection', '/dashboard', '/admin'];
const authRoutes = ['/auth/login', '/auth/register'];
const adminRoutes = ['/admin'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get('session')?.value;

  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some(route => pathname.startsWith(route));
  const isAdminRoute = adminRoutes.some(route => pathname.startsWith(route));

  if (isProtectedRoute) {
    if (!sessionToken) {
      const url = new URL('/auth/login', request.url);
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }

    try {
      // ✅ FIXED - Use /api/auth/me instead of /api/auth/verify
      const meResponse = await fetch(new URL('/api/auth/me', request.url), {
        headers: {
          Cookie: `session=${sessionToken}`,
        },
      });

      if (!meResponse.ok) {
        const url = new URL('/auth/login', request.url);
        url.searchParams.set('redirect', pathname);
        
        const response = NextResponse.redirect(url);
        response.cookies.delete('session');
        return response;
      }

      // Check admin access for admin routes
      if (isAdminRoute) {
        const { user } = await meResponse.json();
        if (!user.isAdmin) {
          return NextResponse.redirect(new URL('/selection', request.url));
        }
      }
    } catch (error) {
      console.error('Middleware auth error:', error);
      const url = new URL('/auth/login', request.url);
      url.searchParams.set('redirect', pathname);
      
      const response = NextResponse.redirect(url);
      response.cookies.delete('session');
      return response;
    }
  }

  if (isAuthRoute && sessionToken) {
    try {
      // ✅ FIXED - Use /api/auth/me instead of /api/auth/verify
      const meResponse = await fetch(new URL('/api/auth/me', request.url), {
        headers: {
          Cookie: `session=${sessionToken}`,
        },
      });

      if (meResponse.ok) {
        return NextResponse.redirect(new URL('/selection', request.url));
      }
    } catch (error) {
      // If verification fails, allow access to auth pages
      console.error('Auth route check error:', error);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};