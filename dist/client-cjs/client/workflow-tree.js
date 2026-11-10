"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowTree = WorkflowTree;
const jsx_runtime_1 = require("react/jsx-runtime");
// 注意：状态中文名必须从 node-state-label 取，不能从 node-state 取 ——
// 后者带 zod 运行时依赖，浏览器模块表里没有 zod，一 require 就整包失败。
const node_state_label_1 = require("../schema/node-state-label");
const FORWARD = {
    not_started: 'discussing',
    discussing: 'implementing',
    implementing: 'verifying',
    verifying: 'completed',
    completed: null,
};
/** Workflow 树形视图：层级渲染 + 状态徽标 + 推进按钮 + 子节点操作细节编辑入口。 */
function WorkflowTree(props) {
    const byId = new Map(props.nodes.map((n) => [n.node_id, n]));
    const renderNode = (node, depth) => {
        const next = FORWARD[node.current_state];
        return ((0, jsx_runtime_1.jsxs)("li", { style: { paddingLeft: depth * 16 }, children: [(0, jsx_runtime_1.jsx)("span", { className: "state-chip", children: node_state_label_1.NODE_STATE_LABEL[node.current_state] }), (0, jsx_runtime_1.jsx)("span", { className: "node-title", children: node.title ?? node.node_type }), next && ((0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => props.onRequestTransition(node.node_id, next), children: ["\u63A8\u8FDB\u5230 ", node_state_label_1.NODE_STATE_LABEL[next]] })), node.parent_id !== null && ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => props.onEditChildDetail(node.node_id), children: "\u7F16\u8F91\u64CD\u4F5C\u7EC6\u8282" })), (0, jsx_runtime_1.jsx)("ul", { children: node.child_ids
                        .map((id) => byId.get(id))
                        .filter((x) => x !== undefined)
                        .map((child) => renderNode(child, depth + 1)) })] }, node.node_id));
    };
    const root = byId.get(props.rootId);
    if (!root)
        return (0, jsx_runtime_1.jsx)("div", { children: "\u7A7A\u5DE5\u4F5C\u533A" });
    return (0, jsx_runtime_1.jsx)("ul", { className: "dsh-workflow-tree", children: renderNode(root, 0) });
}
//# sourceMappingURL=workflow-tree.js.map