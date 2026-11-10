// @ts-nocheck
/**
 * Menu 定位工具（从已删除的 workspace-ui 里保留下来的最小部分）。
 * 只依赖浏览器原生 DOMRect，供会话状态徽标里的清单菜单使用。
 */
/**
 * 从点击事件里取「触发按钮左下角」的屏幕坐标。
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
//# sourceMappingURL=menu-util.js.map