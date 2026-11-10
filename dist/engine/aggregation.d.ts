import type { AgentNode } from '../schema/node';
import type { NodeState } from '../schema/node-state';
import type { AggregationMode } from '../schema/workflow';
/** 树形读取接口（避免引擎直接依赖具体树实现）。 */
export interface TreeReader {
    getNode(id: string): AgentNode | undefined;
    childrenOf(id: string): AgentNode[];
}
/** 根据子节点推导父节点状态；返回 null 表示父状态不自动变化。 */
export declare function deriveParentState(children: AgentNode[], mode: AggregationMode): NodeState | null;
/** 冒泡：子节点状态变化后，向上逐层重算，返回需要更新的 (节点id, 新状态) 列表。 */
export declare function bubbleUp(tree: TreeReader, startNodeId: string, mode: AggregationMode): Array<{
    node_id: string;
    state: NodeState;
}>;
//# sourceMappingURL=aggregation.d.ts.map