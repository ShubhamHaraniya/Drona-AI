// Admin API — platform analytics and user management
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { safeJsonParse } from '@/lib/utils';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || (session.user as { role: string }).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Platform analytics
        const totalUsers = await prisma.user.count({ where: { role: 'STUDENT' } });
        const totalQuizzes = await prisma.quizResult.count();
        const totalSchedules = await prisma.schedule.count();

        // Users with their progress
        const users = await prisma.user.findMany({
            where: { role: 'STUDENT' },
            include: {
                progress: true,
                _count: { select: { quizResults: true, schedules: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const userSummaries = users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            createdAt: u.createdAt.toISOString(),
            quizCount: u._count.quizResults,
            scheduleCount: u._count.schedules,
            streak: u.progress?.streak || 0,
            subjectStats: u.progress ? safeJsonParse(u.progress.subjectStats, {}) : {},
        }));

        // Subject-wise analytics
        const quizResults = await prisma.quizResult.findMany({
            select: { subject: true, percentage: true },
        });

        const subjectAnalytics: Record<string, { count: number; avgScore: number; total: number }> = {};
        for (const qr of quizResults) {
            if (!subjectAnalytics[qr.subject]) {
                subjectAnalytics[qr.subject] = { count: 0, avgScore: 0, total: 0 };
            }
            subjectAnalytics[qr.subject].count++;
            subjectAnalytics[qr.subject].total += qr.percentage;
        }
        for (const [, stats] of Object.entries(subjectAnalytics)) {
            stats.avgScore = stats.total / stats.count;
        }

        return NextResponse.json({
            platform: {
                totalUsers,
                totalQuizzes,
                totalSchedules,
                activeToday: users.filter(u =>
                    u.progress?.lastActiveDate === new Date().toISOString().split('T')[0]
                ).length,
            },
            users: userSummaries,
            subjectAnalytics,
        });
    } catch (error) {
        console.error('Admin API error:', error);
        return NextResponse.json(
            { error: 'Error fetching admin data' },
            { status: 500 }
        );
    }
}
