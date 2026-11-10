import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
/**
 * 面板图标：外框按钮、选中态、可访问名都由宿主（`sidebar.panellist` 的列表主人）负责，
 * 这里只画图形并跟随 `currentColor`，尺寸由宿主通过 `size` 传入。
 */
export function WorkflowPanelIcon(props) {
    const size = props.size ?? 18;
    return (_jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block', opacity: props.active ? 1 : 0.72 }, children: [_jsx("circle", { cx: "6", cy: "6", r: "2.6" }), _jsx("circle", { cx: "18", cy: "12", r: "2.6" }), _jsx("circle", { cx: "6", cy: "18", r: "2.6" }), _jsx("path", { d: "M8.4 7.3 15.6 11M8.4 16.7 15.6 13" })] }));
}
//# sourceMappingURL=workflow-panel-icon.js.map