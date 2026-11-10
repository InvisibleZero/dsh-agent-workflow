import type { AgentNode } from '../schema/node';
// 注意：状态中文名必须从 node-state-label 取，不能从 node-state 取 ——
// 后者带 zod 运行时依赖，浏览器模块表里没有 zod，一 require 就整包失败。
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import type { NodeState } from '../schema/node-state';

const FORWARD: Record<NodeState, NodeState | null> = {
  not_started: 'discussing',
  discussing: 'implementing',
  implementing: 'verifying',
  verifying: 'completed',
  completed: null,
};

/** Workflow 树形视图：层级渲染 + 状态徽标 + 推进按钮 + 子节点操作细节编辑入口。 */
export function WorkflowTree(props: {
  nodes: AgentNode[];
  rootId: string;
  onRequestTransition: (nodeId: string, to: NodeState) => void;
  onEditChildDetail: (nodeId: string) => void;
}) {
  const byId = new Map(props.nodes.map((n) => [n.node_id, n]));

  const renderNode = (node: AgentNode, depth: number) => {
    const next = FORWARD[node.current_state];
    return (
      <li key={node.node_id} style={{ paddingLeft: depth * 16 }}>
        <span className="state-chip">{NODE_STATE_LABEL[node.current_state]}</span>
        <span className="node-title">{node.title ?? node.node_type}</span>
        {next && (
          <button type="button" onClick={() => props.onRequestTransition(node.node_id, next)}>
            推进到 {NODE_STATE_LABEL[next]}
          </button>
        )}
        {node.parent_id !== null && (
          <button type="button" onClick={() => props.onEditChildDetail(node.node_id)}>
            编辑操作细节
          </button>
        )}
        <ul>
          {node.child_ids
            .map((id) => byId.get(id))
            .filter((x): x is AgentNode => x !== undefined)
            .map((child) => renderNode(child, depth + 1))}
        </ul>
      </li>
    );
  };

  const root = byId.get(props.rootId);
  if (!root) return <div>空工作区</div>;
  return <ul className="dsh-workflow-tree">{renderNode(root, 0)}</ul>;
}
