import { promises as fs } from 'node:fs';
import path from 'node:path';
import { migrateSnapshot } from '../schema/migration';
/** 基于 JSON 文件的存储实现：原子写 + 追加式 trace + 每节点快照。 */
export class JsonStorageAdapter {
    baseDir;
    constructor(baseDir) {
        this.baseDir = baseDir;
    }
    snapshotPath(workspaceId) {
        return path.join(this.baseDir, 'workflows', `${workspaceId}.json`);
    }
    tracePath(traceId) {
        return path.join(this.baseDir, 'traces', `${traceId}.jsonl`);
    }
    checkpointPath(nodeId) {
        return path.join(this.baseDir, 'checkpoints', `${nodeId}.json`);
    }
    async load(workspaceId) {
        try {
            const raw = await fs.readFile(this.snapshotPath(workspaceId), 'utf8');
            return migrateSnapshot(JSON.parse(raw));
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return null;
            throw e;
        }
    }
    async save(snapshot) {
        const p = this.snapshotPath(snapshot.workspace_id);
        await fs.mkdir(path.dirname(p), { recursive: true });
        const tmp = `${p}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
        await fs.rename(tmp, p); // 原子替换，避免写一半
    }
    async appendTrace(log) {
        const p = this.tracePath(log.trace_id);
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.appendFile(p, `${JSON.stringify(log)}\n`, 'utf8');
    }
    async saveCheckpoint(nodeId, snapshot) {
        const p = this.checkpointPath(nodeId);
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, JSON.stringify(snapshot), 'utf8');
    }
    async loadCheckpoint(nodeId) {
        try {
            return JSON.parse(await fs.readFile(this.checkpointPath(nodeId), 'utf8'));
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return null;
            throw e;
        }
    }
}
//# sourceMappingURL=json-storage.js.map