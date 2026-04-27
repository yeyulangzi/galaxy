# Galaxy

个人立体知识库。AI 辅助扩展知识边界，人工确认所有入图。

## 当前阶段：M1（骨架可运行）

- Monorepo 工程结构（apps/web + packages/db + packages/shared）
- SQLite 全表 schema 落地（无 AI 调用）
- Next.js 14 主页 + Cytoscape 图谱画布
- 节点 / 边手动 CRUD（新建 / 编辑 / 删除 / 连线 / 搜索）
- 数据持久化到 `~/galaxy/data/galaxy.db`

## 环境要求

- Node.js >= 20.10
- pnpm >= 9
- macOS / Linux（Windows 未验证）

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 生成数据库迁移（首次或 schema 变更后）
pnpm db:generate

# 3. 启动开发服务器（自动初始化 DB + 启动 Next.js）
pnpm dev
```

打开 http://localhost:3000 。

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动开发模式（initDb + next dev） |
| `pnpm build` | 构建 Web 应用 |
| `pnpm test` | 运行所有 Vitest 测试 |
| `pnpm typecheck` | 全包 TypeScript 类型检查 |
| `pnpm db:generate` | 由 schema 生成 SQL 迁移文件 |
| `pnpm db:studio` | 打开 Drizzle Studio 浏览数据 |

## 数据位置

- 数据库：`~/galaxy/data/galaxy.db`（可通过环境变量 `GALAXY_DB_PATH` 覆盖）
- 桥接目录（M3+ 才会用到）：`~/galaxy/bridge/`

## 操作指南（M1）

- **新建节点**：右上角「新建节点」按钮
- **编辑节点**：点击图谱中的节点，右侧滑出详情面板
- **删除节点**：在详情面板点击「删除」（同时删除相关边）
- **连线**：在源节点上**右键** → 再点击目标节点
- **搜索**：⌘K（macOS）/ Ctrl+K（其他）打开命令面板

## 路线图

- M1（当前）：骨架可运行
- M2：被动投喂 + AI 抽取候选 + 待审 Inbox
- M3：节点深度对话（Deep Dive）+ 文件桥接 Qoder
- M4：AI 主动扫描（每周巡检）+ 反馈循环
- M5：节点纵深视角（多面切片）+ 演化历史

## 许可

私有项目，未公开发布。
