import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// GET /api/materials — list materials for a subject
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const subjectId = searchParams.get('subjectId');
        if (!subjectId) return NextResponse.json({ error: 'subjectId required' }, { status: 400 });

        const materials = await prisma.material.findMany({
            where: { subjectId },
            orderBy: { uploadDate: 'desc' },
            include: { uploader: { select: { name: true } } },
        });
        return NextResponse.json({ materials });
    } catch (error) {
        console.error('Materials GET error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

// POST /api/materials — upload file
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const role = (session.user as { id: string; role: string }).role;
        if (role !== 'TEACHER') return NextResponse.json({ error: 'Teachers only' }, { status: 403 });
        const userId = (session.user as { id: string }).id;

        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const subjectId = formData.get('subjectId') as string;
        const docType = (formData.get('docType') as string) || 'lecture_notes';

        if (!file || !subjectId) {
            return NextResponse.json({ error: 'File and subjectId required' }, { status: 400 });
        }

        // Save file to uploads directory
        const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
        await mkdir(uploadsDir, { recursive: true });
        const fileName = `${Date.now()}_${file.name}`;
        const filePath = path.join(uploadsDir, fileName);
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(filePath, buffer);

        // Create material record
        const material = await prisma.material.create({
            data: {
                subjectId,
                uploadedBy: userId,
                fileName: file.name,
                filePath: `/uploads/${fileName}`,
                docType,
                vectorNamespace: 'teacher_materials',
            },
        });

        return NextResponse.json({ material, message: 'Material uploaded successfully' });
    } catch (error) {
        console.error('Materials POST error:', error);
        return NextResponse.json({ error: 'Failed to upload' }, { status: 500 });
    }
}

// DELETE /api/materials — remove material
export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const role = (session.user as { id: string; role: string }).role;
        if (role !== 'TEACHER') return NextResponse.json({ error: 'Teachers only' }, { status: 403 });

        const { id } = await req.json();
        await prisma.material.delete({ where: { id } });
        return NextResponse.json({ message: 'Material removed' });
    } catch (error) {
        console.error('Materials DELETE error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
