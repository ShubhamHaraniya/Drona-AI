import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const count = await prisma.user.count();
        return NextResponse.json({ status: 'ok', userCount: count });
    } catch (error: unknown) {
        const err = error as any;
        return NextResponse.json({
            status: 'error',
            name: err?.name,
            message: err?.message?.substring(0, 1000),
            clientVersion: err?.clientVersion,
        }, { status: 500 });
    }
}
