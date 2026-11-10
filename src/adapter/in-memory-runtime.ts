import type { WorkflowRuntimePort, WorkflowEvent } from './port';

/**
 * 内存版运行时适配器：功能性参考实现 + 测试替身。
 * 把 resume / stop / injectInput / emit 都记录到可读的列表里，
 * 不依赖任何外部系统，便于单测与本地运行。
 */
export class InMemoryRuntimeAdapter implements WorkflowRuntimePort {
  readonly injectedInputs: string[] = [];
  readonly events: WorkflowEvent[] = [];
  readonly stopped: string[] = [];
  readonly resumed: Array<{ nodeId: string; checkpoint: unknown }> = [];

  async resume(nodeId: string, checkpoint: unknown): Promise<void> {
    this.resumed.push({ nodeId, checkpoint });
  }

  async stop(nodeId: string): Promise<void> {
    this.stopped.push(nodeId);
  }

  async injectInput(text: string): Promise<void> {
    this.injectedInputs.push(text);
  }

  emit(event: WorkflowEvent): void {
    this.events.push(event);
  }
}
