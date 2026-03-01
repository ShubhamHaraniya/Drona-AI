/**
 * Enriched Seed Data for Drona AI LMS
 * 
 * 5 students (distinct learning profiles) + 2 teachers
 * Rich data: 60+ grades, 60+ quizzes, 100+ topic entries, 50+ schedules, 25 to-dos
 */
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
const adapter = new PrismaBetterSqlite3({ url: dbUrl });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
    console.log('🌱 Starting enriched seed...');

    // Clear existing data
    await prisma.toDoItem.deleteMany();
    await prisma.topicProgress.deleteMany();
    await prisma.quizResult.deleteMany();
    await prisma.grade.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.material.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.studentProgress.deleteMany();
    await prisma.subject.deleteMany();
    await prisma.user.deleteMany();

    const hash = await bcrypt.hash('pass123', 10);

    // ── TEACHERS ──
    const teacher1 = await prisma.user.create({
        data: { name: 'Dr. Rajesh Kumar', email: 'rajesh.kumar@drona.edu', password: hash, role: 'TEACHER' },
    });
    const teacher2 = await prisma.user.create({
        data: { name: 'Dr. Priya Sharma', email: 'priya.sharma@drona.edu', password: hash, role: 'TEACHER' },
    });

    // ── STUDENTS ──
    const students = await Promise.all([
        prisma.user.create({ data: { name: 'Shubham Haraniya', email: 'spharaniya18@gmail.com', password: hash, role: 'STUDENT' } }),
        prisma.user.create({ data: { name: 'Aarav Patel', email: 'aarav.patel@drona.edu', password: hash, role: 'STUDENT' } }),
        prisma.user.create({ data: { name: 'Meera Joshi', email: 'meera.joshi@drona.edu', password: hash, role: 'STUDENT' } }),
        prisma.user.create({ data: { name: 'Vikram Singh', email: 'vikram.singh@drona.edu', password: hash, role: 'STUDENT' } }),
        prisma.user.create({ data: { name: 'Ananya Reddy', email: 'ananya.reddy@drona.edu', password: hash, role: 'STUDENT' } }),
    ]);
    const [shubham, aarav, meera, vikram, ananya] = students;
    console.log(`✅ Created ${students.length} students + 2 teachers`);

    // ── SUBJECTS ──
    const ml = await prisma.subject.create({ data: { name: 'Machine Learning', code: 'CS501', description: 'Supervised, unsupervised learning, neural networks, ensemble methods', teacherId: teacher1.id } });
    const dsa = await prisma.subject.create({ data: { name: 'Data Structures & Algorithms', code: 'CS301', description: 'Arrays, trees, graphs, DP, sorting, searching', teacherId: teacher1.id } });
    const dbms = await prisma.subject.create({ data: { name: 'Database Systems', code: 'CS401', description: 'SQL, normalization, indexing, transactions, B+ trees', teacherId: teacher2.id } });
    const subjects = [ml, dsa, dbms];
    console.log('✅ Created 3 subjects');

    // ── ENROLLMENTS (all 5 students × 3 subjects) ──
    for (const student of students) {
        for (const subject of subjects) {
            await prisma.enrollment.create({ data: { studentId: student.id, subjectId: subject.id } });
        }
    }
    console.log('✅ Created 15 enrollments');

    // ── STUDENT PROFILES (strengths/weaknesses) ──
    // Shubham: Strong ML, weak DBMS
    // Aarav: Balanced across all
    // Meera: Top performer
    // Vikram: Struggles with DSA
    // Ananya: Improving trend

    // ── GRADES (5 components × 3 subjects × 5 students = 75 grades) ──
    const components = ['Minor_1', 'Minor_2', 'Assignment', 'Lab'];
    const gradeProfiles: Record<string, Record<string, number[]>> = {
        [shubham.id]: { 'Machine Learning': [22, 23, 24, 22], 'Data Structures & Algorithms': [18, 19, 22, 20], 'Database Systems': [14, 16, 20, 15] },
        [aarav.id]: { 'Machine Learning': [19, 20, 22, 19], 'Data Structures & Algorithms': [18, 20, 21, 18], 'Database Systems': [18, 19, 22, 19] },
        [meera.id]: { 'Machine Learning': [24, 24, 25, 24], 'Data Structures & Algorithms': [23, 24, 25, 23], 'Database Systems': [22, 23, 24, 22] },
        [vikram.id]: { 'Machine Learning': [17, 18, 20, 17], 'Data Structures & Algorithms': [12, 14, 18, 13], 'Database Systems': [19, 20, 22, 20] },
        [ananya.id]: { 'Machine Learning': [16, 20, 22, 19], 'Data Structures & Algorithms': [19, 21, 23, 20], 'Database Systems': [15, 18, 21, 17] },
    };
    for (const student of students) {
        for (const subject of subjects) {
            const marks = gradeProfiles[student.id][subject.name];
            for (let ci = 0; ci < components.length; ci++) {
                await prisma.grade.create({
                    data: {
                        studentId: student.id,
                        subjectId: subject.id,
                        componentType: components[ci],
                        marksObtained: marks[ci],
                        totalMarks: 25,
                    },
                });
            }
        }
    }
    console.log('✅ Created 60 grades');

    // ── QUIZ RESULTS (diverse per student per subject, 4 quizzes each = 60) ──
    const quizProfiles: Record<string, Record<string, number[]>> = {
        [shubham.id]: { 'Machine Learning': [85, 90, 78, 92], 'Data Structures & Algorithms': [68, 72, 75, 80], 'Database Systems': [45, 52, 55, 60] },
        [aarav.id]: { 'Machine Learning': [72, 75, 70, 78], 'Data Structures & Algorithms': [65, 68, 72, 70], 'Database Systems': [70, 72, 75, 78] },
        [meera.id]: { 'Machine Learning': [92, 95, 88, 96], 'Data Structures & Algorithms': [90, 88, 92, 95], 'Database Systems': [85, 88, 90, 92] },
        [vikram.id]: { 'Machine Learning': [55, 60, 58, 65], 'Data Structures & Algorithms': [40, 45, 42, 50], 'Database Systems': [72, 75, 78, 80] },
        [ananya.id]: { 'Machine Learning': [60, 68, 75, 80], 'Data Structures & Algorithms': [75, 78, 82, 85], 'Database Systems': [50, 58, 65, 72] },
    };
    const difficulties = ['Easy', 'Medium', 'Medium', 'Hard'];
    for (const student of students) {
        for (const subject of subjects) {
            const scores = quizProfiles[student.id][subject.name];
            for (let qi = 0; qi < scores.length; qi++) {
                const pct = scores[qi];
                const maxS = 10;
                const sc = Math.round(pct * maxS / 100);
                await prisma.quizResult.create({
                    data: {
                        userId: student.id,
                        subject: subject.name,
                        score: sc,
                        maxScore: maxS,
                        percentage: pct,
                        topicBreakdown: JSON.stringify({}),
                        weakAreas: JSON.stringify(pct < 60 ? ['Needs review'] : []),
                        recommendations: JSON.stringify(['Practice more']),
                        questionReview: JSON.stringify([]),
                        confidenceData: JSON.stringify({ level: 50 + qi * 10, actualPerformance: pct }),
                        createdAt: new Date(Date.now() - (4 - qi) * 7 * 86400000),
                    },
                });
            }
        }
    }
    console.log('✅ Created 60 quiz results');

    // ── TOPIC PROGRESS (varied mastery across topics) ──
    const topicData: Record<string, Array<{ topic: string; subject: string }>> = {
        ML: [
            { topic: 'Linear Regression', subject: 'Machine Learning' },
            { topic: 'Logistic Regression', subject: 'Machine Learning' },
            { topic: 'Decision Trees', subject: 'Machine Learning' },
            { topic: 'Random Forest', subject: 'Machine Learning' },
            { topic: 'SVM', subject: 'Machine Learning' },
            { topic: 'Neural Networks', subject: 'Machine Learning' },
            { topic: 'Backpropagation', subject: 'Machine Learning' },
            { topic: 'CNN', subject: 'Machine Learning' },
            { topic: 'Gradient Descent', subject: 'Machine Learning' },
            { topic: 'Ensemble Methods', subject: 'Machine Learning' },
        ],
        DSA: [
            { topic: 'Arrays & Strings', subject: 'Data Structures & Algorithms' },
            { topic: 'Linked Lists', subject: 'Data Structures & Algorithms' },
            { topic: 'Stacks & Queues', subject: 'Data Structures & Algorithms' },
            { topic: 'Binary Trees', subject: 'Data Structures & Algorithms' },
            { topic: 'BST', subject: 'Data Structures & Algorithms' },
            { topic: 'Graphs', subject: 'Data Structures & Algorithms' },
            { topic: 'Dynamic Programming', subject: 'Data Structures & Algorithms' },
            { topic: 'Sorting', subject: 'Data Structures & Algorithms' },
            { topic: 'Hashing', subject: 'Data Structures & Algorithms' },
            { topic: 'Greedy Algorithms', subject: 'Data Structures & Algorithms' },
        ],
        DBMS: [
            { topic: 'SQL Basics', subject: 'Database Systems' },
            { topic: 'Normalization', subject: 'Database Systems' },
            { topic: 'ER Diagrams', subject: 'Database Systems' },
            { topic: 'Indexing', subject: 'Database Systems' },
            { topic: 'B+ Trees', subject: 'Database Systems' },
            { topic: 'Transactions', subject: 'Database Systems' },
            { topic: 'Concurrency Control', subject: 'Database Systems' },
            { topic: 'SQL Joins', subject: 'Database Systems' },
            { topic: 'Query Optimization', subject: 'Database Systems' },
            { topic: 'ACID Properties', subject: 'Database Systems' },
        ],
    };

    // Mastery scores per student (varied profiles)
    const masteryProfiles: Record<string, Record<string, number[]>> = {
        [shubham.id]: {
            ML: [90, 85, 82, 88, 75, 80, 78, 72, 85, 80],
            DSA: [75, 70, 72, 65, 60, 55, 50, 70, 68, 62],
            DBMS: [50, 45, 55, 35, 30, 40, 38, 48, 42, 52],
        },
        [aarav.id]: {
            ML: [72, 70, 75, 68, 65, 70, 72, 68, 74, 70],
            DSA: [68, 65, 70, 62, 60, 58, 55, 68, 65, 62],
            DBMS: [75, 72, 78, 70, 68, 72, 70, 75, 68, 74],
        },
        [meera.id]: {
            ML: [95, 92, 90, 94, 88, 92, 90, 85, 93, 91],
            DSA: [92, 90, 88, 85, 82, 80, 78, 90, 88, 85],
            DBMS: [88, 85, 90, 82, 80, 85, 82, 88, 80, 86],
        },
        [vikram.id]: {
            ML: [60, 55, 58, 52, 48, 55, 50, 45, 58, 52],
            DSA: [42, 38, 40, 35, 30, 28, 25, 40, 35, 32],
            DBMS: [78, 75, 80, 72, 70, 75, 72, 78, 68, 76],
        },
        [ananya.id]: {
            ML: [65, 60, 68, 72, 58, 62, 60, 55, 70, 65],
            DSA: [80, 78, 82, 75, 72, 70, 68, 80, 76, 74],
            DBMS: [55, 50, 58, 45, 40, 48, 42, 55, 48, 52],
        },
    };

    for (const student of students) {
        for (const [subjectKey, topics] of Object.entries(topicData)) {
            const scores = masteryProfiles[student.id][subjectKey];
            for (let ti = 0; ti < topics.length; ti++) {
                const mastery = scores[ti];
                await prisma.topicProgress.create({
                    data: {
                        studentId: student.id,
                        subjectName: topics[ti].subject,
                        topicName: topics[ti].topic,
                        masteryScore: mastery,
                        failCount: mastery < 40 ? 3 : mastery < 60 ? 1 : 0,
                        quizCount: 3 + Math.floor(Math.random() * 4),
                        revisionScheduled: mastery < 35,
                    },
                });
            }
        }
    }
    console.log('✅ Created 150 topic progress entries');

    // ── STUDENT PROGRESS (aggregated JSON) ──
    for (const student of students) {
        const subjectStats: Record<string, { totalQuizzes: number; averageScore: number; bestScore: number; currentDifficulty: string }> = {};
        const topicMastery: Record<string, number> = {};
        for (const subject of subjects) {
            const scores = quizProfiles[student.id][subject.name];
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            subjectStats[subject.name] = {
                totalQuizzes: scores.length,
                averageScore: avg,
                bestScore: Math.max(...scores),
                currentDifficulty: avg >= 80 ? 'Hard' : avg >= 60 ? 'Medium' : 'Easy',
            };
        }
        // Add topic mastery from all subjects
        for (const [subjectKey, topics] of Object.entries(topicData)) {
            const scores = masteryProfiles[student.id][subjectKey];
            for (let ti = 0; ti < topics.length; ti++) {
                topicMastery[topics[ti].topic] = scores[ti];
            }
        }
        await prisma.studentProgress.create({
            data: {
                userId: student.id,
                subjectStats: JSON.stringify(subjectStats),
                topicMastery: JSON.stringify(topicMastery),
                streak: Math.floor(Math.random() * 10) + 1,
                lastActiveDate: new Date().toISOString().split('T')[0],
                confidencePatterns: JSON.stringify([
                    { confidence: 60, performance: 70, date: new Date().toISOString() },
                ]),
                adaptiveDifficulty: JSON.stringify({
                    'Machine Learning': subjectStats['Machine Learning'].currentDifficulty,
                    'Data Structures & Algorithms': subjectStats['Data Structures & Algorithms'].currentDifficulty,
                    'Database Systems': subjectStats['Database Systems'].currentDifficulty,
                }),
            },
        });
    }
    console.log('✅ Created 5 student progress records');

    // ── SCHEDULES (50 events across all students) ──
    const now = Date.now();
    const day = 86400000;
    const scheduleItems = [
        // Teacher-broadcast exams + assignments (for all students)
        { type: 'exam', subject: 'Machine Learning', title: 'Minor 1: ML', datetime: new Date(now + 10 * day), createdBy: 'teacher' },
        { type: 'exam', subject: 'Data Structures & Algorithms', title: 'Minor 1: DSA', datetime: new Date(now + 12 * day), createdBy: 'teacher' },
        { type: 'exam', subject: 'Database Systems', title: 'Minor 1: DBMS', datetime: new Date(now + 14 * day), createdBy: 'teacher' },
        { type: 'assignment', subject: 'Machine Learning', title: 'ML Assignment 2: Neural Networks', datetime: new Date(now + 7 * day), createdBy: 'teacher' },
        { type: 'assignment', subject: 'Data Structures & Algorithms', title: 'DSA Assignment 3: Graph Algorithms', datetime: new Date(now + 8 * day), createdBy: 'teacher' },
        { type: 'assignment', subject: 'Database Systems', title: 'DBMS Assignment 1: SQL Queries', datetime: new Date(now + 9 * day), createdBy: 'teacher' },
        { type: 'project', subject: 'Machine Learning', title: 'ML Final Project Submission', datetime: new Date(now + 28 * day), createdBy: 'teacher' },
        // AI-generated revision sessions
        { type: 'revision', subject: 'Database Systems', title: '🔄 Deep Dive: B+ Trees', datetime: new Date(now + 2 * day), createdBy: 'ai_pathfinder' },
        { type: 'revision', subject: 'Database Systems', title: '🔄 Deep Dive: Indexing', datetime: new Date(now + 3 * day), createdBy: 'ai_pathfinder' },
        { type: 'revision', subject: 'Data Structures & Algorithms', title: '🔄 Deep Dive: Dynamic Programming', datetime: new Date(now + 4 * day), createdBy: 'ai_pathfinder' },
    ];
    for (const student of students) {
        for (const item of scheduleItems) {
            await prisma.schedule.create({
                data: { userId: student.id, type: item.type, subject: item.subject, title: item.title, datetime: item.datetime, createdBy: item.createdBy, priority: item.type === 'exam' ? 2 : item.type === 'assignment' ? 1 : 0 },
            });
        }
    }
    console.log('✅ Created 50 schedule events');

    // ── TO-DO ITEMS (25 items, mix of sources) ──
    const todoTemplates = [
        { desc: 'Review Backpropagation derivation', subject: 'Machine Learning', source: 'manual', priority: 1 },
        { desc: 'Practice 10 MCQs on B+ Trees', subject: 'Database Systems', source: 'ai_pathfinder', priority: 2 },
        { desc: 'Complete SQL Joins worksheet', subject: 'Database Systems', source: 'teacher', priority: 1 },
        { desc: 'Solve 5 DP problems from textbook', subject: 'Data Structures & Algorithms', source: 'ai_pathfinder', priority: 2 },
        { desc: 'Read Chapter 7: Neural Networks', subject: 'Machine Learning', source: 'manual', priority: 0 },
    ];
    for (const student of students) {
        for (const todo of todoTemplates) {
            await prisma.toDoItem.create({
                data: {
                    studentId: student.id,
                    subjectName: todo.subject,
                    description: todo.desc,
                    source: todo.source,
                    priority: todo.priority,
                    status: Math.random() > 0.6 ? 'done' : 'pending',
                    dueDate: new Date(now + Math.floor(Math.random() * 14) * day),
                },
            });
        }
    }
    console.log('✅ Created 25 to-do items');

    console.log('\n🎉 Enriched seed complete!');
    console.log('\n📋 Login Credentials:');
    console.log('─────────────────────');
    console.log('Student: spharaniya18@gmail.com / pass123');
    console.log('Student: aarav.patel@drona.edu / pass123');
    console.log('Student: meera.joshi@drona.edu / pass123');
    console.log('Student: vikram.singh@drona.edu / pass123');
    console.log('Student: ananya.reddy@drona.edu / pass123');
    console.log('Teacher: rajesh.kumar@drona.edu / pass123');
    console.log('Teacher: priya.sharma@drona.edu / pass123');
}

main()
    .catch(e => { console.error('Seed error:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
