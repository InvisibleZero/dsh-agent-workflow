import type { AgentNode } from '../schema/node';
import type { NodeState } from '../schema/node-state';
/** Workflow 树形视图：层级渲染 + 状态徽标 + 推进按钮 + 子节点操作细节编辑入口。 */
export declare function WorkflowTree(props: {
    nodes: AgentNode[];
    rootId: string;
    onRequestTransition: (nodeId: string, to: NodeState) => void;
    onEditChildDetail: (nodeId: string) => void;
}): import("react").JSX.Element;
//# sourceMappingURL=workflow-tree.d.ts.map