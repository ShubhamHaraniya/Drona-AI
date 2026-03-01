/**
 * Chat API Route — Orchestrates the multi-agent LLM system
 * 
 * Flow:
 * 1. Router Agent (LLM) classifies intent
 * 2. Dispatches to appropriate specialist agent (all LLM-powered)
 * 3. Returns response to frontend
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { routeIntent } from '@/lib/agents/routerAgent';
import { handleQuery } from '@/lib/agents/queryAgent';
import { handleQuizRequest } from '@/lib/agents/quizAgent';
import { handleProgressOverview } from '@/lib/agents/evaluationAgent';
import { handleScheduleRequest } from '@/lib/agents/schedulerAgent';
import { ask } from '@/lib/llm';
import type { AgentResponse, StudentProgress, ScheduleEvent } from '@/lib/types';
import { safeJsonParse } from '@/lib/utils';
import { checkSafety, getSafetyResponse } from '@/lib/agents/safetyAgent';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { message, isAnalyticsRequest } = await req.json();
        if (!message || typeof message !== 'string') {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        const userId = (session.user as { id: string }).id;

        // Bypass for AI Subject Analytics Report
        if (isAnalyticsRequest) {
            const report = await ask(
                `You are an expert AI tutor. Generate a clean Markdown report based on the stats provided. Be very strict about only discussing the subject mentioned in the prompt. Do NOT mention any unrelated subjects.`,
                message,
                { temperature: 0.7, maxTokens: 800 }
            );
            return NextResponse.json({
                type: 'general',
                message: report,
                metadata: {},
                intent: 'AnalyticsReport',
                suggestedActions: [],
            });
        }

        // Step 0: Safety gate — block non-academic queries
        const safety = await checkSafety(message);
        if (!safety.isAcademic) {
            return NextResponse.json({
                type: 'general',
                message: getSafetyResponse(),
                metadata: {},
                intent: 'OutOfScope',
                suggestedActions: [
                    { label: '🤖 Learn ML', action: 'explain machine learning' },
                    { label: '📝 DSA Quiz', action: 'quiz me on DSA' },
                ],
            });
        }

        // Step 1: Route intent via LLM
        const intent = await routeIntent(message);

        let response: AgentResponse;

        switch (intent.intent) {
            case 'Explanation': {
                // Step 2a: LLM generates explanation with RAG context
                response = await handleQuery(message, {
                    subject: intent.subject,
                    topic: intent.topic,
                });
                break;
            }

            case 'QuizRequest': {
                // Step 2b: LLM generates quiz questions
                const progressRecord = await prisma.studentProgress.findUnique({
                    where: { userId },
                });
                const currentLevel = intent.subject && progressRecord
                    ? (safeJsonParse(progressRecord.adaptiveDifficulty, {} as Record<string, string>)[intent.subject] || 'Easy')
                    : 'Easy';

                response = await handleQuizRequest(message, intent.params, {
                    currentLevel,
                });
                break;
            }

            case 'Evaluation': {
                // Step 2c: LLM generates progress overview
                const progressRec = await prisma.studentProgress.findUnique({
                    where: { userId },
                });

                if (!progressRec) {
                    response = {
                        type: 'evaluation',
                        message: '📊 No progress data yet! Take your first quiz to see your analytics.\n\n_Try: "Quiz me on Machine Learning"_',
                        metadata: {},
                        suggestedActions: [
                            { label: '📝 Take Quiz', action: 'quiz me' },
                        ],
                    };
                    break;
                }

                const quizHistory = await prisma.quizResult.findMany({
                    where: { userId },
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                });

                const progress: StudentProgress = {
                    quizHistory: quizHistory.map(q => ({
                        id: q.id,
                        subject: q.subject,
                        score: q.score,
                        maxScore: q.maxScore,
                        percentage: q.percentage,
                        topicBreakdown: safeJsonParse(q.topicBreakdown, {}),
                        weakAreas: safeJsonParse(q.weakAreas, []),
                        recommendations: safeJsonParse(q.recommendations, []),
                        questionReview: safeJsonParse(q.questionReview, []),
                        confidenceData: safeJsonParse(q.confidenceData, {}),
                        timestamp: q.createdAt.toISOString(),
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    })) as any,
                    subjectStats: safeJsonParse(progressRec.subjectStats, {}),
                    topicMastery: safeJsonParse(progressRec.topicMastery, {}),
                    streak: progressRec.streak,
                    lastActiveDate: progressRec.lastActiveDate || '',
                    upcomingSchedules: [],
                    confidencePatterns: safeJsonParse(progressRec.confidencePatterns, []),
                    adaptiveDifficultyLevel: safeJsonParse(progressRec.adaptiveDifficulty, {}),
                };

                response = await handleProgressOverview(progress);
                break;
            }

            case 'Scheduling': {
                // Step 2d: LLM parses schedule from natural language
                const dbSchedules = await prisma.schedule.findMany({
                    where: { userId },
                    orderBy: { datetime: 'asc' },
                });

                const schedules: ScheduleEvent[] = dbSchedules.map(s => ({
                    id: s.id,
                    type: s.type as ScheduleEvent['type'],
                    subject: s.subject,
                    title: s.title,
                    datetime: s.datetime.toISOString(),
                }));

                response = await handleScheduleRequest(message, schedules);

                // If adding a new event, save to DB
                if (response.metadata?.newEvent && response.metadata?.action === 'add') {
                    const event = response.metadata.newEvent as ScheduleEvent;
                    await prisma.schedule.create({
                        data: {
                            userId,
                            type: event.type,
                            subject: event.subject,
                            title: event.title,
                            datetime: new Date(event.datetime),
                            createdBy: 'student',
                        },
                    });
                }
                break;
            }

            case 'GradeQuery': {
                // Fetch actual college grades from Grade model
                const allGrades = await prisma.grade.findMany({
                    where: { studentId: userId },
                    include: { subject: { select: { name: true, code: true } } },
                    orderBy: { timestamp: 'desc' },
                });

                if (allGrades.length === 0) {
                    response = {
                        type: 'general',
                        message: '📊 No college grades recorded yet! Your teachers haven\'t entered any marks so far.\n\nCheck back after your Minor exams.',
                        metadata: {},
                        suggestedActions: [
                            { label: '📝 Practice Quiz', action: 'quiz me' },
                            { label: '📈 Quiz Progress', action: 'show my progress' },
                        ],
                    };
                    break;
                }

                // Group by subject
                const bySubject: Record<string, { name: string; code: string; grades: Array<{ component: string; marks: number; total: number }> }> = {};
                for (const g of allGrades) {
                    const key = g.subject.name;
                    if (!bySubject[key]) bySubject[key] = { name: key, code: g.subject.code || '', grades: [] };
                    bySubject[key].grades.push({ component: g.componentType.replace('_', ' '), marks: g.marksObtained, total: g.totalMarks });
                }

                // Filter by subject if specified
                const filterSubject = intent.subject === 'ML' ? 'Machine Learning'
                    : intent.subject === 'DSA' ? 'Data Structures & Algorithms'
                        : intent.subject === 'DB' ? 'Database Systems'
                            : null;

                const subjects = filterSubject
                    ? Object.values(bySubject).filter(s => s.name === filterSubject)
                    : Object.values(bySubject);

                let gradeMsg = '## 🎓 College Grades\n\n';
                for (const subj of subjects) {
                    const totalMarks = subj.grades.reduce((s, g) => s + g.marks, 0);
                    const totalPossible = subj.grades.reduce((s, g) => s + g.total, 0);
                    const pct = totalPossible > 0 ? Math.round(totalMarks / totalPossible * 100) : 0;
                    const emoji = pct >= 80 ? '🟢' : pct >= 60 ? '🟡' : '🔴';

                    gradeMsg += `### ${emoji} ${subj.name}${subj.code ? ` (${subj.code})` : ''}\n`;
                    gradeMsg += `| Component | Marks | Total | % |\n|---|---|---|---|\n`;
                    for (const g of subj.grades) {
                        const gPct = g.total > 0 ? Math.round(g.marks / g.total * 100) : 0;
                        gradeMsg += `| ${g.component} | **${g.marks}** | ${g.total} | ${gPct}% |\n`;
                    }
                    gradeMsg += `| **Total** | **${totalMarks}** | **${totalPossible}** | **${pct}%** |\n\n`;
                }

                response = {
                    type: 'evaluation',
                    message: gradeMsg,
                    metadata: { grades: subjects },
                    suggestedActions: [
                        { label: '📈 Quiz Progress', action: 'show my progress' },
                        { label: '📝 Take Quiz', action: 'quiz me' },
                    ],
                };
                break;
            }

            case 'AssignmentQuery': {
                // Fetch upcoming assignments from schedule
                const assignments = await prisma.schedule.findMany({
                    where: { userId, type: { in: ['assignment', 'project', 'deadline'] } },
                    orderBy: { datetime: 'asc' },
                });

                if (assignments.length === 0) {
                    response = {
                        type: 'general',
                        message: '📋 No assignments or projects due! Ask your teacher to schedule one, or check back later.',
                        metadata: {},
                        suggestedActions: [
                            { label: '📅 View Schedule', action: 'show my schedule' },
                            { label: '📝 Take Quiz', action: 'quiz me' },
                        ],
                    };
                } else {
                    let msg = '## 📋 Assignments & Due Dates\n\n';
                    assignments.forEach(a => {
                        const daysLeft = Math.ceil((new Date(a.datetime).getTime() - Date.now()) / 86400000);
                        const urgency = daysLeft <= 0 ? '⚠️ OVERDUE' : daysLeft <= 3 ? `🔴 ${daysLeft}d left` : `🟢 ${daysLeft}d left`;
                        msg += `- **${a.title}** — ${a.subject} • ${urgency}\n`;
                    });
                    response = {
                        type: 'general',
                        message: msg,
                        metadata: { assignments },
                        suggestedActions: [
                            { label: '📊 My Grades', action: 'show my grades' },
                            { label: '📝 Practice Quiz', action: 'quiz me' },
                        ],
                    };
                }
                break;
            }

            case 'LearningPath': {
                // Generate a study plan using LLM
                const progressRec2 = await prisma.studentProgress.findUnique({ where: { userId } });
                const topicMastery2 = safeJsonParse(progressRec2?.topicMastery || '{}', {});
                const upcomingExams = await prisma.schedule.findMany({
                    where: { userId, type: { in: ['exam', 'quiz'] }, datetime: { gte: new Date() } },
                    orderBy: { datetime: 'asc' },
                    take: 3,
                });

                const weakTopics = Object.entries(topicMastery2)
                    .filter(([, score]) => (score as number) < 60)
                    .map(([topic, score]) => `${topic} (${score}%)`)
                    .join(', ');

                const examInfo = upcomingExams.map(e =>
                    `${e.title} on ${new Date(e.datetime).toLocaleDateString()}`
                ).join(', ');

                try {
                    const plan = await ask(
                        `You are Drona AI's Pathfinder Agent. Create a concise, actionable study plan.
                        
Context:
- Weak topics: ${weakTopics || 'None identified yet'}
- Upcoming exams: ${examInfo || 'None scheduled'}
- User's request: "${message}"

Rules:
- Prioritize weakest topics first
- If there's an upcoming exam, focus preparation on that
- Break into daily study blocks (1-2 hours each)
- Keep the plan to 5-7 days max
- Use markdown formatting with checkboxes
- Be specific about topics to study`,
                        message,
                        { temperature: 0.6, maxTokens: 600 }
                    );
                    response = {
                        type: 'general',
                        message: plan,
                        metadata: { weakTopics: topicMastery2, upcomingExams },
                        suggestedActions: [
                            { label: '📝 Start Quiz', action: `quiz me on ${intent.subject || 'ML'}` },
                            { label: '📅 View Schedule', action: 'show my schedule' },
                        ],
                    };
                } catch {
                    response = {
                        type: 'general',
                        message: `## 🗺️ Quick Study Plan\n\n${weakTopics ? `Focus on these weak areas: ${weakTopics}` : 'Great work — no weak areas detected!'}\n\n${examInfo ? `Upcoming: ${examInfo}` : 'No exams scheduled yet.'}`,
                        metadata: {},
                        suggestedActions: [
                            { label: '📝 Take Quiz', action: 'quiz me' },
                        ],
                    };
                }
                break;
            }

            case 'General':
            default: {
                // Step 2e: LLM handles general conversation
                try {
                    const greeting = await ask(
                        `You are Drona AI, a friendly AI learning companion for college students.
You help with Machine Learning, Data Structures & Algorithms, and Database Systems.
Be warm, concise, and helpful. Use emojis sparingly. Keep responses under 100 words.
If the user greets you, introduce yourself briefly and suggest what they can do.`,
                        message,
                        { temperature: 0.8, maxTokens: 300 }
                    );
                    response = {
                        type: 'general',
                        message: greeting,
                        metadata: {},
                        suggestedActions: [
                            { label: '🤖 Learn ML', action: 'explain machine learning' },
                            { label: '📝 DSA Quiz', action: 'quiz me on DSA' },
                            { label: '📊 My Progress', action: 'show my progress' },
                            { label: '📅 Schedule', action: 'show my schedule' },
                        ],
                    };
                } catch {
                    response = {
                        type: 'general',
                        message: `🏹 Hey ${session.user.name || 'there'}! I'm Drona AI — your AI learning companion. Ask me to explain a concept, generate a quiz, or manage your schedule!`,
                        metadata: {},
                        suggestedActions: [
                            { label: '🤖 Learn ML', action: 'explain machine learning' },
                            { label: '📝 DSA Quiz', action: 'quiz me on DSA' },
                        ],
                    };
                }
            }
        }

        return NextResponse.json({
            ...response,
            intent: intent.intent,
            detectedSubject: intent.subject,
        });
    } catch (error) {
        console.error('Chat error:', error);
        return NextResponse.json(
            { error: 'An error occurred processing your message' },
            { status: 500 }
        );
    }
}
