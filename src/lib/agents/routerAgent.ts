/**
 * Router Agent — LLM-based intent classification
 * 
 * Sends user message to the LLM and gets back structured JSON:
 * { intent, subject, topic, params }
 */
import { askJSON } from '../llm';

export type IntentType = 'Explanation' | 'QuizRequest' | 'Evaluation' | 'GradeQuery' | 'Scheduling' | 'AssignmentQuery' | 'LearningPath' | 'General';

interface IntentResult {
    intent: IntentType;
    confidence: number;
    subject?: string;
    topic?: string;
    params: Record<string, string>;
}

const ROUTER_SYSTEM_PROMPT = `You are a smart router for an educational LMS called Drona AI.
Your job: classify the user's message into one of these intents:

1. **Explanation** — User wants to learn/understand a concept (e.g., "explain backpropagation", "what is normalization?", "teach me about joins")
2. **QuizRequest** — User wants a quiz/test (e.g., "quiz me on ML", "give me 5 DSA questions", "test my knowledge")
3. **Evaluation** — User wants to see their QUIZ progress/analytics/performance stats (e.g., "show my progress", "how am I doing?", "my quiz scores", "my performance")
4. **GradeQuery** — User asks about their COLLEGE GRADES/MARKS (e.g., "what is my grade in ML", "show my marks", "my grades", "college marks", "minor 1 marks", "what did I score in DBMS")
5. **Scheduling** — User wants to ADD/CREATE a NEW schedule event with a specific date/time (e.g., "I have ML quiz on 24 march 4 pm", "schedule exam tomorrow", "add assignment deadline on friday")
6. **AssignmentQuery** — User asks about EXISTING assignments, what's due, pending tasks, or existing schedule events (e.g., "what assignments are due?", "what's due this week?", "show my schedule", "what exams do I have?", "upcoming events", "upcoming quiz", "upcoming assignment")
7. **LearningPath** — User wants a study plan or revision path (e.g., "I want to revise ML by next Tuesday", "make a study plan", "prepare me for the exam")
8. **General** — Greeting, thanks, or anything else (e.g., "hi", "thanks", "who are you")

CRITICAL RULES:
- If the user is ASKING about existing events/assignments/due dates → AssignmentQuery (NOT Scheduling)
- If the user is CREATING/ADDING a new event with a date → Scheduling
- If the user mentions "grade", "marks", "college marks", "score in [subject]" → GradeQuery (NOT Evaluation)
- "Evaluation" is for quiz performance, streaks, topic mastery only
- "what assignments are due" = AssignmentQuery
- "I have exam on [date]" = Scheduling

Also detect:
- **subject**: "ML" (Machine Learning), "DSA" (Data Structures & Algorithms), "DB" (Database Systems), or null
- **topic**: Specific topic if mentioned (e.g., "backpropagation", "binary trees", "normalization"), or null
- **params**: Any extra parameters like count (number of questions), difficulty, date, time

Respond with ONLY valid JSON:
{
  "intent": "Explanation|QuizRequest|Evaluation|GradeQuery|Scheduling|AssignmentQuery|LearningPath|General",
  "confidence": 0.0-1.0,
  "subject": "ML|DSA|DB|null",
  "topic": "string or null",
  "params": { "count": "5", "difficulty": "easy", "date": "24 march", "time": "4 pm" }
}`;

export async function routeIntent(message: string): Promise<IntentResult> {
    const lower = message.toLowerCase();

    // Pre-LLM keyword guard — catch common misclassifications before LLM call
    if (/\b(what.*due|what.*assignment|assignments?\s*due|pending\s*assignment|upcoming\s*(event|quiz|exam|test|assignment|project|deadline)|show.*schedule|what.*exam)\b/i.test(lower) && !/\b(add|create|schedule.*on|have.*on)\b/i.test(lower)) {
        return { intent: 'AssignmentQuery', confidence: 0.9, params: {} };
    }
    if (/\b(my\s*grade|my\s*marks|college\s*grade|college\s*marks|show.*grade|show.*marks|what.*grade|what.*marks|score\s*in)\b/i.test(lower)) {
        const subject = /\b(ml|machine\s*learning)\b/i.test(lower) ? 'ML'
            : /\b(dsa|data\s*structure)/i.test(lower) ? 'DSA'
                : /\b(db|dbms|database)/i.test(lower) ? 'DB'
                    : undefined;
        return { intent: 'GradeQuery', confidence: 0.9, subject, params: {} };
    }

    try {
        const result = await askJSON<{
            intent: IntentType;
            confidence: number;
            subject: string | null;
            topic: string | null;
            params: Record<string, string>;
        }>(ROUTER_SYSTEM_PROMPT, message, { temperature: 0.1, maxTokens: 256 });

        // Post-LLM safety: override Scheduling if user is ASKING (not adding)
        if (result.intent === 'Scheduling' && /\b(what|show|list|view|my)\b/i.test(lower) && !/\b(add|create|have.*on|on\s+\d|at\s+\d)\b/i.test(lower)) {
            result.intent = 'AssignmentQuery';
        }

        return {
            intent: result.intent || 'General',
            confidence: result.confidence || 0.5,
            subject: result.subject || undefined,
            topic: result.topic || undefined,
            params: result.params || {},
        };
    } catch (error) {
        console.error('Router LLM error, falling back:', error);
        return fallbackRoute(message);
    }
}

/** Simple fallback if LLM fails */
function fallbackRoute(message: string): IntentResult {
    const lower = message.toLowerCase();
    let intent: IntentType = 'General';
    if (/\b(explain|what is|how does|teach|describe|define)\b/i.test(lower)) intent = 'Explanation';
    else if (/\b(quiz|test me|questions)\b/i.test(lower)) intent = 'QuizRequest';
    else if (/\b(grade|marks|college marks|minor|major|scored)\b/i.test(lower)) intent = 'GradeQuery';
    else if (/\b(progress|performance|analytics|how am i|streak)\b/i.test(lower)) intent = 'Evaluation';
    else if (/\b(schedule.*on|deadline.*on|exam on|tomorrow|next week)\b/i.test(lower) && /\b(add|have|on|at)\b/.test(lower)) intent = 'Scheduling';
    else if (/\b(assignment|due|submit|pending|what.*due|upcoming)\b/i.test(lower)) intent = 'AssignmentQuery';
    else if (/\b(revise|study plan|learning path|prepare|revision)\b/i.test(lower)) intent = 'LearningPath';

    return { intent, confidence: 0.3, params: {} };
}
