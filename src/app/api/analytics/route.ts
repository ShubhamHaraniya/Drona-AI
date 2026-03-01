import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET /api/analytics — teacher class analytics
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const role = (session.user as { id: string; role: string }).role;
        if (role !== 'TEACHER') return NextResponse.json({ error: 'Teachers only' }, { status: 403 });

        const { searchParams } = new URL(req.url);
        const subjectId = searchParams.get('subjectId');

        if (!subjectId) return NextResponse.json({ error: 'subjectId required' }, { status: 400 });

        // Get subject info + enrolled students
        const subject = await prisma.subject.findUnique({
            where: { id: subjectId },
            include: { enrollments: { include: { student: { select: { id: true, name: true } } } } },
        });
        if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 });

        const studentIds = subject.enrollments.map(e => e.studentId);

        // Topic mastery heatmap data
        const topicData = await prisma.topicProgress.findMany({
            where: { studentId: { in: studentIds }, subjectName: subject.name },
        });
        const topicAgg: Record<string, { sum: number; count: number; failCount: number }> = {};
        for (const tp of topicData) {
            if (!topicAgg[tp.topicName]) topicAgg[tp.topicName] = { sum: 0, count: 0, failCount: 0 };
            topicAgg[tp.topicName].sum += tp.masteryScore;
            topicAgg[tp.topicName].count += 1;
            topicAgg[tp.topicName].failCount += tp.failCount >= 3 ? 1 : 0;
        }
        const heatmap = Object.entries(topicAgg).map(([topic, d]) => ({
            topic,
            avgMastery: Math.round(d.sum / d.count),
            studentCount: d.count,
            failingStudents: d.failCount,
            color: d.sum / d.count >= 70 ? '#22c55e' : d.sum / d.count >= 40 ? '#f59e0b' : '#ef4444',
        })).sort((a, b) => a.avgMastery - b.avgMastery);

        // Grade averages by component
        const grades = await prisma.grade.findMany({
            where: { subjectId, studentId: { in: studentIds } },
        });
        const gradeAgg: Record<string, { sum: number; count: number; total: number }> = {};
        for (const g of grades) {
            if (!gradeAgg[g.componentType]) gradeAgg[g.componentType] = { sum: 0, count: 0, total: 0 };
            gradeAgg[g.componentType].sum += g.marksObtained;
            gradeAgg[g.componentType].count += 1;
            gradeAgg[g.componentType].total = g.totalMarks;
        }
        const gradeAvgs = Object.entries(gradeAgg).map(([comp, d]) => ({
            component: comp.replace('_', ' '),
            average: Math.round((d.sum / d.count) * 10) / 10,
            totalMarks: d.total,
            percentage: Math.round((d.sum / d.count) / d.total * 100),
            studentCount: d.count,
        }));

        // AI Alerts
        const alerts: Array<{ severity: string; message: string }> = [];
        for (const [topic, d] of Object.entries(topicAgg)) {
            const failRate = d.failCount / d.count;
            if (failRate > 0.5) {
                alerts.push({ severity: 'critical', message: `🔴 ${Math.round(failRate * 100)}% of students failed "${topic}" 3+ times. Consider a revision lecture.` });
            } else if (d.sum / d.count < 40) {
                alerts.push({ severity: 'warning', message: `🟡 Class average for "${topic}" is ${Math.round(d.sum / d.count)}% — needs attention.` });
            }
        }
        for (const ga of gradeAvgs) {
            if (ga.percentage < 40) {
                alerts.push({ severity: 'critical', message: `📉 ${ga.component} class average is only ${ga.percentage}%.` });
            }
        }
        if (alerts.length === 0) {
            alerts.push({ severity: 'info', message: '✅ No critical issues. Class is performing well overall.' });
        }

        // Quiz trends
        const quizResults = await prisma.quizResult.findMany({
            where: { userId: { in: studentIds }, subject: subject.name },
            orderBy: { createdAt: 'asc' },
        });
        const quizTrends = quizResults.reduce((acc: Record<string, number[]>, q) => {
            const month = new Date(q.createdAt).toLocaleDateString('en', { month: 'short' });
            if (!acc[month]) acc[month] = [];
            acc[month].push(q.percentage);
            return acc;
        }, {});
        const trendData = Object.entries(quizTrends).map(([month, scores]) => ({
            month,
            avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
            quizCount: scores.length,
        }));

        return NextResponse.json({
            subjectName: subject.name,
            enrolledCount: studentIds.length,
            heatmap,
            gradeAvgs,
            alerts,
            trendData,
        });
    } catch (error) {
        console.error('Analytics error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
