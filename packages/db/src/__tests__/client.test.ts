import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { closeDb, initDb, getDb, resolveDbPath } from '../client'
import { nodes } from '../schema/nodes'
import { settings } from '../schema/settings'
import { eq } from 'drizzle-orm'

const TMP_DB = path.join(os.tmpdir(), `galaxy-test-${Date.now()}.db`)

beforeEach(() => {
  process.env.GALAXY_DB_PATH = TMP_DB
})

afterEach(() => {
  closeDb()
  if (fs.existsSync(TMP_DB)) fs.rmSync(TMP_DB)
  delete process.env.GALAXY_DB_PATH
})

describe('db client', () => {
  it('resolveDbPath honors env override', () => {
    expect(resolveDbPath()).toBe(TMP_DB)
  })

  it('initDb creates tables and seeds settings row', () => {
    initDb()
    const db = getDb()
    const rows = db.select().from(settings).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(1)
  })

  it('can insert and read a node', () => {
    initDb()
    const db = getDb()
    db.insert(nodes)
      .values({ id: 'n_test1', title: '前置仓', slug: 'qian-zhi-cang' })
      .run()
    const row = db.select().from(nodes).where(eq(nodes.id, 'n_test1')).get()
    expect(row?.title).toBe('前置仓')
    expect(row?.status).toBe('active')
    expect(row?.is_seed).toBe(false)
  })
})
