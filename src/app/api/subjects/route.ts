import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET /api/subjects — list subjects
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const userId = (session.user as { id: string; role: string }).id;
        const role = (session.user as { id: string; role: string }).role;

        if (role === 'TEACHER') {
            const subjects = await prisma.subject.findMany({
                where: { teacherId: userId },
                include: { enrollments: { include: { student: { select: { id: true, name: true, email: true } } } } },
                orderBy: { createdAt: 'desc' },
            });
            return NextResponse.json({ subjects });
        } else {
            // Students see enrolled subjects + available subjects
            const enrollments = await prisma.enrollment.findMany({
                where: { studentId: userId },
                include: { subject: { include: { teacher: { select: { name: true } } } } },
            });
            const enrolledSubjectIds = enrollments.map(e => e.subjectId);
            const available = await prisma.subject.findMany({
                where: { id: { notIn: enrolledSubjectIds } },
                include: { teacher: { select: { name: true } } },
            });
            return NextResponse.json({
                enrolled: enrollments.map(e => ({ ...e.subject, enrollmentId: e.id })),
                available,
            });
        }
    } catch (error) {
        console.error('Subjects GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }
}

// POST /api/subjects — create subject (teacher) or enroll (student)
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const userId = (session.user as { id: string; role: string }).id;
        const role = (session.user as { id: string; role: string }).role;
        const body = await req.json();

        if (role === 'TEACHER') {
            // Create subject
            const { name, code, description } = body;
            if (!name) return NextResponse.json({ error: 'Subject name required' }, { status: 400 });
            const subject = await prisma.subject.create({
                data: { name, code: code || '', description: description || '', teacherId: userId },
            });
            return NextResponse.json({ subject, message: 'Subject created' });
        } else {
            // Student enrollment
            const { subjectId } = body;
            if (!subjectId) return NextResponse.json({ error: 'Subject ID required' }, { status: 400 });
            const existing = await prisma.enrollment.findUnique({
                where: { studentId_subjectId: { studentId: userId, subjectId } },
            });
            if (existing) return NextResponse.json({ error: 'Already enrolled' }, { status: 400 });
            const enrollment = await prisma.enrollment.create({
                data: { studentId: userId, subjectId },
            });
            return NextResponse.json({ enrollment, message: 'Enrolled successfully' });
        }
    } catch (error) {
        console.error('Subjects POST error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

// DELETE /api/subjects — unenroll student or delete subject
export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const userId = (session.user as { id: string; role: string }).id;
        const role = (session.user as { id: string; role: string }).role;
        const { id, type } = await req.json();

        if (type === 'enrollment') {
            await prisma.enrollment.delete({ where: { id } });
            return NextResponse.json({ message: 'Unenrolled' });
        } else if (role === 'TEACHER') {
            await prisma.subject.delete({ where: { id, teacherId: userId } });
            return NextResponse.json({ message: 'Subject deleted' });
        }
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    } catch (error) {
        console.error('Subjects DELETE error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
