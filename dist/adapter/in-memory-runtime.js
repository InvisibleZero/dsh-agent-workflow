/**
 * 内存版运行时适配器：功能性参考实现 + 测试替身。
 * 把 resume / stop / injectInput / emit 都记录到可读的列表里，
 * 不依赖任何外部系统，便于单测与本地运行。
 */
export class InMemoryRuntimeAdapter {
    injectedInputs = [];
    events = [];
    stopped = [];
    resumed = [];
    async resume(nodeId, checkpoint) {
        this.resumed.push({ nodeId, checkpoint });
    }
    async stop(nodeId) {
        this.stopped.push(nodeId);
    }
    async injectInput(text) {
        this.injectedInputs.push(text);
    }
    emit(event) {
        this.events.push(event);
    }
}
//# sourceMappingURL=in-memory-runtime.js.map