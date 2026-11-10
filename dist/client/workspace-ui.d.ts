/**
 * 侧栏工作区共享的 UI 原语（CSS 类解析 + 类型图标 + 菜单坐标）。
 * 只依赖 react / ui-primitives / workspace-kind，不依赖 workspace-browser 或 workflow，
 * 供两个解耦模块各自 import。
 */
import { WorkspaceKind } from './workspace-kind';
export declare function rowsClass(name: string): string | undefined;
export declare function joinClasses(...values: Array<string | false | null | undefined>): string | undefined;
export interface MenuPoint {
    x: number;
    y: number;
}
/**
 * 从点击事件里取「触发按钮左下角」的屏幕坐标。
 *
 * 为什么不用 Menu 的 `anchor` 传元素：这个版本的 ui-primitives Menu 不测量 React 元素，
 * 只认 `getAnchorRect()`；传元素会让菜单落在默认位置（越靠下的行偏得越远）。
 */
export declare function menuPointFromEvent(event: any): MenuPoint;
/** 把上面那个坐标包成 Menu 需要的零尺寸矩形。 */
export declare function menuAnchorRect(point: MenuPoint): any;
/** 工作区类型图标：usual = 文件夹，workflow = 树结构（靠图标区分类型，标题不再加后缀）。 */
export declare function WorkspaceKindIcon(props: {
    kind: WorkspaceKind;
    size?: number;
    expanded?: boolean;
}): import("react").JSX.Element;
//# sourceMappingURL=workspace-ui.d.ts.map