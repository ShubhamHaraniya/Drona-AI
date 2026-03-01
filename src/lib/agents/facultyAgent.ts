/**
 * Faculty Agent — bridges teacher actions and student-facing systems
 * 
 * Capabilities:
 * 1. Schedule Broadcast — push teacher events to all enrolled students
 * 2. Grade Relay — trigger progress recalculation on grade entry
 * 3. Material Gap Flagging — notify when Query Agent has low confidence
 * 4. PDF Topic Extraction — extract key topics from assignment descriptions
 */
import { askJSON } from '../llm';

interface TopicExtraction {
    topics: string[];
    prerequisites: string[];
    estimatedHours: number;
}

interface BroadcastResult {
    studentCount: number;
    eventType: string;
    eventTitle: string;
}

const TOPIC_EXTRACTION_PROMPT = `You are an academic content analyzer for Drona AI LMS.
Given an assignment or exam description, extract:
1. **topics** — specific topics the student needs to know (e.g., "B+ Trees", "Gradient Descent")
2. **prerequisites** — foundational topics needed before studying the main topics
3. **estimatedHours** — estimated preparation hours (1-20)

Respond with ONLY valid JSON:
{
  "topics": ["topic1", "topic2"],
  "prerequisites": ["prereq1"],
  "estimatedHours": 4
}`;

/**
 * Extract topics from an assignment/exam description
 */
export async function extractTopics(description: string, subject: string): Promise<TopicExtraction> {
    try {
        const result = await askJSON<TopicExtraction>(
            TOPIC_EXTRACTION_PROMPT,
            `Subject: ${subject}\nDescription: ${description}`,
            { temperature: 0.2, maxTokens: 512 }
        );
        return {
            topics: result.topics || [],
            prerequisites: result.prerequisites || [],
            estimatedHours: result.estimatedHours || 4,
        };
    } catch {
        return { topics: [], prerequisites: [], estimatedHours: 4 };
    }
}

/**
 * Generate a broadcast confirmation message for teacher
 */
export function generateBroadcastMessage(result: BroadcastResult): string {
    const emoji: Record<string, string> = { exam: '📝', quiz: '🎯', assignment: '📋', project: '🛠️', revision: '📖' };
    return `## 📡 Schedule Broadcast Complete\n\n${emoji[result.eventType] || '📅'} **${result.eventTitle}**\n\nPushed to **${result.studentCount}** enrolled students.\nEach student's Pathfinder will auto-schedule revision blocks before this event.`;
}

/**
 * Check if teacher-entered grades should trigger any alerts
 */
export function analyzeGradeImpact(grades: Array<{ marks: number; totalMarks: number }>): {
    classAverage: number;
    belowThreshold: number;
    alert: string | null;
} {
    const percentages = grades.map(g => (g.marks / g.totalMarks) * 100);
    const classAverage = percentages.reduce((a, b) => a + b, 0) / percentages.length;
    const belowThreshold = percentages.filter(p => p < 40).length;

    let alert: string | null = null;
    if (belowThreshold > grades.length * 0.5) {
        alert = `⚠️ Over 50% of students scored below 40%. Consider a revision lecture.`;
    } else if (classAverage < 50) {
        alert = `📊 Class average is ${Math.round(classAverage)}% — below expected. Additional support may be needed.`;
    }

    return { classAverage: Math.round(classAverage), belowThreshold, alert };
}

/**
 * Generate material gap notification for teacher
 */
export function flagMaterialGap(topic: string, subject: string): string {
    return `## 📢 Material Gap Detected\n\nThe AI tutor couldn't find sufficient material on **"${topic}"** in **${subject}**.\n\nPlease upload relevant documentation (lecture notes, reference PDFs) so students get accurate answers on this topic.`;
}
