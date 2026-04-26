import { describe, expect, it } from 'vitest'
import { generateId, nowIso } from '../utils/id.js'
import { slugify } from '../utils/slug.js'

describe('generateId', () => {
  it('产生带前缀的 id，长度 14（前缀 + _ + 12）', () => {
    const id = generateId('n')
    expect(id).toMatch(/^n_[a-z2-9]{12}$/)
  })

  it('两次生成不同 id（碰撞概率忽略不计）', () => {
    expect(generateId('e')).not.toBe(generateId('e'))
  })
})

describe('nowIso', () => {
  it('返回标准 ISO-8601 UTC 字符串', () => {
    const s = nowIso()
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

describe('slugify', () => {
  it('保留中文、转小写英文、折叠分隔符', () => {
    expect(slugify('前置仓 (Forward Warehouse)')).toBe('前置仓-forward-warehouse')
  })

  it('去除首尾分隔符', () => {
    expect(slugify('  --hello world--  ')).toBe('hello-world')
  })

  it('空白与多种标点都折叠为单 -', () => {
    expect(slugify('a / b , c . d')).toBe('a-b-c-d')
  })

  it('识别中文全角标点为分隔符', () => {
    expect(slugify('前置仓，外卖履约（v2）')).toBe('前置仓-外卖履约-v2')
  })

  it('空字符串返回空字符串', () => {
    expect(slugify('')).toBe('')
  })

  it('纯分隔符（空白 + 标点）返回空字符串', () => {
    expect(slugify('   ---,,,。。。   ')).toBe('')
  })
})
