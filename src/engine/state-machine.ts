import type { AgentNode } from '../schema/node';
import { isActiveState, type ActiveState, type NodeState, type StateDetail } from '../schema/node-state';
import type { GlobalOperationDetail } from '../schema/workflow';

/** 进入目标状态后实际读到的操作细节（A + B/C/D）与默认输入。 */
export function effectiveDetail(
  targetState: NodeState,
  node: AgentNode,
  global: GlobalOperationDetail,
): { full_detail: string; enter_trigger: string | null } {
  // 已完结没有专属细节，只返回公共 A
  if (!isActiveState(targetState)) {
    return { full_detail: global.shared_detail, enter_trigger: null };
  }
  const target = targetState satisfies ActiveState;
  const slot: StateDetail = global[target];
  const specific = node.state_detail_overrides?.[target] ?? slot;
  return {
    full_detail: `${global.shared_detail}\n\n${specific.operation_detail}`,
    enter_trigger: specific.enter_trigger,
  };
}
