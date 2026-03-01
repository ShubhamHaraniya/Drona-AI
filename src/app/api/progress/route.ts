// Progress API — get student progress including college grades
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { safeJsonParse } from '@/lib/utils';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;

        const progress = await prisma.studentProgress.findUnique({
            where: { userId },
        });

        const quizHistory = await prisma.quizResult.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        const schedules = await prisma.schedule.findMany({
            where: { userId },
            orderBy: { datetime: 'asc' },
        });

        // Fetch college grades
        const grades = await prisma.grade.findMany({
            where: { studentId: userId },
            include: { subject: { select: { name: true, code: true } } },
            orderBy: { timestamp: 'desc' },
        });

        // Fetch enrolled subjects
        const enrollments = await prisma.enrollment.findMany({
            where: { studentId: userId },
            include: { subject: { include: { teacher: { select: { name: true } } } } },
        });

        // Fetch per-subject topic progress
        const topicProgressData = await prisma.topicProgress.findMany({
            where: { studentId: userId },
            orderBy: { masteryScore: 'asc' },
        });

        return NextResponse.json({
            progress: progress ? {
                subjectStats: safeJsonParse(progress.subjectStats, {}),
                topicMastery: safeJsonParse(progress.topicMastery, {}),
                streak: progress.streak,
                lastActiveDate: progress.lastActiveDate,
                confidencePatterns: safeJsonParse(progress.confidencePatterns, []),
                adaptiveDifficulty: safeJsonParse(progress.adaptiveDifficulty, {}),
            } : null,
            quizHistory: quizHistory.map(q => ({
                id: q.id,
                subject: q.subject,
                score: q.score,
                maxScore: q.maxScore,
                percentage: q.percentage,
                topicBreakdown: safeJsonParse(q.topicBreakdown, {}),
                weakAreas: safeJsonParse(q.weakAreas, []),
                createdAt: q.createdAt.toISOString(),
            })),
            schedules: schedules.map(s => ({
                id: s.id,
                type: s.type,
                subject: s.subject,
                title: s.title,
                datetime: s.datetime.toISOString(),
                createdBy: s.createdBy,
            })),
            grades: grades.map(g => ({
                id: g.id,
                subjectName: g.subject.name,
                subjectCode: g.subject.code,
                componentType: g.componentType,
                marksObtained: g.marksObtained,
                totalMarks: g.totalMarks,
                percentage: Math.round((g.marksObtained / g.totalMarks) * 100),
                timestamp: g.timestamp.toISOString(),
            })),
            enrolledSubjects: enrollments.map(e => ({
                id: e.subject.id,
                name: e.subject.name,
                teacherName: e.subject.teacher.name,
            })),
            topicProgress: topicProgressData.map(tp => ({
                subjectName: tp.subjectName,
                topicName: tp.topicName,
                masteryScore: tp.masteryScore,
                failCount: tp.failCount,
                quizCount: tp.quizCount,
            })),
        });
    } catch (error) {
        console.error('Progress API error:', error);
        return NextResponse.json(
            { error: 'Error fetching progress' },
            { status: 500 }
        );
    }
}
