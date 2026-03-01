/**
 * Quiz Agent — LLM generates quiz questions dynamically
 * 
 * Flow:
 * 1. LLM generates N MCQ questions on the requested topic
 * 2. Questions include correct answers (stored in metadata, not shown to student)
 * 3. Frontend displays questions, collects answers
 * 4. On submit, answers are graded against stored correct answers
 */
import { askJSON } from '../llm';
import type { AgentResponse } from '../types';
import { generateId } from '../utils';

interface LLMQuestion {
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    topic: string;
    difficulty: string;
}

const QUIZ_SYSTEM_PROMPT = `You are a quiz generator for college students studying Machine Learning, Data Structures & Algorithms, and Database Systems.

Generate quiz questions based on the user's request. Each question MUST be:
- Relevant to the subject/topic requested
- Factually correct with ONE clear correct answer
- Options should be plausible (no joke/obvious-wrong answers)
- Include a brief explanation of WHY the correct answer is right

Respond with ONLY valid JSON:
{
  "subject": "Machine Learning|Data Structures & Algorithms|Database Systems",
  "questions": [
    {
      "question": "What is the time complexity of binary search?",
      "options": ["O(n)", "O(log n)", "O(n²)", "O(1)"],
      "correctAnswer": "O(log n)",
      "explanation": "Binary search halves the search space in each step, so it takes log₂(n) comparisons.",
      "topic": "Binary Search",
      "difficulty": "Easy"
    }
  ]
}

Rules:
- Generate EXACTLY the number of questions requested (default: 5)
- Each question has EXACTLY 4 options
- correctAnswer MUST be one of the options (exact match)
- Mix topics within the subject for variety
- Adjust difficulty based on request (Easy/Medium/Hard/Mixed)`;

export async function handleQuizRequest(
    message: string,
    params: Record<string, string> = {},
    context?: { currentLevel?: string }
): Promise<AgentResponse> {
    try {
        const count = parseInt(params.count || '5');
        const difficulty = params.difficulty || context?.currentLevel || 'Mixed';

        const prompt = `Generate ${count} ${difficulty} MCQ questions. User request: "${message}"`;

        const result = await askJSON<{
            subject: string;
            questions: LLMQuestion[];
        }>(QUIZ_SYSTEM_PROMPT, prompt, {
            temperature: 0.8,
            maxTokens: 4000,
        });

        if (!result.questions?.length) {
            throw new Error('No questions generated');
        }

        // Format questions for frontend (strip correct answers from displayed data)
        const questions = result.questions.map((q, i) => ({
            id: `llm-${generateId()}-${i}`,
            type: 'MCQ' as const,
            difficulty: q.difficulty || difficulty,
            question: q.question,
            topic: q.topic || 'General',
            module: result.subject || 'General',
            options: q.options,
            estimatedTimeSeconds: 60,
        }));

        // Store correct answers separately in metadata (for grading later)
        const answerKey = result.questions.map((q, i) => ({
            questionId: questions[i].id,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            topic: q.topic,
        }));

        return {
            type: 'quiz',
            message: `## 📝 Quiz Ready: ${result.subject || 'General'}\n\n📊 **${questions.length} questions** • ${difficulty} difficulty\n\n_Click **Start Quiz** when you're ready!_`,
            metadata: {
                questions,
                answerKey,  // Hidden from UI, used for grading
                quizConfig: {
                    subject: result.subject || 'General',
                    count: questions.length,
                    difficulty,
                },
            },
            suggestedActions: [
                { label: '🚀 Start Quiz', action: 'START_QUIZ' },
                { label: '🔄 Different quiz', action: `quiz me on ${result.subject || 'something else'}` },
            ],
        };
    } catch (error) {
        console.error('Quiz Agent error:', error);
        return {
            type: 'quiz',
            message: '⚠️ I had trouble generating quiz questions. Please try again!\n\n_Tip: Try "Quiz me on 5 ML questions" or "Test me on databases"_',
            metadata: {},
            suggestedActions: [
                { label: '🔄 Try again', action: message },
                { label: '📖 Learn instead', action: 'explain machine learning' },
            ],
        };
    }
}
