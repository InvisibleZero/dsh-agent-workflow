import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
/**
 * 状态操作细节编辑器：每个状态拆成「操作细节」与「进入后默认输入」两个独立输入框。
 * - 输入框一（textarea）：操作细节
 * - 输入框二（input）：进入该状态后自动触发的默认输入（可空）
 */
export function StateDetailEditor(props) {
    const [detail, setDetail] = useState(props.value.operation_detail);
    const [trigger, setTrigger] = useState(props.value.enter_trigger ?? '');
    const commit = () => {
        props.onChange({
            operation_detail: detail,
            enter_trigger: trigger.trim() === '' ? null : trigger.trim(),
        });
    };
    return (_jsxs("div", { className: "dsh-workflow-state-detail-editor", children: [_jsxs("div", { className: "editor-row", children: [_jsxs("label", { className: "editor-label", children: [props.label, " \u00B7 \u64CD\u4F5C\u7EC6\u8282"] }), _jsx("textarea", { value: detail, placeholder: "\u8BE5\u72B6\u6001\u8981\u505A\u4EC0\u4E48", onChange: (e) => setDetail(e.target.value), onBlur: commit })] }), _jsxs("div", { className: "editor-row", children: [_jsxs("label", { className: "editor-label", children: [props.label, " \u00B7 \u8FDB\u5165\u540E\u9ED8\u8BA4\u8F93\u5165"] }), _jsx("input", { value: trigger, placeholder: "\u53EF\u7A7A\uFF0C\u7559\u7A7A\u5219\u4E0D\u81EA\u52A8\u89E6\u53D1", onChange: (e) => setTrigger(e.target.value), onBlur: commit })] })] }));
}
//# sourceMappingURL=node-state-editor.js.map