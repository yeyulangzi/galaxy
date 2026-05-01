import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

/** 项目根目录（monorepo 中 process.cwd() 指向 apps/web/，需向上两级） */
const PROJECT_ROOT = path.resolve(process.cwd(), '../..');
const AGENTS_DIR = path.resolve(PROJECT_ROOT, 'data/agents');

export async function GET() {
  try {
    const files = fs.readdirSync(AGENTS_DIR).filter((file) => file.endsWith('.md'));

    const agents = files.map((file) => {
      const filePath = path.join(AGENTS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      const titleLine = lines.find((line) => line.startsWith('# '));
      const name = titleLine ? titleLine.replace(/^#\s+/, '').trim() : file.replace('.md', '');

      const descriptionLines = lines.slice(0, 3).join(' ').trim();

      return {
        id: file.replace('.md', ''),
        name,
        description: descriptionLines,
        filePath: `data/agents/${file}`,
      };
    });

    return NextResponse.json({ data: { agents } });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to list agents: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
