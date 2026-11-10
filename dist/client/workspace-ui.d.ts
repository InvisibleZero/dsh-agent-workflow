import { WorkspaceKind } from './workspace-kind';
export declare function rowsClass(name: string): string | undefined;
export declare function joinClasses(...values: Array<string | false | null | undefined>): string | undefined;
export interface FloatingMenuItem {
    id: string;
    label: string;
    disabled?: boolean;
}
export interface FloatingMenuPoint {
    x: number;
    y: number;
}
/**
 * 自绘下拉菜单：按触发按钮的位置固定定位。
 *
 * 为什么不用 ui-primitives 的 Menu：它在这个 DSH 版本里按 anchor 计算的位置会漂移
 * （工作区/节点越往下越明显），所以这里直接拿按钮的屏幕坐标自己摆，
 * 位置和点哪个按钮永远一致。
 */
export declare function FloatingMenu(props: {
    point: FloatingMenuPoint;
    items: FloatingMenuItem[];
    onSelect: (id: string) => void;
    onClose: () => void;
}): import("react").JSX.Element;
/** 从点击事件里取触发按钮的屏幕坐标，给 FloatingMenu 用。 */
export declare function floatingMenuPointFromEvent(event: any): FloatingMenuPoint;
/** 工作区类型图标：usual = 文件夹，workflow = 树结构（靠图标区分类型，标题不再加后缀）。 */
export declare function WorkspaceKindIcon(props: {
    kind: WorkspaceKind;
    size?: number;
    expanded?: boolean;
}): import("react").JSX.Element;
//# sourceMappingURL=workspace-ui.d.ts.map