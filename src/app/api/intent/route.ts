import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { routeIntent } from '@/lib/agents/routerAgent';

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { message } = await req.json();
        if (!message || typeof message !== 'string') {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        const intent = await routeIntent(message);
        return NextResponse.json(intent);
    } catch (error) {
        console.error('Intent route error:', error);
        return NextResponse.json({ error: 'Failed to route intent' }, { status: 500 });
    }
}
