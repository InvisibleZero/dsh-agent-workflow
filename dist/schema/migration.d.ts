import type { WorkflowSnapshot } from './workflow';
/** 当前快照版本。 */
export declare const CURRENT_SNAPSHOT_VERSION = 1;
/** 单步迁移：把快照从 version N 迁到 N+1（输入输出都是宽松对象，不强校验）。 */
export type SnapshotMigration = (snapshot: Record<string, unknown>) => Record<string, unknown>;
/**
 * 版本迁移表：key = 源版本，value = 迁到下一版的函数。
 * 目前 v1 即当前版，无需迁移；未来加字段时在此补 v1 → v2 的迁移。
 */
export declare const SNAPSHOT_MIGRATIONS: Readonly<Record<number, SnapshotMigration>>;
/** 读取原始快照的版本号（未强校验，用于决定走哪条迁移链）。 */
export declare function readSnapshotVersion(raw: unknown): number;
/**
 * 把原始快照迁到当前版本，再强校验。
 * migrations 可注入以便测试；默认用 SNAPSHOT_MIGRATIONS。
 */
export declare function migrateSnapshot(raw: unknown, migrations?: Readonly<Record<number, SnapshotMigration>>): WorkflowSnapshot;
//# sourceMappingURL=migration.d.ts.map