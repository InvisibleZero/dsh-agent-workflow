import type { AgentNode } from '../schema/node';
import type { NodeState } from '../schema/node-state';
import type { AggregationMode } from '../schema/workflow';

/** 树形读取接口（避免引擎直接依赖具体树实现）。 */
export interface TreeReader {
  getNode(id: string): AgentNode | undefined;
  childrenOf(id: string): AgentNode[];
}

/** 根据子节点推导父节点状态；返回 null 表示父状态不自动变化。 */
export function deriveParentState(children: AgentNode[], mode: AggregationMode): NodeState | null {
  if (mode === 'manual' || children.length === 0) return null;

  if (mode === 'all_complete') {
    // 仅当所有子节点都完成时，父节点自动流转为已完结
    return children.every((c) => c.current_state === 'completed') ? 'completed' : null;
  }

  // any_active：父态反映子节点的「最前沿」
  if (children.some((c) => c.current_state === 'discussing')) return 'discussing';
  if (children.some((c) => c.current_state === 'implementing')) return 'implementing';
  if (children.some((c) => c.current_state === 'verifying')) return 'verifying';
  return null;
}

/** 冒泡：子节点状态变化后，向上逐层重算，返回需要更新的 (节点id, 新状态) 列表。 */
export function bubbleUp(
  tree: TreeReader,
  startNodeId: string,
  mode: AggregationMode,
): Array<{ node_id: string; state: NodeState }> {
  const updates: Array<{ node_id: string; state: NodeState }> = [];
  let current = tree.getNode(startNodeId);
  while (current?.parent_id) {
    const parent = tree.getNode(current.parent_id);
    if (!parent) break;
    const next = deriveParentState(tree.childrenOf(parent.node_id), mode);
    if (next && next !== parent.current_state) {
      updates.push({ node_id: parent.node_id, state: next });
    }
    current = parent;
  }
  return updates;
}
