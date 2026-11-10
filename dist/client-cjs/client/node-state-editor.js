"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateDetailEditor = StateDetailEditor;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
/**
 * 状态操作细节编辑器：每个状态拆成「操作细节」与「进入后默认输入」两个独立输入框。
 * - 输入框一（textarea）：操作细节
 * - 输入框二（input）：进入该状态后自动触发的默认输入（可空）
 */
function StateDetailEditor(props) {
    const [detail, setDetail] = (0, react_1.useState)(props.value.operation_detail);
    const [trigger, setTrigger] = (0, react_1.useState)(props.value.enter_trigger ?? '');
    const commit = () => {
        props.onChange({
            operation_detail: detail,
            enter_trigger: trigger.trim() === '' ? null : trigger.trim(),
        });
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "dsh-workflow-state-detail-editor", children: [(0, jsx_runtime_1.jsxs)("div", { className: "editor-row", children: [(0, jsx_runtime_1.jsxs)("label", { className: "editor-label", children: [props.label, " \u00B7 \u64CD\u4F5C\u7EC6\u8282"] }), (0, jsx_runtime_1.jsx)("textarea", { value: detail, placeholder: "\u8BE5\u72B6\u6001\u8981\u505A\u4EC0\u4E48", onChange: (e) => setDetail(e.target.value), onBlur: commit })] }), (0, jsx_runtime_1.jsxs)("div", { className: "editor-row", children: [(0, jsx_runtime_1.jsxs)("label", { className: "editor-label", children: [props.label, " \u00B7 \u8FDB\u5165\u540E\u9ED8\u8BA4\u8F93\u5165"] }), (0, jsx_runtime_1.jsx)("input", { value: trigger, placeholder: "\u53EF\u7A7A\uFF0C\u7559\u7A7A\u5219\u4E0D\u81EA\u52A8\u89E6\u53D1", onChange: (e) => setTrigger(e.target.value), onBlur: commit })] })] }));
}
//# sourceMappingURL=node-state-editor.js.map