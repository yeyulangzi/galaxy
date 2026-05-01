import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

const MEMORY_FILES: Record<string, string> = {
  profile: 'user_profile.md',
  global: 'global_memory.md',
};

/** 项目根目录（monorepo 中 process.cwd() 指向 apps/web/，需向上两级） */
const PROJECT_ROOT = path.resolve(process.cwd(), '../..');

function resolveMemoryPath(type: string): string | null {
  const fileName = MEMORY_FILES[type];
  if (!fileName) return null;
  return path.resolve(PROJECT_ROOT, 'data/memory', fileName);
}

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type');
    if (!type || !MEMORY_FILES[type]) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "profile" or "global".' },
        { status: 400 },
      );
    }

    const filePath = resolveMemoryPath(type)!;
    const content = fs.readFileSync(filePath, 'utf-8');
    return NextResponse.json({ data: { content } });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to read memory file: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, content } = body as { type: string; content: string };

    if (!type || !MEMORY_FILES[type]) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "profile" or "global".' },
        { status: 400 },
      );
    }

    if (typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Content must be a string.' },
        { status: 400 },
      );
    }

    const filePath = resolveMemoryPath(type)!;
    fs.writeFileSync(filePath, content, 'utf-8');
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to update memory file: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
