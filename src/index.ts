import type { WorkflowSnapshot } from './schema/workflow';
import { WorkflowService } from './service/workflow-service';
import { JsonStorageAdapter } from './adapter/json-storage';
import { DshRuntimeAdapter } from './adapter/dsh-runtime';
import { InMemoryRuntimeAdapter } from './adapter/in-memory-runtime';

export * from './schema/node-state';
export * from './schema/node';
export * from './schema/workflow';
export * from './schema/transition';
export * from './schema/migration';
export * from './schema/trace';
export * from './schema/fault';
export * from './engine/state-machine';
export * from './engine/tree-store';
export * from './engine/aggregation';
export * from './engine/interrupt';
export * from './engine/circuit-breaker';
export * from './engine/fault-router';
export * from './adapter/port';
export { JsonStorageAdapter } from './adapter/json-storage';
export { DshRuntimeAdapter, type DshRuntimeCapabilities } from './adapter/dsh-runtime';
export { InMemoryRuntimeAdapter } from './adapter/in-memory-runtime';
export { NaiveContextSummarizer } from './adapter/context-summary';
export { WorkflowService } from './service/workflow-service';
export * from './service/workflow-tool';

/**
 * 插件入口（桩）。
 * TODO(spike): 按 cordis 插件契约导出插件本体，注册到 dsh harness：
 * - 用 cordis 服务声明把 WorkflowService 挂到生命周期。
 * - 注入 JsonStorageAdapter（或 dsh 存储适配器）+ DshRuntimeAdapter + UI 适配器。
 * - 向 agent 暴露 workflow 工具（增删节点 / 流转状态 / 改操作细节）。
 *
 * 当前先导出一层薄薄的门面，保证外部可 import 纯引擎做测试，且与 dsh 解耦。
 */
export function createWorkflowService(
  snapshot: WorkflowSnapshot,
  baseDir: string,
): WorkflowService {
  const storage = new JsonStorageAdapter(baseDir);
  const runtime = new InMemoryRuntimeAdapter();
  const ui = {
    async confirmTransition() {
      return false; // TODO(spike): 接入真实弹窗
    },
    pushNodeState() {
      // TODO(spike): 推送到前端
    },
  };
  return new WorkflowService(snapshot, storage, runtime, ui);
}
