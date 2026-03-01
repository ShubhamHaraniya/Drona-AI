// Next.js 16 Proxy — replaces deprecated middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export default async function proxy(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Public routes — skip auth
    const publicPaths = ['/login', '/signup', '/api/auth', '/api/signup', '/api/test'];
    if (publicPaths.some(p => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    // Static assets — skip
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon') ||
        pathname.includes('.')
    ) {
        return NextResponse.next();
    }

    // Check JWT token
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token) {
        const loginUrl = new URL('/login', req.url);
        return NextResponse.redirect(loginUrl);
    }

    // Admin route protection
    if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
        if (token.role !== 'ADMIN') {
            return NextResponse.redirect(new URL('/', req.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
