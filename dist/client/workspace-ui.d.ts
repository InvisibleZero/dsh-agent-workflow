/**
 * 侧栏工作区共享的 UI 原语（CSS 类解析 + 类型图标）。
 * 只依赖 react / ui-primitives / workspace-kind，不依赖 workspace-browser 或 workflow，
 * 供两个解耦模块各自 import。
 */
import { WorkspaceKind } from './workspace-kind';
export declare function rowsClass(name: string): string | undefined;
export declare function joinClasses(...values: Array<string | false | null | undefined>): string | undefined;
/** 工作区类型图标：usual = 文件夹，workflow = 树结构（靠图标区分类型，标题不再加后缀）。 */
export declare function WorkspaceKindIcon(props: {
    kind: WorkspaceKind;
    size?: number;
    expanded?: boolean;
}): import("react").JSX.Element;
//# sourceMappingURL=workspace-ui.d.ts.map