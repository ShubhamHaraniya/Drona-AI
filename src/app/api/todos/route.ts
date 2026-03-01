import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET /api/todos — student's to-do list
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = (session.user as { id: string }).id;

        const todos = await prisma.toDoItem.findMany({
            where: { studentId: userId },
            orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
        });
        return NextResponse.json({ todos });
    } catch (error) {
        console.error('Todos GET error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

// POST /api/todos — create to-do item
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = (session.user as { id: string }).id;
        const { subjectName, description, source, priority, dueDate } = await req.json();

        const todo = await prisma.toDoItem.create({
            data: {
                studentId: userId,
                subjectName: subjectName || 'General',
                description: description || '',
                source: source || 'manual',
                priority: priority || 0,
                dueDate: dueDate ? new Date(dueDate) : null,
            },
        });
        return NextResponse.json({ todo, message: 'Task added' });
    } catch (error) {
        console.error('Todos POST error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

// PATCH /api/todos — update status
export async function PATCH(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = (session.user as { id: string }).id;
        const { id, status } = await req.json();

        const item = await prisma.toDoItem.findFirst({ where: { id, studentId: userId } });
        if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        const updated = await prisma.toDoItem.update({
            where: { id },
            data: { status: status || 'done' },
        });
        return NextResponse.json({ todo: updated });
    } catch (error) {
        console.error('Todos PATCH error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

// DELETE /api/todos — remove item
export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = (session.user as { id: string }).id;
        const { id } = await req.json();

        const item = await prisma.toDoItem.findFirst({ where: { id, studentId: userId } });
        if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        await prisma.toDoItem.delete({ where: { id } });
        return NextResponse.json({ message: 'Removed' });
    } catch (error) {
        console.error('Todos DELETE error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
