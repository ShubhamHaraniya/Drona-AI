/**
 * Quiz Submit API — Grades answers using stored answer key, calls LLM for analysis
 * 
 * LLM-generated questions store correct answers in the answerKey metadata.
 * After grading, the evaluation agent provides AI-powered analysis.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handleEvaluation } from '@/lib/agents/evaluationAgent';
import { safeJsonParse } from '@/lib/utils';
import prisma from '@/lib/prisma';

interface SubmitBody {
    answers: Array<{
        questionId: string;
        answer: string | number | string[];
        confidenceLevel?: number;
        timeSpent?: number;
    }>;
    subject: string;
    confidenceLevel?: number;
    // Answer key from LLM-generated quiz (stored in frontend metadata)
    answerKey?: Array<{
        questionId: string;
        correctAnswer: string;
        explanation: string;
        topic: string;
    }>;
    // Questions from LLM-generated quiz
    questions?: Array<{
        id: string;
        question: string;
        topic: string;
    }>;
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;
        const body: SubmitBody = await req.json();
        const { answers, subject, confidenceLevel, answerKey, questions } = body;

        if (!answers?.length) {
            return NextResponse.json({ error: 'No answers provided' }, { status: 400 });
        }

        // Build lookup maps from the LLM answer key
        const keyMap = new Map<string, { correctAnswer: string; explanation: string; topic: string }>();
        if (answerKey) {
            answerKey.forEach(k => keyMap.set(k.questionId, k));
        }
        const questionMap = new Map<string, { question: string; topic: string }>();
        if (questions) {
            questions.forEach(q => questionMap.set(q.id, q));
        }

        // Grade answers
        let score = 0;
        const maxScore = answers.length;
        const topicBreakdown: Record<string, { correct: number; total: number }> = {};
        const questionReview: Array<{
            questionId: string;
            question: string;
            userAnswer: string | number | string[];
            correctAnswer: string | number | string[];
            isCorrect: boolean;
            explanation: string;
            topic: string;
        }> = [];

        for (const answer of answers) {
            const key = keyMap.get(answer.questionId);
            const qInfo = questionMap.get(answer.questionId);

            if (!key) continue; // Skip if no answer key found

            const topic = key.topic || qInfo?.topic || 'General';

            // Initialize topic tracking
            if (!topicBreakdown[topic]) {
                topicBreakdown[topic] = { correct: 0, total: 0 };
            }
            topicBreakdown[topic].total++;

            // Check if answer matches (case-insensitive string comparison)
            const userAns = String(answer.answer).trim().toLowerCase();
            const correctAns = String(key.correctAnswer).trim().toLowerCase();
            const isCorrect = userAns === correctAns;

            if (isCorrect) {
                score++;
                topicBreakdown[topic].correct++;
            }

            questionReview.push({
                questionId: answer.questionId,
                question: qInfo?.question || `Question ${answer.questionId}`,
                userAnswer: answer.answer,
                correctAnswer: key.correctAnswer,
                isCorrect,
                explanation: key.explanation,
                topic,
            });
        }

        const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

        // Identify weak areas
        const weakAreas = Object.entries(topicBreakdown)
            .filter(([, stats]) => stats.total > 0 && (stats.correct / stats.total) < 0.5)
            .map(([topic]) => topic);

        // Generate recommendations
        const recommendations = weakAreas.length > 0
            ? [`Review: ${weakAreas.join(', ')}`, 'Try easier questions first to build confidence']
            : ['Great job! Try harder difficulty next time'];

        // Save quiz result to DB
        const quizResultDb = await prisma.quizResult.create({
            data: {
                userId,
                subject,
                score,
                maxScore,
                percentage,
                topicBreakdown: JSON.stringify(topicBreakdown),
                weakAreas: JSON.stringify(weakAreas),
                recommendations: JSON.stringify(recommendations),
                questionReview: JSON.stringify(questionReview),
                confidenceData: JSON.stringify({
                    level: confidenceLevel || 0,
                    actualPerformance: percentage,
                }),
            },
        });

        // Update student progress
        const existingProgress = await prisma.studentProgress.findUnique({
            where: { userId },
        });

        if (existingProgress) {
            const subjectStats = safeJsonParse(existingProgress.subjectStats, {} as Record<string, { totalQuizzes: number; averageScore: number; bestScore: number; currentDifficulty: string }>);
            const topicMastery = safeJsonParse(existingProgress.topicMastery, {} as Record<string, number>);
            const confidencePatterns = safeJsonParse(existingProgress.confidencePatterns, [] as Array<{ confidence: number; performance: number; date: string }>);
            const adaptiveDifficulty = safeJsonParse(existingProgress.adaptiveDifficulty, {} as Record<string, string>);

            // Update subject stats
            if (!subjectStats[subject]) {
                subjectStats[subject] = { totalQuizzes: 0, averageScore: 0, bestScore: 0, currentDifficulty: 'Easy' };
            }
            const ss = subjectStats[subject];
            ss.totalQuizzes++;
            ss.averageScore = ((ss.averageScore * (ss.totalQuizzes - 1)) + percentage) / ss.totalQuizzes;
            ss.bestScore = Math.max(ss.bestScore, percentage);

            // Adaptive difficulty
            if (percentage >= 80) {
                ss.currentDifficulty = ss.currentDifficulty === 'Easy' ? 'Medium' : 'Hard';
            } else if (percentage < 40) {
                ss.currentDifficulty = ss.currentDifficulty === 'Hard' ? 'Medium' : 'Easy';
            }
            adaptiveDifficulty[subject] = ss.currentDifficulty;

            // Update topic mastery (exponential moving average)
            const gapLoopTriggers: string[] = [];
            for (const [topic, stats] of Object.entries(topicBreakdown)) {
                const topicPct = (stats.correct / stats.total) * 100;
                const oldMastery = topicMastery[topic] || 50;
                topicMastery[topic] = oldMastery * 0.7 + topicPct * 0.3;

                // Adaptive Gap Loop — track failures in TopicProgress
                const isWeak = topicPct < 50;
                const existing = await prisma.topicProgress.findFirst({
                    where: { studentId: userId, topicName: topic, subjectName: subject },
                });
                if (existing) {
                    await prisma.topicProgress.update({
                        where: { id: existing.id },
                        data: {
                            masteryScore: topicMastery[topic],
                            failCount: isWeak ? existing.failCount + 1 : existing.failCount,
                            quizCount: existing.quizCount + 1,
                            lastTestedAt: new Date(),
                        },
                    });
                    // Gap Loop Trigger: 3+ consecutive failures → auto-schedule revision
                    if (isWeak && existing.failCount + 1 >= 3 && !existing.revisionScheduled) {
                        gapLoopTriggers.push(topic);
                        // Auto-create revision schedule event
                        const revisionDate = new Date(Date.now() + 86400000); // tomorrow
                        await prisma.schedule.create({
                            data: {
                                userId,
                                type: 'revision',
                                subject,
                                title: `🔄 Deep Dive: ${topic}`,
                                datetime: revisionDate,
                                createdBy: 'ai_pathfinder',
                                priority: 2,
                            },
                        });
                        // Auto-create to-do item
                        await prisma.toDoItem.create({
                            data: {
                                studentId: userId,
                                subjectName: subject,
                                description: `Review "${topic}" — failed 3+ times. Focus on fundamentals.`,
                                source: 'ai_pathfinder',
                                priority: 2,
                                dueDate: revisionDate,
                            },
                        });
                        // Mark as scheduled to avoid duplicates
                        await prisma.topicProgress.update({
                            where: { id: existing.id },
                            data: { revisionScheduled: true },
                        });
                    }
                } else {
                    await prisma.topicProgress.create({
                        data: {
                            studentId: userId,
                            subjectName: subject,
                            topicName: topic,
                            masteryScore: topicMastery[topic],
                            failCount: isWeak ? 1 : 0,
                            quizCount: 1,
                            lastTestedAt: new Date(),
                        },
                    });
                }
            }

            // Confidence patterns
            if (confidenceLevel !== undefined) {
                confidencePatterns.push({
                    confidence: confidenceLevel,
                    performance: percentage,
                    date: new Date().toISOString(),
                });
            }

            // Streak
            const today = new Date().toISOString().split('T')[0];
            const lastActive = existingProgress.lastActiveDate;
            let newStreak = existingProgress.streak;
            if (lastActive !== today) {
                const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                newStreak = lastActive === yesterday ? existingProgress.streak + 1 : 1;
            }

            await prisma.studentProgress.update({
                where: { userId },
                data: {
                    subjectStats: JSON.stringify(subjectStats),
                    topicMastery: JSON.stringify(topicMastery),
                    confidencePatterns: JSON.stringify(confidencePatterns),
                    adaptiveDifficulty: JSON.stringify(adaptiveDifficulty),
                    streak: newStreak,
                    lastActiveDate: today,
                },
            });

            // Add gap loop notifications to weak areas
            if (gapLoopTriggers.length > 0) {
                weakAreas.push(...gapLoopTriggers.map(t => `⚠️ GAP ALERT: "${t}" failed 3+ times — auto-revision scheduled for tomorrow`));
            }
        }

        // Get LLM analysis of quiz results
        const evaluation = await handleEvaluation(
            { subject, score, maxScore, percentage, questionReview, weakAreas },
            confidenceLevel
        );

        return NextResponse.json({
            result: {
                id: quizResultDb.id,
                subject,
                score,
                maxScore,
                percentage,
                topicBreakdown,
                weakAreas,
                recommendations,
                questionReview,  // Full per-question review sent to frontend
                confidenceData: { level: confidenceLevel || 0, actualPerformance: percentage },
                timestamp: new Date().toISOString(),
            },
            evaluation,
        });
    } catch (error) {
        console.error('Quiz submit error:', error);
        return NextResponse.json(
            { error: 'Error processing quiz submission' },
            { status: 500 }
        );
    }
}
