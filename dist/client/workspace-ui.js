import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
/**
 * 侧栏工作区共享的 UI 原语（CSS 类解析 + 类型图标 + 菜单坐标）。
 * 只依赖 react / ui-primitives / workspace-kind，不依赖 workspace-browser 或 workflow，
 * 供两个解耦模块各自 import。
 */
import { WorkspaceKind, workspaceKindIconKey } from './workspace-kind';
import { IconFolderCloseRegular, IconFolderOpenRegular } from '@deepseek-ai/dsh-client-ui-primitives';
/** 宿主 Rows 模块的 CSS Modules 哈希前缀（运行时反查，不硬编码）。 */
let rowsPrefixCache;
function rowsPrefix() {
    if (rowsPrefixCache !== undefined)
        return rowsPrefixCache;
    rowsPrefixCache = null;
    try {
        for (const sheet of Array.from(document.styleSheets)) {
            let rules;
            try {
                rules = sheet.cssRules;
            }
            catch {
                continue;
            }
            for (const rule of Array.from(rules ?? [])) {
                const selector = rule?.selectorText;
                if (typeof selector !== 'string' || !selector.includes('_sessionRow'))
                    continue;
                const matched = /\.([A-Za-z0-9]+)_sessionRow/.exec(selector);
                if (matched !== null) {
                    rowsPrefixCache = matched[1];
                    return rowsPrefixCache;
                }
            }
        }
    }
    catch {
        rowsPrefixCache = null;
    }
    return rowsPrefixCache;
}
export function rowsClass(name) {
    const prefix = rowsPrefix();
    return prefix === null ? undefined : `${prefix}_${name}`;
}
export function joinClasses(...values) {
    const kept = values.filter((value) => typeof value === 'string' && value !== '');
    return kept.length === 0 ? undefined : kept.join(' ');
}
/**
 * 从点击事件里取「触发按钮左下角」的屏幕坐标。
 *
 * 为什么不用 Menu 的 `anchor` 传元素：这个版本的 ui-primitives Menu 不测量 React 元素，
 * 只认 `getAnchorRect()`；传元素会让菜单落在默认位置（越靠下的行偏得越远）。
 */
export function menuPointFromEvent(event) {
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    if (rect === undefined || rect === null)
        return { x: 8, y: 8 };
    return { x: rect.left, y: rect.bottom + 2 };
}
/** 把上面那个坐标包成 Menu 需要的零尺寸矩形。 */
export function menuAnchorRect(point) {
    return new DOMRect(point.x, point.y, 0, 0);
}
/** 工作区类型图标：usual = 文件夹，workflow = 树结构（靠图标区分类型，标题不再加后缀）。 */
export function WorkspaceKindIcon(props) {
    const size = props.size ?? 16;
    if (workspaceKindIconKey(props.kind) === 'tree') {
        return (_jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { display: 'block' }, children: [_jsx("rect", { x: "9", y: "3", width: "6", height: "4", rx: "1" }), _jsx("rect", { x: "3", y: "16", width: "6", height: "4", rx: "1" }), _jsx("rect", { x: "15", y: "16", width: "6", height: "4", rx: "1" }), _jsx("path", { d: "M12 7v3" }), _jsx("path", { d: "M6 16v-1.6A1.4 1.4 0 0 1 7.4 13h9.2a1.4 1.4 0 0 1 1.4 1.4V16" })] }));
    }
    return props.expanded === false
        ? _jsx(IconFolderCloseRegular, { size: size })
        : _jsx(IconFolderOpenRegular, { size: size });
}
//# sourceMappingURL=workspace-ui.js.map