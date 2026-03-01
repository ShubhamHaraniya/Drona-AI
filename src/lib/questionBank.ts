import mlQuestions from './data/ml-questions.json';
import dsaQuestions from './data/dsa-questions.json';
import dbQuestions from './data/db-questions.json';
import subjects from './data/subjects.json';
import type { Question } from './types';

// --- All Questions ---
const allQuestions: Question[] = [
    ...(mlQuestions as Question[]),
    ...(dsaQuestions as Question[]),
    ...(dbQuestions as Question[]),
];

// --- Get by Subject ---
export function getQuestionsBySubject(subject: string): Question[] {
    return allQuestions.filter(
        (q) => q.subject.toLowerCase().includes(subject.toLowerCase()) ||
            subjects.find(s => s.code.toLowerCase() === subject.toLowerCase())?.name === q.subject
    );
}

// --- Get by Difficulty ---
export function getQuestionsByDifficulty(difficulty: string): Question[] {
    return allQuestions.filter((q) => q.difficulty === difficulty);
}

// --- Get by Topic ---
export function getQuestionsByTopic(topic: string): Question[] {
    return allQuestions.filter(
        (q) => q.topic.toLowerCase().includes(topic.toLowerCase())
    );
}

// --- Filter and Select ---
export function filterQuestions(params: {
    subject?: string;
    difficulty?: string;
    module?: string;
    topic?: string;
    type?: string;
    count?: number;
    excludeIds?: string[];
}): Question[] {
    let filtered = [...allQuestions];

    if (params.subject) {
        const subjectMeta = subjects.find(
            s => s.code.toLowerCase() === params.subject!.toLowerCase() ||
                s.name.toLowerCase().includes(params.subject!.toLowerCase())
        );
        if (subjectMeta) {
            filtered = filtered.filter(q => q.subject === subjectMeta.name);
        }
    }

    if (params.difficulty) {
        filtered = filtered.filter(q => q.difficulty === params.difficulty);
    }

    if (params.module) {
        filtered = filtered.filter(
            q => q.module.toLowerCase().includes(params.module!.toLowerCase())
        );
    }

    if (params.topic) {
        filtered = filtered.filter(
            q => q.topic.toLowerCase().includes(params.topic!.toLowerCase())
        );
    }

    if (params.type) {
        filtered = filtered.filter(q => q.type === params.type);
    }

    if (params.excludeIds?.length) {
        filtered = filtered.filter(q => !params.excludeIds!.includes(q.id));
    }

    // Shuffle for randomness
    filtered = shuffleArray(filtered);

    if (params.count) {
        filtered = filtered.slice(0, params.count);
    }

    return filtered;
}

// --- Shuffle ---
function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// --- Get Subject Metadata ---
export function getSubjectByCode(code: string) {
    return subjects.find(s => s.code.toLowerCase() === code.toLowerCase());
}

export function getAllSubjects() {
    return subjects;
}

export function getQuestionById(id: string): Question | undefined {
    return allQuestions.find(q => q.id === id);
}

export function getAdaptiveQuestions(params: {
    subject: string;
    currentLevel: string;
    count: number;
    excludeIds?: string[];
}): Question[] {
    // Get questions at current level
    let questions = filterQuestions({
        subject: params.subject,
        difficulty: params.currentLevel,
        count: Math.ceil(params.count * 0.6),
        excludeIds: params.excludeIds,
    });

    // Add some from adjacent difficulty
    const difficultyOrder = ['Easy', 'Medium', 'Hard'];
    const currentIdx = difficultyOrder.indexOf(params.currentLevel);

    if (currentIdx > 0) {
        questions = [
            ...questions,
            ...filterQuestions({
                subject: params.subject,
                difficulty: difficultyOrder[currentIdx - 1],
                count: Math.ceil(params.count * 0.2),
                excludeIds: [...(params.excludeIds || []), ...questions.map(q => q.id)],
            }),
        ];
    }

    if (currentIdx < difficultyOrder.length - 1) {
        questions = [
            ...questions,
            ...filterQuestions({
                subject: params.subject,
                difficulty: difficultyOrder[currentIdx + 1],
                count: Math.ceil(params.count * 0.2),
                excludeIds: [...(params.excludeIds || []), ...questions.map(q => q.id)],
            }),
        ];
    }

    return shuffleArray(questions).slice(0, params.count);
}

export { allQuestions, subjects };
