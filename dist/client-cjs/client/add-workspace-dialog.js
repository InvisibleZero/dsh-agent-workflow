"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddWorkspaceDialog = AddWorkspaceDialog;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * 「添加工作区」弹窗：两个入口——默认工作区 / Workflow 工作区。
 * TODO(spike): 挂到 dsh-web-app 的「添加工作区」扩展点。
 */
function AddWorkspaceDialog(props) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "dsh-workflow-add-workspace-dialog", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", onClick: props.onAddDefault, children: "\u9ED8\u8BA4\u5DE5\u4F5C\u533A" }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: props.onAddWorkflow, children: "Workflow \u5DE5\u4F5C\u533A" })] }));
}
//# sourceMappingURL=add-workspace-dialog.js.map