import { customAlphabet } from 'nanoid'

/**
 * id 生成器：使用小写字母 + 数字，避免歧义字符（无 0/O/1/l/I）。
 * 长度 12，碰撞概率在百万级数据量下可忽略。
 */
const alphabet = '23456789abcdefghijkmnpqrstuvwxyz'
const nano = customAlphabet(alphabet, 12)

/**
 * 为业务实体生成带前缀的 id。
 *
 * @example generateId('n') // => 'n_a3k9p2mq7r4x'
 * @example generateId('e') // => 'e_xyz...'
 */
export function generateId(prefix: 'n' | 'e' | 'a' | 's' | 'f' | 'r' | 'd' | 'm' | 'l' | 'o' | 'pref'): string {
  return `${prefix}_${nano()}`
}

/** 当前 ISO-8601 UTC 时间字符串（毫秒精度） */
export function nowIso(): string {
  return new Date().toISOString()
}
