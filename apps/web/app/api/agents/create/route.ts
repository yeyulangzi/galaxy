import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

/** 项目根目录（monorepo 中 process.cwd() 指向 apps/web/，需向上两级） */
const PROJECT_ROOT = path.resolve(process.cwd(), '../..');
const AGENTS_DIR = path.resolve(PROJECT_ROOT, 'data/agents');
const VALID_ID_PATTERN = /^[a-z0-9-]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, content } = body as { id: string; content: string };

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Agent id is required.' },
        { status: 400 },
      );
    }

    if (!VALID_ID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: 'Agent id must only contain lowercase letters, digits, and hyphens.' },
        { status: 400 },
      );
    }

    if (typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Content must be a string.' },
        { status: 400 },
      );
    }

    const filePath = path.join(AGENTS_DIR, `${id}.md`);

    if (fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `Agent "${id}" already exists.` },
        { status: 409 },
      );
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    return NextResponse.json({ data: { ok: true, id } });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to create agent: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
