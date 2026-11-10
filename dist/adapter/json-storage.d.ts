import type { WorkflowSnapshot } from '../schema/workflow';
import type { WorkflowStoragePort } from './port';
/** 基于 JSON 文件的存储实现：原子写（随机临时文件 + rename）。 */
export declare class JsonStorageAdapter implements WorkflowStoragePort {
    private readonly baseDir;
    constructor(baseDir: string);
    private snapshotPath;
    load(workspaceId: string): Promise<WorkflowSnapshot | null>;
    save(snapshot: WorkflowSnapshot): Promise<void>;
}
//# sourceMappingURL=json-storage.d.ts.map