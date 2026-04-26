/**
 * 把任意字符串（中文 / 英文 / 数字 / 标点）转换为 url-safe 的 slug。
 * - 保留中文（Galaxy 是中文知识库为主）
 * - 把 CJK 全角标点（如 `，。；：！？（）「」`）也视为分隔符
 * - 把英文转小写
 * - 把空白字符与常见标点替换为 -
 * - 把多个连续 - 折叠为单个
 * - 去除首尾 -
 *
 * @example slugify('前置仓 (Forward Warehouse)') // => '前置仓-forward-warehouse'
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_/\\.,;:!?\(\)\[\]\{\}<>"'`~@#$%^&*+=|\u3000-\u303F\uFF00-\uFFEF]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}
