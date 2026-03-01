// ─── Subject & Topic Hierarchy ───

export interface Topic {
    id: string;
    name: string;
}

export interface Module {
    id: string;
    name: string;
    topics: Topic[];
}

export interface Subject {
    id: string;
    name: string;
    code: string;
    accentColor: string;
    modules: Module[];
}

// ─── Question System ───

export type QuestionType = 'MCQ' | 'Numerical' | 'MSQ';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Question {
    id: string;
    subject: string;
    type: QuestionType;
    difficulty: Difficulty;
    module: string;
    topic: string;
    question: string;
    options?: string[];
    correctAnswer?: string | number;
    correctAnswers?: string[];
    explanation: string;
    tags: string[];
    estimatedTimeSeconds: number;
}

// ─── Quiz System ───

export interface QuizConfig {
    subject: string;
    topics: string[];
    types: QuestionType[];
    countPerType: number;
    difficulty: Difficulty | 'Mixed';
    timerEnabled: boolean;
    timerMinutes: number;
    shuffle: boolean;
}

export interface QuizAnswer {
    questionId: string;
    answer: string | number | string[] | null;
    confidence: 'Low' | 'Medium' | 'High';
    timeTaken: number;
}

export interface TopicScore {
    topic: string;
    correct: number;
    total: number;
    percentage: number;
}

export interface QuestionReview {
    questionId: string;
    question: string;
    type: QuestionType;
    userAnswer: string | number | string[] | null;
    correctAnswer: string | number | string[];
    isCorrect: boolean;
    score: number;
    explanation: string;
    confidence: 'Low' | 'Medium' | 'High';
}

export interface QuizResult {
    id: string;
    subject: string;
    score: number;
    maxScore: number;
    percentage: number;
    topicBreakdown: TopicScore[] | Record<string, { correct: number; total: number }> | string;
    weakAreas: string[] | string;
    recommendations: string[] | string;
    questionReview: QuestionReview[] | string;
    confidenceData?: { level: number; actualPerformance: number } | string;
    confidenceAnalysis?: ConfidenceAnalysis;
    timestamp: string;
}

// ─── Confidence Calibration ───

export interface ConfidenceEntry {
    questionId: string;
    confidence: 'Low' | 'Medium' | 'High';
    isCorrect: boolean;
}

export interface ConfidenceAnalysis {
    totalQuestions: number;
    overconfident: number;
    underconfident: number;
    wellCalibrated: number;
    pattern: 'overconfident' | 'underconfident' | 'well-calibrated' | 'mixed';
    feedback: string;
}

// ─── Student Progress ───

export interface SubjectStat {
    subject: string;
    totalQuizzes: number;
    avgScore: number;
    totalQuestions: number;
    correctAnswers: number;
    lastQuizDate: string;
}

export interface StudentProgress {
    quizHistory: QuizResult[];
    subjectStats: Record<string, SubjectStat>;
    topicMastery: Record<string, number>;
    streak: number;
    lastActiveDate: string;
    upcomingSchedules: ScheduleEvent[];
    confidencePatterns: ConfidenceEntry[];
    adaptiveDifficultyLevel: Record<string, Difficulty>;
}

// ─── Schedule ───

export interface ScheduleEvent {
    id: string;
    type: 'exam' | 'assignment' | 'revision' | 'quiz' | 'deadline' | 'study';
    subject: string;
    title: string;
    datetime: string;
}

// ─── Agents ───

export type AgentIntent = 'Explanation' | 'QuizRequest' | 'Evaluation' | 'Scheduling' | 'General';

export interface RouterResult {
    intent: AgentIntent;
    subject: string;
    topic: string;
    confidence: number;
}

export interface AgentResponse {
    type: 'explanation' | 'quiz' | 'evaluation' | 'schedule' | 'general';
    message: string;
    suggestions?: string[];
    suggestedActions?: Array<{ label: string; action: string }>;
    quizConfig?: QuizConfig;
    schedule?: ScheduleEvent;
    metadata?: Record<string, unknown>;
}

// ─── Knowledge / RAG ───

export interface KnowledgeChunk {
    id: string;
    subject: string;
    module: string;
    topic: string;
    title: string;
    content: string;
    keywords: string[];
    pageRef: string;
    embedding?: number[];
}

// ─── Learning Path ───

export interface DailyTask {
    id: string;
    description: string;
    subject: string;
    topic: string;
    type: 'study' | 'quiz' | 'revision' | 'practice';
    completed: boolean;
    estimatedMinutes: number;
}

export interface WeeklyPlan {
    weekNumber: number;
    theme: string;
    days: { day: string; tasks: DailyTask[] }[];
}

export interface LearningPath {
    generatedAt: string;
    currentWeek: WeeklyPlan;
    focusAreas: string[];
    spacedRepetitionTopics: { topic: string; nextReview: string; interval: number }[];
    difficultyProgression: Record<string, string>;
}

// ─── Chat ───

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    agent?: string;
    timestamp: string;
    suggestions?: string[];
}

// ─── Auth ───

export interface SessionUser {
    id: string;
    name: string;
    email: string;
    role: 'STUDENT' | 'ADMIN';
}
