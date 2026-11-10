import type { WorkflowSnapshot } from './workflow';
/** 当前快照版本。v2 去掉了「未开始」状态。 */
export declare const CURRENT_SNAPSHOT_VERSION = 2;
/** 单步迁移：把快照从 version N 迁到 N+1（输入输出都是宽松对象，不强校验）。 */
export type SnapshotMigration = (snapshot: Record<string, unknown>) => Record<string, unknown>;
/** 版本迁移表：key = 源版本，value = 迁到下一版的函数。 */
export declare const SNAPSHOT_MIGRATIONS: Readonly<Record<number, SnapshotMigration>>;
/** 读取原始快照的版本号（未强校验，用于决定走哪条迁移链）。 */
export declare function readSnapshotVersion(raw: unknown): number;
/**
 * 把原始快照迁到当前版本，再强校验。
 * migrations 可注入以便测试；默认用 SNAPSHOT_MIGRATIONS。
 */
export declare function migrateSnapshot(raw: unknown, migrations?: Readonly<Record<number, SnapshotMigration>>): WorkflowSnapshot;
//# sourceMappingURL=migration.d.ts.map