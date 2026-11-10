import type { WorkflowSnapshot } from '../schema/workflow';
/** 存储端口：引擎只依赖它，不关心底层是文件 / DB / dsh 存储。 */
export interface WorkflowStoragePort {
    load(workspaceId: string): Promise<WorkflowSnapshot | null>;
    save(snapshot: WorkflowSnapshot): Promise<void>;
}
//# sourceMappingURL=port.d.ts.map