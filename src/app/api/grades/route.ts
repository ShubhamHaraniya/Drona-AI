import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET /api/grades — fetch grades
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const userId = (session.user as { id: string; role: string }).id;
        const role = (session.user as { id: string; role: string }).role;
        const { searchParams } = new URL(req.url);
        const subjectId = searchParams.get('subjectId');

        if (role === 'TEACHER') {
            // Teacher gets all grades for their subject
            if (!subjectId) return NextResponse.json({ error: 'subjectId required' }, { status: 400 });
            const grades = await prisma.grade.findMany({
                where: { subjectId },
                include: { student: { select: { id: true, name: true, email: true } } },
                orderBy: [{ componentType: 'asc' }, { student: { name: 'asc' } }],
            });
            return NextResponse.json({ grades });
        } else {
            // Student gets own grades
            const grades = await prisma.grade.findMany({
                where: { studentId: userId, ...(subjectId ? { subjectId } : {}) },
                include: { subject: { select: { name: true, code: true } } },
                orderBy: { timestamp: 'desc' },
            });
            return NextResponse.json({ grades });
        }
    } catch (error) {
        console.error('Grades GET error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

// POST /api/grades — teacher bulk-enters grades
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const role = (session.user as { id: string; role: string }).role;
        if (role !== 'TEACHER') return NextResponse.json({ error: 'Teachers only' }, { status: 403 });

        const { subjectId, componentType, grades } = await req.json() as {
            subjectId: string;
            componentType: string;
            grades: Array<{ studentId: string; marks: number; totalMarks: number }>;
        };

        if (!subjectId || !componentType || !grades?.length) {
            return NextResponse.json({ error: 'subjectId, componentType, and grades[] required' }, { status: 400 });
        }

        // Upsert each grade
        const results = [];
        for (const g of grades) {
            const existing = await prisma.grade.findFirst({
                where: { studentId: g.studentId, subjectId, componentType },
            });
            if (existing) {
                const updated = await prisma.grade.update({
                    where: { id: existing.id },
                    data: { marksObtained: g.marks, totalMarks: g.totalMarks },
                });
                results.push(updated);
            } else {
                const created = await prisma.grade.create({
                    data: {
                        studentId: g.studentId, subjectId, componentType,
                        marksObtained: g.marks, totalMarks: g.totalMarks,
                    },
                });
                results.push(created);
            }
        }

        return NextResponse.json({ message: `${results.length} grades saved`, count: results.length });
    } catch (error) {
        console.error('Grades POST error:', error);
        return NextResponse.json({ error: 'Failed to save grades' }, { status: 500 });
    }
}
