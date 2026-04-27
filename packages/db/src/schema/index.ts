/**
 * Drizzle schema 总入口（占位）。
 *
 * 实际业务表（nodes / edges / aspects / suggestions / feed_items / scan_runs /
 * deep_dive / ai_call_logs / operation_logs / settings）会在 Task 4-9 中
 * 增量 re-export 进来，drizzle-kit 据此生成迁移。
 *
 * 当前文件保留为空 namespace，目的是让 `@galaxy/db` 包在 schema 表落地之前
 * 也能完成 typecheck 与基础冒烟测试。
 */
export {}
