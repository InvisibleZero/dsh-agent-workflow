/**
 * dsh 运行时适配器：薄薄一层，把 WorkflowRuntimePort 映射到 DshRuntimeCapabilities。
 * workflow 的 node_id 即 dsh 侧的 task_id。
 */
export class DshRuntimeAdapter {
    dsh;
    constructor(dsh) {
        this.dsh = dsh;
    }
    async resume(nodeId, checkpoint) {
        await this.dsh.resumeTask(nodeId, checkpoint);
    }
    async stop(nodeId) {
        await this.dsh.cancelTask(nodeId);
    }
    async injectInput(text) {
        await this.dsh.sendInput(text);
    }
    emit(event) {
        this.dsh.publishEvent(event);
    }
}
//# sourceMappingURL=dsh-runtime.js.map