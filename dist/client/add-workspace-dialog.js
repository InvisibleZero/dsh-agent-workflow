import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 「添加工作区」弹窗：两个入口——默认工作区 / Workflow 工作区。
 * TODO(spike): 挂到 dsh-web-app 的「添加工作区」扩展点。
 */
export function AddWorkspaceDialog(props) {
    return (_jsxs("div", { className: "dsh-workflow-add-workspace-dialog", children: [_jsx("button", { type: "button", onClick: props.onAddDefault, children: "\u9ED8\u8BA4\u5DE5\u4F5C\u533A" }), _jsx("button", { type: "button", onClick: props.onAddWorkflow, children: "Workflow \u5DE5\u4F5C\u533A" })] }));
}
//# sourceMappingURL=add-workspace-dialog.js.map