import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// POST /api/schedule — create schedule event (teacher broadcast or direct)
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { userId, type, subject, title, datetime, createdBy } = body;
        const targetUserId = userId || (session.user as { id: string }).id;

        const schedule = await prisma.schedule.create({
            data: {
                userId: targetUserId,
                type: type || 'exam',
                subject: subject || '',
                title: title || 'Untitled Event',
                datetime: new Date(datetime),
                createdBy: createdBy || 'student',
            },
        });

        return NextResponse.json({ schedule, message: 'Event created' });
    } catch (error) {
        console.error('Schedule POST error:', error);
        return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
    }
}

// DELETE /api/schedule — remove schedule event
export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await req.json();
        if (!id) {
            return NextResponse.json({ error: 'Schedule ID required' }, { status: 400 });
        }

        const userId = (session.user as { id: string }).id;
        const role = (session.user as { id: string; role: string }).role;

        // Teachers can delete any event, students only their own
        const schedule = role === 'TEACHER'
            ? await prisma.schedule.findFirst({ where: { id } })
            : await prisma.schedule.findFirst({ where: { id, userId } });

        if (!schedule) {
            return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
        }

        await prisma.schedule.delete({ where: { id } });

        return NextResponse.json({ success: true, message: 'Event removed successfully' });
    } catch (error) {
        console.error('Schedule delete error:', error);
        return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 });
    }
}
