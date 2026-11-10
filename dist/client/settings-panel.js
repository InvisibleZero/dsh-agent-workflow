import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { StateDetailEditor } from './node-state-editor';
/** 全局操作细节设置面板：A（公共）+ B/C/D（三态），操作细节与默认输入各自独立输入框。 */
export function SettingsPanel(props) {
    const { value, onChange } = props;
    return (_jsxs("div", { className: "dsh-workflow-settings", children: [_jsxs("div", { className: "settings-row", children: [_jsx("label", { children: "\u516C\u5171\u64CD\u4F5C\u7EC6\u8282\uFF08A\uFF09" }), _jsx("textarea", { value: value.shared_detail, onChange: (e) => onChange({ ...value, shared_detail: e.target.value }) })] }), _jsx(StateDetailEditor, { label: "\u8BA8\u8BBA\u4E2D", value: value.discussing, onChange: (d) => onChange({ ...value, discussing: d }) }), _jsx(StateDetailEditor, { label: "\u5B9E\u73B0\u4E2D", value: value.implementing, onChange: (d) => onChange({ ...value, implementing: d }) }), _jsx(StateDetailEditor, { label: "\u9A8C\u6536\u4E2D", value: value.verifying, onChange: (d) => onChange({ ...value, verifying: d }) })] }));
}
//# sourceMappingURL=settings-panel.js.map