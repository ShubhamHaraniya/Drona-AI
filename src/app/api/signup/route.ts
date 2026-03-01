import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
    try {
        const { name, email, password, role: requestedRole } = await req.json();

        if (!name || !email || !password) {
            return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
        }

        if (password.length < 6) {
            return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
        }

        const role = requestedRole === 'TEACHER' ? 'TEACHER' : 'STUDENT';

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: { name, email, password: hashedPassword, role },
        });

        // Create initial progress record
        await prisma.studentProgress.create({
            data: {
                userId: user.id,
                subjectStats: '{}',
                topicMastery: '{}',
                streak: 0,
                confidencePatterns: '[]',
                adaptiveDifficulty: '{"Machine Learning":"Medium","Data Structures & Algorithms":"Medium","Database Systems":"Medium"}',
            },
        });

        return NextResponse.json({ message: 'Account created successfully', userId: user.id }, { status: 201 });
    } catch (error) {
        console.error('Signup error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
