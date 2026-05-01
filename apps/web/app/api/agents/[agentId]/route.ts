import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

/** 项目根目录（monorepo 中 process.cwd() 指向 apps/web/，需向上两级） */
const PROJECT_ROOT = path.resolve(process.cwd(), '../..');
const AGENTS_DIR = path.resolve(PROJECT_ROOT, 'data/agents');
const BUILT_IN_AGENTS = new Set(['direct', 'thinker', 'partner']);

interface RouteContext {
  params: Promise<{ agentId: string }>;
}

function resolveAgentPath(agentId: string): string {
  return path.join(AGENTS_DIR, `${agentId}.md`);
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { agentId } = await context.params;
    const filePath = resolveAgentPath(agentId);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `Agent "${agentId}" not found.` },
        { status: 404 },
      );
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const titleLine = lines.find((line) => line.startsWith('# '));
    const name = titleLine ? titleLine.replace(/^#\s+/, '').trim() : agentId;

    return NextResponse.json({ data: { id: agentId, name, content } });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to read agent: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { agentId } = await context.params;
    const body = await request.json();
    const { content } = body as { content: string };

    if (typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Content must be a string.' },
        { status: 400 },
      );
    }

    const filePath = resolveAgentPath(agentId);
    fs.writeFileSync(filePath, content, 'utf-8');
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to update agent: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { agentId } = await context.params;

    if (BUILT_IN_AGENTS.has(agentId)) {
      return NextResponse.json(
        { error: `Cannot delete built-in agent "${agentId}".` },
        { status: 400 },
      );
    }

    const filePath = resolveAgentPath(agentId);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `Agent "${agentId}" not found.` },
        { status: 404 },
      );
    }

    fs.unlinkSync(filePath);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to delete agent: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
