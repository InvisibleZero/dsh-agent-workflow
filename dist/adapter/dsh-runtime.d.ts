import type { WorkflowRuntimePort, WorkflowEvent } from './port';
/** dsh 侧需提供给适配器的能力（spike 时用真实 dsh API 实现）。 */
export interface DshRuntimeCapabilities {
    /** 打断正在执行的任务。 */
    cancelTask(taskId: string): Promise<void>;
    /** 从快照恢复任务（断点续传）。 */
    resumeTask(taskId: string, snapshot: unknown): Promise<void>;
    /** 向 agent 注入一条输入。 */
    sendInput(text: string): Promise<void>;
    /** 发布事件到前端 / 总线。 */
    publishEvent(event: WorkflowEvent): void;
}
/**
 * dsh 运行时适配器：薄薄一层，把 WorkflowRuntimePort 映射到 DshRuntimeCapabilities。
 * workflow 的 node_id 即 dsh 侧的 task_id。
 */
export declare class DshRuntimeAdapter implements WorkflowRuntimePort {
    private readonly dsh;
    constructor(dsh: DshRuntimeCapabilities);
    resume(nodeId: string, checkpoint: unknown): Promise<void>;
    stop(nodeId: string): Promise<void>;
    injectInput(text: string): Promise<void>;
    emit(event: WorkflowEvent): void;
}
//# sourceMappingURL=dsh-runtime.d.ts.map