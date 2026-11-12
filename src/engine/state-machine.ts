import type { AgentNode } from '../schema/node';
import { isActiveState, type ActiveState, type NodeState, type StateDetail } from '../schema/node-state';
import type { GlobalOperationDetail } from '../schema/workflow';

/** 进入目标状态后实际读到的操作细节（A + B/C/D）与默认输入。 */
export function effectiveDetail(
  targetState: NodeState,
  node: AgentNode,
  global: GlobalOperationDetail,
): { full_detail: string; enter_trigger: string | null } {
  const parts = effectiveDetailParts(targetState, node, global);
  const full_detail = parts.state_detail.trim() === ''
    ? parts.shared_detail
    : `${parts.shared_detail}\n\n${parts.state_detail}`;
  return { full_detail, enter_trigger: parts.enter_trigger };
}

/**
 * 把 A（三态通用）与 B/C/D（本状态专属）分开返回。
 *
 * 注入侧两层各自挂载、各自预算：拼成一坨之后，模型分不清哪句是三态通用、哪句是本阶段专用，
 * 日志里也看不出是哪一层把预算吃掉了。
 */
export function effectiveDetailParts(
  targetState: NodeState,
  node: AgentNode,
  global: GlobalOperationDetail,
): { shared_detail: string; state_detail: string; enter_trigger: string | null } {
  // 已完结没有专属细节，只返回公共 A
  if (!isActiveState(targetState)) {
    return { shared_detail: global.shared_detail, state_detail: '', enter_trigger: null };
  }
  const target = targetState satisfies ActiveState;
  const slot: StateDetail = global[target];
  const specific = node.state_detail_overrides?.[target] ?? slot;
  return {
    shared_detail: global.shared_detail,
    state_detail: specific.operation_detail,
    enter_trigger: specific.enter_trigger,
  };
}
