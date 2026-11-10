import type { WorkflowSnapshot } from '../schema/workflow';
import type { TraceLog } from '../schema/trace';
import type { NodeState } from '../schema/node-state';
import type { TransitionRequest } from '../schema/transition';

/** 存储端口：引擎只依赖它，不关心底层是文件 / DB / dsh 存储。 */
export interface WorkflowStoragePort {
  load(workspaceId: string): Promise<WorkflowSnapshot | null>;
  save(snapshot: WorkflowSnapshot): Promise<void>;
  appendTrace(log: TraceLog): Promise<void>;
  saveCheckpoint(nodeId: string, snapshot: unknown): Promise<void>;
  loadCheckpoint(nodeId: string): Promise<unknown | null>;
}

/** 运行时端口：断点续传 / 打断 / 事件。 */
export interface WorkflowRuntimePort {
  resume(nodeId: string, checkpoint: unknown): Promise<void>;
  stop(nodeId: string): Promise<void>;
  /** 注入一次默认输入（enter_trigger 触发）。 */
  injectInput(text: string): Promise<void>;
  emit(event: WorkflowEvent): void;
}

/** UI 端口：状态流转确认弹窗 + 推送状态。 */
export interface WorkflowUiPort {
  confirmTransition(request: TransitionRequest): Promise<boolean>;
  pushNodeState(nodeId: string, state: NodeState): void;
}

/** 上下文摘要端口：把节点私有上下文压缩成给子节点的精简摘要。 */
export interface ContextSummaryPort {
  summarize(payload: unknown, maxLength?: number): string;
}

export type WorkflowEvent =
  | { type: 'node_added'; node_id: string; parent_id: string | null }
  | { type: 'node_state_changed'; node_id: string; from: NodeState; to: NodeState }
  | { type: 'node_removed'; node_id: string }
  | { type: 'fault_routed'; node_id: string; route: 'retry' | 'human_in_the_loop' };
