import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { closeDb } from '@galaxy/db'

function freshDbPath() {
  return path.join(os.tmpdir(), `galaxy-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`)
}

let TMP_DB = ''

beforeEach(() => {
  TMP_DB = freshDbPath()
  process.env.GALAXY_DB_PATH = TMP_DB
})

afterEach(() => {
  closeDb()
  vi.resetModules()
  if (fs.existsSync(TMP_DB)) fs.rmSync(TMP_DB)
  if (fs.existsSync(TMP_DB + '-wal')) fs.rmSync(TMP_DB + '-wal')
  if (fs.existsSync(TMP_DB + '-shm')) fs.rmSync(TMP_DB + '-shm')
  delete process.env.GALAXY_DB_PATH
})

describe('nodes API route handlers', () => {
  it('POST then GET returns the created node', async () => {
    const { POST, GET } = await import('../app/api/nodes/route')
    const req = new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: '前置仓', summary: '即时配送基础设施' }),
    })
    const created = await POST(req as any)
    expect(created.status).toBe(201)
    const createdJson = await created.json()
    expect(createdJson.data.title).toBe('前置仓')

    const list = await GET()
    const listJson = await list.json()
    expect(listJson.data).toHaveLength(1)
    expect(listJson.data[0].id).toBe(createdJson.data.id)
  })

  it('POST with empty title returns 400', async () => {
    const { POST } = await import('../app/api/nodes/route')
    const req = new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: '' }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })

  it('PATCH updates title and slug', async () => {
    const { POST } = await import('../app/api/nodes/route')
    const { PATCH } = await import('../app/api/nodes/[id]/route')

    const createReq = new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: 'old' }),
    })
    const created = await POST(createReq as any)
    const { data } = await created.json()

    const patchReq = new Request('http://localhost/api/nodes/' + data.id, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'new title' }),
    })
    const patched = await PATCH(patchReq as any, { params: { id: data.id } })
    const patchedJson = await patched.json()
    expect(patchedJson.data.title).toBe('new title')
    expect(patchedJson.data.slug).toBe('new-title')
  })
})

describe('edges API route handlers', () => {
  it('POST creates an edge between two existing nodes', async () => {
    const { POST: postNode } = await import('../app/api/nodes/route')
    const { POST: postEdge, GET: listEdges } = await import('../app/api/edges/route')

    const a = await (await postNode(new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: '前置仓' }),
    }) as any)).json()
    const b = await (await postNode(new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: '冷链' }),
    }) as any)).json()

    const created = await postEdge(new Request('http://localhost/api/edges', {
      method: 'POST',
      body: JSON.stringify({
        source_node_id: a.data.id,
        target_node_id: b.data.id,
        relation_type: 'contains',
        weight: 0.8,
        description: '前置仓含冷链能力',
      }),
    }) as any)
    expect(created.status).toBe(201)
    const createdJson = await created.json()
    expect(createdJson.data.relation_type).toBe('contains')
    expect(createdJson.data.source_node_id).toBe(a.data.id)

    const list = await listEdges()
    const listJson = await list.json()
    expect(listJson.data).toHaveLength(1)
  })

  it('POST with duplicate triple returns 409', async () => {
    const { POST: postNode } = await import('../app/api/nodes/route')
    const { POST: postEdge } = await import('../app/api/edges/route')

    const a = await (await postNode(new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: 'A' }),
    }) as any)).json()
    const b = await (await postNode(new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: 'B' }),
    }) as any)).json()

    const payload = JSON.stringify({
      source_node_id: a.data.id,
      target_node_id: b.data.id,
      relation_type: 'related',
    })

    const first = await postEdge(new Request('http://localhost/api/edges', {
      method: 'POST',
      body: payload,
    }) as any)
    expect(first.status).toBe(201)

    const second = await postEdge(new Request('http://localhost/api/edges', {
      method: 'POST',
      body: payload,
    }) as any)
    expect(second.status).toBe(409)
  })
})
