# Galaxy — 核心产品能力清单

> **最后更新**：2026-05-01  
> 功能变更时请同步更新本文件和 [`HANDOVER.md`](HANDOVER.md)、[`../README.md`](../README.md)

---

## 能力总览

| # | 能力模块 | 里程碑 | 状态 | 核心文件 |
|---|---------|--------|------|---------|
| 1 | [知识图谱可视化](#1-知识图谱可视化) | M1 | ✅ 完成 | `graph-canvas-v2.tsx`, `renderer.ts`, `physics.ts` |
| 2 | [节点/边 CRUD](#2-节点边-crud) | M1 | ✅ 完成 | `api/nodes/`, `api/edges/`, `node-detail-panel.tsx` |
| 3 | [内容投喂 → AI 抽取](#3-内容投喂--ai-抽取) | M2 | ✅ 完成 | `api/feed/`, `feed-fab.tsx` |
| 4 | [待审队列 (Inbox)](#4-待审队列-inbox) | M2 | ✅ 完成 | `api/inbox/`, `inbox/page.tsx`, `inbox-card.tsx` |
| 5 | [Deep Dive 深度对话](#5-deep-dive-深度对话) | M3 | ✅ 完成 | `api/deepdive/`, `deep-dive-dialog.tsx` |
| 6 | [Bridge 文件协议](#6-bridge-文件协议) | M3 | ✅ 完成 | `packages/ai/src/bridge/`, `api/bridge/` |
| 7 | [全局聊天](#7-全局聊天) | M3 | ✅ 完成 | `global-chat-dialog.tsx`, `chat/` |
| 8 | [主动扫描](#8-主动扫描) | M4 | ✅ 完成 | `api/scan/`, `packages/ai/src/tasks/` |
| 9 | [反馈循环与自进化](#9-反馈循环与自进化) | M5 | ✅ 完成 | `packages/ai/src/feedback/` |
| 10 | [多维切面 (Aspects)](#10-多维切面-aspects) | M5 | ✅ 完成 | `api/nodes/[id]/aspects/`, `api/nodes/[id]/extract-aspects/` |
| 11 | [思考版本 & 附件](#11-思考版本--附件) | M5 | ✅ 完成 | `api/nodes/[id]/thoughts/`, `api/nodes/[id]/attachments/` |
| 12 | [操作日志 & 撤销](#12-操作日志--撤销) | — | ✅ 完成 | `api/data/undo/`, `operation-log-viewer.tsx` |
| 13 | [安全模式 & 风控](#13-安全模式--风控) | M4 | ✅ 完成 | `settings/page.tsx`, `safety-panel.tsx` |
| 14 | [数据导入导出](#14-数据导入导出) | — | ✅ 完成 | `api/data/import/`, `api/data/export/` |

---

## 1. 知识图谱可视化

**里程碑**：M1（初版 Cytoscape）→ M2a（迁移至 D3-force + Canvas 2D）

| 子能力 | 说明 | 状态 |
|--------|------|------|
| D3-force 物理引擎 | 力导向布局，支持斥力/边距/衰减等参数实时调节 | ✅ |
| Canvas 2D 自绘渲染 | 节点形状差异化（⬤ concept / ◆ claim / ▢ case / ⬡ resource） | ✅ |
| 节点视觉编码 | channel 实线/虚线描边，internalization_status 描边色映射 | ✅ |
| 边视觉编码 | origin=ai_suggested 虚线，weight 映射线宽（保底 0.5px），箭头方向 | ✅ |
| 社区着色 | 按二级领域分组着色（固定颜色映射） | ✅ |
| Hover 浮动卡片 | 节点 hover 时显示领域标签 + 标题 + 摘要 | ✅ |
| 小地图 | 缩略全图 + 视口矩形 | ✅ |
| 过滤面板 | 按领域/来源/节点类型/通道/内化状态/连线强度过滤 | ✅ |
| 物理调参面板 | 斥力/边距/衰减等参数实时滑块调节 | ✅ |

**关键文件**：`lib/graph/renderer.ts`、`lib/graph/physics.ts`、`lib/graph/filter.ts`、`_components/graph-canvas-v2.tsx`

---

## 2. 节点/边 CRUD

**里程碑**：M1

| 子能力 | 说明 | 状态 |
|--------|------|------|
| 创建节点 | 支持标题/摘要/领域/种子标记，领域字段可搜索已有领域或新建 | ✅ |
| 编辑节点 | 右侧滑出详情面板，字段即时保存 | ✅ |
| 删除节点 | 级联删除关联边 + 快照撤销 | ✅ |
| slug 冲突处理 | 自动追加 ID 后缀避免 UNIQUE 冲突 | ✅ |
| 创建边 | 右键源节点 → 点击目标节点 | ✅ |
| 删除边 | 详情面板联结列表操作 | ✅ |
| 边重建 | `/api/edges/rebuild` 全量 AI 重新生成边 | ✅ |
| ⌘K 搜索 | 命令面板全局搜索节点 | ✅ |

**关键文件**：`api/nodes/route.ts`、`api/nodes/[id]/route.ts`、`api/edges/route.ts`、`new-node-dialog.tsx`、`node-detail-panel.tsx`

---

## 3. 内容投喂 → AI 抽取

**里程碑**：M2

| 子能力 | 说明 | 状态 |
|--------|------|------|
| 文本投喂 | 粘贴文章/笔记，AI 自动抽取知识节点与关联 | ✅ |
| URL 投喂 | 粘贴 URL，自动抓取内容后抽取 | ✅ |
| 投喂记录 | feed_items 表记录原始内容和解析结果 | ✅ |

**关键文件**：`api/feed/route.ts`、`_components/feed-fab.tsx`

---

## 4. 待审队列 (Inbox)

**里程碑**：M2

| 子能力 | 说明 | 状态 |
|--------|------|------|
| 建议列表 | 分页展示 AI 生成的 new_node / new_edge / fill_aspect 等建议 | ✅ |
| 单条审核 | 接受/拒绝/编辑后确认 | ✅ |
| 批量操作 | 每批 50 条并行确认 | ✅ |
| 快捷键 | A (接受) / R (拒绝) / E (编辑) | ✅ |
| 未审数 badge | 导航栏实时显示未审建议数 | ✅ |

**关键文件**：`api/inbox/`、`inbox/page.tsx`、`_components/inbox-card.tsx`、`_components/inbox-confirm-dialog.tsx`

---

## 5. Deep Dive 深度对话

**里程碑**：M3

| 子能力 | 说明 | 状态 |
|--------|------|------|
| SSE 流式回复 | 实时逐 token 返回 AI 回复 | ✅ |
| 多 Agent 人格 | 支持多种自定义 Agent 人格切换 | ✅ |
| 对话历史管理 | 按 session 存储，支持列表浏览 | ✅ |
| 对话总结 | 对话结束时 AI 生成总结 | ✅ |
| 知识反哺 | 对话产出自动写回节点切面 | ✅ |

**关键文件**：`api/deepdive/`、`_components/deep-dive-dialog.tsx`

---

## 6. Bridge 文件协议

**里程碑**：M3

| 子能力 | 说明 | 状态 |
|--------|------|------|
| 跨进程通信 | 通过 `~/galaxy/bridge/` 目录文件协议与 Qoder 联动 | ✅ |
| 任务创建/轮询/取消 | 完整任务生命周期管理 | ✅ |
| Bridge 监控 | 前端 `bridge-monitor.tsx` 实时查看任务状态 | ✅ |

**关键文件**：`packages/ai/src/bridge/`、`api/bridge/status/route.ts`、`_components/bridge-monitor.tsx`

---

## 7. 全局聊天

**里程碑**：M3

| 子能力 | 说明 | 状态 |
|--------|------|------|
| 跨节点对话 | 不绑定特定节点的全局 AI 对话 | ✅ |
| 自定义 Agent | 支持选择不同 Agent 人格 | ✅ |
| 工具调用 | AI 可调用注册工具，前端展示调用结果 | ✅ |
| 对话历史 | 多 session 管理，侧边栏浏览 | ✅ |

**关键文件**：`_components/global-chat-dialog.tsx`、`_components/chat/`

---

## 8. 主动扫描

**里程碑**：M4

| 子能力 | 说明 | 状态 |
|--------|------|------|
| Islands 策略 | 检测孤岛节点，建议连接 | ✅ |
| Gaps 策略 | 检测知识缺口，建议补充 | ✅ |
| Aging 策略 | 检测长期未访问节点，建议复习 | ✅ |
| Cron 调度 | 定时自动执行扫描任务 | ✅ |
| 扫描记录 | scan_runs 表记录每次运行结果 | ✅ |

**关键文件**：`api/scan/`、`packages/ai/src/tasks/`

---

## 9. 反馈循环与自进化

**里程碑**：M5

| 子能力 | 说明 | 状态 |
|--------|------|------|
| FeedbackCollector | 收集用户对 AI 建议的接受/拒绝反馈 | ✅ |
| ConfidenceCalibrator | 校准 AI 置信度（calibrated_confidence） | ✅ |
| StrategyAdjuster | 根据反馈调整扫描/抽取策略 | ✅ |
| PersonalizationEngine | 学习用户偏好（领域/关系类型/长度偏好） | ✅ |
| FeedbackPromptInjector | 将反馈数据注入 AI Prompt | ✅ |

**关键文件**：`packages/ai/src/feedback/`、`feedback_stats` 表、`user_preferences` 表

---

## 10. 多维切面 (Aspects)

**里程碑**：M5

| 子能力 | 说明 | 状态 |
|--------|------|------|
| 手动创建/编辑/删除 | 节点详情面板内切面标签页 | ✅ |
| AI 自动提取 | 从节点内容和关联自动抽取切面 | ✅ |
| 来源追溯 | source_type 标记来源（dialogue / attachment / manual） | ✅ |
| 排序 | 支持手动排序（order 字段） | ✅ |

**关键文件**：`api/nodes/[id]/aspects/route.ts`、`api/nodes/[id]/extract-aspects/route.ts`

---

## 11. 思考版本 & 附件

**里程碑**：M5

| 子能力 | 说明 | 状态 |
|--------|------|------|
| 思考版本快照 | 保存节点 my_thoughts 的历史版本 | ✅ |
| 版本标签 | 可选的 version_label 标记 | ✅ |
| 版本差异查看 | thought-diff-viewer 组件 | ✅ |
| 附件管理 | 支持 note / link / file 三种类型 | ✅ |

**关键文件**：`api/nodes/[id]/thoughts/route.ts`、`api/nodes/[id]/attachments/route.ts`、`thought-diff-viewer.tsx`

---

## 12. 操作日志 & 撤销

| 子能力 | 说明 | 状态 |
|--------|------|------|
| 全操作记录 | 17 种操作类型（create_node / delete_node / confirm_suggestion 等） | ✅ |
| 快照撤销 | 有 snapshot 的操作支持一键撤销恢复 | ✅ |
| 实时查看 | 操作日志弹窗，每 5 秒轮询刷新 | ✅ |
| 相对时间 | 显示"刚刚"、"5 分钟前"等友好时间 | ✅ |

**关键文件**：`api/data/undo/route.ts`、`_components/operation-log-viewer.tsx`

---

## 13. 安全模式 & 风控

**里程碑**：M4

| 子能力 | 说明 | 状态 |
|--------|------|------|
| AI 紧急停止 | 一键关闭所有 AI 能力 | ✅ |
| 预算控制 | 月度 AI 调用预算设置与监控 | ✅ |
| 成本统计 | 按 Provider/Model 维度统计 token 消耗和费用 | ✅ |
| 风控面板 | 校准曲线、偏好分析、类型趋势 | ✅ |

**关键文件**：`settings/page.tsx`、`_components/safety-panel.tsx`

---

## 14. 数据导入导出

| 子能力 | 说明 | 状态 |
|--------|------|------|
| 数据导出 | 导出完整图谱数据（JSON 格式） | ✅ |
| 数据导入 | 导入外部数据合并到图谱 | ✅ |
| 数据库备份 | 备份到 `~/galaxy/data/backups/` | ✅ |

**关键文件**：`api/data/import/route.ts`、`api/data/export/route.ts`

---

## 变更日志

| 日期 | 变更内容 |
|------|---------|
| 2026-05-01 | 修复 slug 冲突、DELETE 节点字段名错误、ai_suggested 边不可见；新增操作日志弹窗；领域字段改为可搜索下拉；创建本文件 |
