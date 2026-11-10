"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsPanel = SettingsPanel;
const jsx_runtime_1 = require("react/jsx-runtime");
const node_state_editor_1 = require("./node-state-editor");
/** 全局操作细节设置面板：A（公共）+ B/C/D（三态），操作细节与默认输入各自独立输入框。 */
function SettingsPanel(props) {
    const { value, onChange } = props;
    return ((0, jsx_runtime_1.jsxs)("div", { className: "dsh-workflow-settings", children: [(0, jsx_runtime_1.jsxs)("div", { className: "settings-row", children: [(0, jsx_runtime_1.jsx)("label", { children: "\u516C\u5171\u64CD\u4F5C\u7EC6\u8282\uFF08A\uFF09" }), (0, jsx_runtime_1.jsx)("textarea", { value: value.shared_detail, onChange: (e) => onChange({ ...value, shared_detail: e.target.value }) })] }), (0, jsx_runtime_1.jsx)(node_state_editor_1.StateDetailEditor, { label: "\u8BA8\u8BBA\u4E2D", value: value.discussing, onChange: (d) => onChange({ ...value, discussing: d }) }), (0, jsx_runtime_1.jsx)(node_state_editor_1.StateDetailEditor, { label: "\u5B9E\u73B0\u4E2D", value: value.implementing, onChange: (d) => onChange({ ...value, implementing: d }) }), (0, jsx_runtime_1.jsx)(node_state_editor_1.StateDetailEditor, { label: "\u9A8C\u6536\u4E2D", value: value.verifying, onChange: (d) => onChange({ ...value, verifying: d }) })] }));
}
//# sourceMappingURL=settings-panel.js.map