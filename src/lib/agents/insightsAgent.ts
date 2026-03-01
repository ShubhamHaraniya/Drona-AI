/**
 * Insights Agent — aggregates and interprets performance data
 * 
 * Capabilities:
 * 1. Student Performance Summary — natural language summary per subject
 * 2. Peer Comparison — anonymized class-relative percentile bands
 * 3. Teacher Alerts — identify struggling topics across the class
 * 4. Topic Mastery Heatmap Data — aggregate scores for teacher dashboard
 */
import { ask } from '../llm';

interface SubjectStats {
    totalQuizzes: number;
    averageScore: number;
    bestScore: number;
    currentDifficulty: string;
}

interface TopicMastery {
    [topic: string]: number;
}

interface GradeData {
    componentType: string;
    marksObtained: number;
    totalMarks: number;
}

/**
 * Generate AI performance summary for a student's subject
 */
export async function generatePerformanceSummary(
    studentName: string,
    subject: string,
    stats: SubjectStats,
    grades: GradeData[],
    topicMastery: TopicMastery,
    upcomingEvents: Array<{ title: string; datetime: string; type: string }>,
): Promise<string> {
    const gradeStr = grades.map(g => `${g.componentType}: ${g.marksObtained}/${g.totalMarks} (${Math.round(g.marksObtained / g.totalMarks * 100)}%)`).join(', ');
    const weakTopics = Object.entries(topicMastery).filter(([, s]) => s < 50).map(([t]) => t);
    const strongTopics = Object.entries(topicMastery).filter(([, s]) => s >= 80).map(([t]) => t);
    const upcomingStr = upcomingEvents.map(e => `${e.title} on ${new Date(e.datetime).toLocaleDateString()}`).join(', ');

    const prompt = `Generate a concise, encouraging performance summary for ${studentName} in ${subject}.

Data:
- Quiz stats: ${stats.totalQuizzes} quizzes, avg ${Math.round(stats.averageScore)}%, best ${stats.bestScore}%
- College grades: ${gradeStr || 'No grades entered yet'}
- Strong topics: ${strongTopics.join(', ') || 'None yet'}
- Weak topics (< 50%): ${weakTopics.join(', ') || 'None'}
- Upcoming: ${upcomingStr || 'Nothing scheduled'}

Write 3-4 sentences highlighting strengths, areas to improve, and a study recommendation. Be specific about topic names. Use emojis sparingly.`;

    try {
        return await ask(prompt, '', { temperature: 0.6, maxTokens: 300 });
    } catch {
        const avg = Math.round(stats.averageScore);
        return `Your ${subject} performance is at ${avg}%. ${weakTopics.length > 0 ? `Focus on: ${weakTopics.join(', ')}.` : 'Great work across all topics!'} ${strongTopics.length > 0 ? `Strengths: ${strongTopics.join(', ')}.` : ''} Keep practicing!`;
    }
}

/**
 * Compute peer comparison — returns anonymized percentile band
 */
export function computePeerComparison(
    studentScore: number,
    allScores: number[]
): { percentile: number; band: string; aheadOf: number } {
    const sorted = [...allScores].sort((a, b) => a - b);
    const rank = sorted.findIndex(s => s >= studentScore);
    const percentile = Math.round(((rank + 1) / sorted.length) * 100);

    let band: string;
    if (percentile >= 90) band = '🏆 Top 10%';
    else if (percentile >= 75) band = '⭐ Top 25%';
    else if (percentile >= 50) band = '📊 Above Average';
    else if (percentile >= 25) band = '📈 Below Average';
    else band = '🎯 Needs Improvement';

    return { percentile, band, aheadOf: rank };
}

/**
 * Generate teacher alerts based on class-wide quiz performance
 */
export function generateTeacherAlerts(
    topicFailCounts: Record<string, { failCount: number; totalStudents: number }>,
    classGrades: Array<{ componentType: string; average: number }>
): Array<{ severity: 'warning' | 'critical' | 'info'; message: string }> {
    const alerts: Array<{ severity: 'warning' | 'critical' | 'info'; message: string }> = [];

    // Topic failure alerts
    for (const [topic, data] of Object.entries(topicFailCounts)) {
        const failRate = data.failCount / data.totalStudents;
        if (failRate > 0.7) {
            alerts.push({
                severity: 'critical',
                message: `🔴 ${Math.round(failRate * 100)}% of students failed "${topic}" 3+ times. Consider a revision lecture.`,
            });
        } else if (failRate > 0.5) {
            alerts.push({
                severity: 'warning',
                message: `🟡 ${Math.round(failRate * 100)}% of students are struggling with "${topic}".`,
            });
        }
    }

    // Grade alerts
    for (const g of classGrades) {
        if (g.average < 40) {
            alerts.push({
                severity: 'critical',
                message: `📉 Class average for ${g.componentType} is ${Math.round(g.average)}% — well below passing.`,
            });
        }
    }

    if (alerts.length === 0) {
        alerts.push({ severity: 'info', message: '✅ No critical issues detected. Class performance is on track.' });
    }

    return alerts;
}

/**
 * Build topic mastery heatmap data for teacher
 */
export function buildTopicHeatmap(
    studentTopics: Array<{ studentName: string; topics: Record<string, number> }>
): { topicName: string; averageMastery: number; studentCount: number; color: string }[] {
    const topicAgg: Record<string, { sum: number; count: number }> = {};

    for (const st of studentTopics) {
        for (const [topic, score] of Object.entries(st.topics)) {
            if (!topicAgg[topic]) topicAgg[topic] = { sum: 0, count: 0 };
            topicAgg[topic].sum += score;
            topicAgg[topic].count += 1;
        }
    }

    return Object.entries(topicAgg)
        .map(([topicName, { sum, count }]) => {
            const avg = Math.round(sum / count);
            return {
                topicName,
                averageMastery: avg,
                studentCount: count,
                color: avg >= 70 ? '#22c55e' : avg >= 40 ? '#f59e0b' : '#ef4444',
            };
        })
        .sort((a, b) => a.averageMastery - b.averageMastery);
}
