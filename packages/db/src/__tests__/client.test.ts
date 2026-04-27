import { afterEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { resolveDbPath } from '../client.js'

const ORIGINAL_ENV = process.env.GALAXY_DB_PATH

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.GALAXY_DB_PATH
  } else {
    process.env.GALAXY_DB_PATH = ORIGINAL_ENV
  }
})

describe('resolveDbPath', () => {
  it('未设置 GALAXY_DB_PATH 时回落到 ~/galaxy/data/galaxy.db', () => {
    delete process.env.GALAXY_DB_PATH
    expect(resolveDbPath()).toBe(path.join(os.homedir(), 'galaxy', 'data', 'galaxy.db'))
  })

  it('设置了 GALAXY_DB_PATH 时优先使用环境变量', () => {
    process.env.GALAXY_DB_PATH = '/tmp/galaxy-test/foo.db'
    expect(resolveDbPath()).toBe('/tmp/galaxy-test/foo.db')
  })

  it('GALAXY_DB_PATH 为空字符串时也回落到默认路径', () => {
    process.env.GALAXY_DB_PATH = ''
    expect(resolveDbPath()).toBe(path.join(os.homedir(), 'galaxy', 'data', 'galaxy.db'))
  })
})
