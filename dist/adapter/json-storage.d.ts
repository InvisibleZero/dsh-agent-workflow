import type { WorkflowSnapshot } from '../schema/workflow';
import type { TraceLog } from '../schema/trace';
import type { WorkflowStoragePort } from './port';
/** 基于 JSON 文件的存储实现：原子写 + 追加式 trace + 每节点快照。 */
export declare class JsonStorageAdapter implements WorkflowStoragePort {
    private readonly baseDir;
    constructor(baseDir: string);
    private snapshotPath;
    private tracePath;
    private checkpointPath;
    load(workspaceId: string): Promise<WorkflowSnapshot | null>;
    save(snapshot: WorkflowSnapshot): Promise<void>;
    appendTrace(log: TraceLog): Promise<void>;
    saveCheckpoint(nodeId: string, snapshot: unknown): Promise<void>;
    loadCheckpoint(nodeId: string): Promise<unknown | null>;
}
//# sourceMappingURL=json-storage.d.ts.map