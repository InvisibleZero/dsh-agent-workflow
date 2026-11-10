import { WorkflowSnapshot as WorkflowSnapshotSchema } from './workflow';
/** 当前快照版本。v2 去掉了「未开始」状态。 */
export const CURRENT_SNAPSHOT_VERSION = 2;
/**
 * v1 → v2：删掉「未开始」状态。
 * 旧快照里 current_state 为 not_started 的节点统一迁到 discussing（时间线原样保留，那是历史事实）。
 */
const migrateV1ToV2 = (snapshot) => {
    const rawNodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
    const nodes = rawNodes.map((node) => {
        if (typeof node !== 'object' || node === null)
            return node;
        const record = node;
        return record.current_state === 'not_started' ? { ...record, current_state: 'discussing' } : record;
    });
    return { ...snapshot, version: 2, nodes };
};
/** 版本迁移表：key = 源版本，value = 迁到下一版的函数。 */
export const SNAPSHOT_MIGRATIONS = {
    1: migrateV1ToV2,
};
/** 读取原始快照的版本号（未强校验，用于决定走哪条迁移链）。 */
export function readSnapshotVersion(raw) {
    if (typeof raw === 'object' && raw !== null && 'version' in raw) {
        const version = raw.version;
        if (typeof version === 'number' && Number.isInteger(version))
            return version;
    }
    throw new Error('快照缺少合法的 version 字段');
}
/**
 * 把原始快照迁到当前版本，再强校验。
 * migrations 可注入以便测试；默认用 SNAPSHOT_MIGRATIONS。
 */
export function migrateSnapshot(raw, migrations = SNAPSHOT_MIGRATIONS) {
    let snapshot = raw;
    let version = readSnapshotVersion(snapshot);
    let guard = 0;
    while (version < CURRENT_SNAPSHOT_VERSION) {
        const step = migrations[version];
        if (!step)
            throw new Error(`缺少从 v${version} 到 v${version + 1} 的迁移`);
        snapshot = step(snapshot);
        version = readSnapshotVersion(snapshot);
        if (++guard > 100)
            throw new Error('迁移链疑似死循环');
    }
    if (version > CURRENT_SNAPSHOT_VERSION) {
        throw new Error(`快照版本 v${version} 高于当前支持的 v${CURRENT_SNAPSHOT_VERSION}`);
    }
    return WorkflowSnapshotSchema.parse(snapshot);
}
//# sourceMappingURL=migration.js.map