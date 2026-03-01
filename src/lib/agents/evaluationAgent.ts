/**
 * Evaluation Agent — LLM-powered quiz analysis and progress overview
 * 
 * Two modes:
 * 1. analyzeQuizResults — After quiz submission, LLM explains each answer
 * 2. handleProgressOverview — LLM summarizes student's overall progress
 */
import { ask } from '../llm';
import type { AgentResponse, StudentProgress } from '../types';

interface QuestionReviewItem {
    questionId: string;
    question: string;
    userAnswer: string | number | string[];
    correctAnswer: string | number | string[];
    isCorrect: boolean;
    explanation: string;
    topic: string;
}

/**
 * Analyze quiz results — called after quiz submission
 */
export async function handleEvaluation(
    quizResult: {
        subject: string;
        score: number;
        maxScore: number;
        percentage: number;
        questionReview: QuestionReviewItem[];
        weakAreas: string[];
    },
    confidenceLevel?: number
): Promise<AgentResponse> {
    try {
        const systemPrompt = `You are Drona AI, an AI tutor reviewing a student's quiz results.

Analyze their performance and provide:
1. A brief encouraging summary of how they did
2. Analysis of what they got right and wrong
3. Specific advice on weak areas
4. Next steps recommendation

Use markdown formatting. Be encouraging but honest. Keep it concise (150-250 words).
If they scored high, celebrate! If low, be supportive and give actionable advice.`;

        const reviewSummary = quizResult.questionReview.map((r, i) =>
            `Q${i + 1}: "${r.question}" → ${r.isCorrect ? '✅ Correct' : `❌ Wrong (answered: ${r.userAnswer}, correct: ${r.correctAnswer})`} | Topic: ${r.topic}`
        ).join('\n');

        const userPrompt = `Subject: ${quizResult.subject}
Score: ${quizResult.score}/${quizResult.maxScore} (${Math.round(quizResult.percentage)}%)
${confidenceLevel !== undefined ? `Student's confidence level: ${confidenceLevel}%` : ''}
Weak areas: ${quizResult.weakAreas.length > 0 ? quizResult.weakAreas.join(', ') : 'None'}

Question-by-question breakdown:
${reviewSummary}`;

        const analysis = await ask(systemPrompt, userPrompt, {
            temperature: 0.7,
            maxTokens: 1000,
        });

        return {
            type: 'evaluation',
            message: analysis,
            metadata: {
                score: quizResult.score,
                maxScore: quizResult.maxScore,
                percentage: quizResult.percentage,
                questionReview: quizResult.questionReview,
            },
            suggestedActions: [
                { label: '📝 Retry Quiz', action: `quiz me on ${quizResult.subject}` },
                ...(quizResult.weakAreas.length > 0
                    ? [{ label: `📖 Study ${quizResult.weakAreas[0]}`, action: `explain ${quizResult.weakAreas[0]}` }]
                    : []),
                { label: '📈 View Progress', action: 'show my progress' },
            ],
        };
    } catch (error) {
        console.error('Evaluation Agent error:', error);
        // Fallback without LLM
        const pct = Math.round(quizResult.percentage);
        const emoji = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : pct >= 40 ? '📚' : '💪';
        return {
            type: 'evaluation',
            message: `${emoji} You scored **${quizResult.score}/${quizResult.maxScore}** (${pct}%)\n\n${quizResult.weakAreas.length > 0
                    ? `**Areas to review:** ${quizResult.weakAreas.join(', ')}`
                    : 'Great job! No major weak areas.'
                }`,
            metadata: { questionReview: quizResult.questionReview },
            suggestedActions: [
                { label: '📝 Try Again', action: `quiz me on ${quizResult.subject}` },
            ],
        };
    }
}

/**
 * Generate progress overview — called when user asks about their performance
 */
export async function handleProgressOverview(progress: StudentProgress): Promise<AgentResponse> {
    try {
        const systemPrompt = `You are Drona AI, reviewing a student's learning progress.

Provide a brief, encouraging progress summary with:
1. Overall stats and streak
2. Subject-wise performance highlights
3. Areas that need attention
4. Actionable recommendations

Use markdown formatting. Keep it concise (100-200 words). Be motivating!`;

        const statsStr = Object.entries(progress.subjectStats)
            .map(([subject, stats]) => {
                const s = stats as { totalQuizzes: number; avgScore?: number; averageScore?: number; bestScore?: number };
                return `${subject}: ${s.totalQuizzes} quizzes, avg ${Math.round(s.avgScore || s.averageScore || 0)}%`;
            })
            .join('\n');

        const weakTopics = Object.entries(progress.topicMastery)
            .filter(([, m]) => m < 50)
            .sort(([, a], [, b]) => a - b)
            .slice(0, 5)
            .map(([topic, m]) => `${topic}: ${Math.round(m)}%`)
            .join(', ');

        const userPrompt = `Streak: ${progress.streak} days
Total quizzes: ${progress.quizHistory?.length || 0}
Subject stats:\n${statsStr || 'No data yet'}
Weak topics: ${weakTopics || 'None identified'}`;

        const summary = await ask(systemPrompt, userPrompt, {
            temperature: 0.7,
            maxTokens: 800,
        });

        return {
            type: 'evaluation',
            message: summary,
            metadata: {},
            suggestedActions: [
                { label: '📝 Take Quiz', action: 'quiz me' },
                { label: '📈 Full Progress', action: 'VIEW_PROGRESS' },
            ],
        };
    } catch (error) {
        console.error('Progress overview error:', error);
        return {
            type: 'evaluation',
            message: `📊 **Your Progress**\n\n🔥 **${progress.streak}-day streak!**\n📝 ${progress.quizHistory?.length || 0} quizzes completed\n\n_Keep going!_`,
            metadata: {},
            suggestedActions: [
                { label: '📝 Take Quiz', action: 'quiz me' },
            ],
        };
    }
}
