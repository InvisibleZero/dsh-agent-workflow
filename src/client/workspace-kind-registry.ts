import type { WorkspaceKind } from './workspace-kind';

/**
 * 工作区类型插件注册表（纯契约，不 import React、也不 import 任何具体实现）。
 *
 * 目的：让 `workspace-browser`（usual 的宿主）不直接 import `workflow` 实现。
 * workflow 模块通过 `registerWorkspaceKindPlugin` 把自己挂进来，
 * 侧栏浏览器只按 `kind` 查表渲染/新建/列表 —— 两个模块的耦合只发生在：
 *   ① 这个注册表（无具体实现，只传回调）；
 *   ② `workspace-kind` 的枚举；
 *   ③ 装配点 `dsh-plugin`（唯一知道两边的地方）。
 */

/** 侧栏列表里一项非 usual 工作区的摘要（workflow 等自己定义）。 */
export interface WorkspaceKindItem {
  id: string;
  title: string;
  pinned?: boolean;
  updatedAt?: string;
}

export interface WorkspaceKindPlugin {
  kind: WorkspaceKind;
  /** 列出该类型的所有工作区（侧栏合并显示用）。 */
  list(): Promise<WorkspaceKindItem[]>;
  /** 新建一个该类型工作区（传入已选的目录路径）。 */
  create(path: string): Promise<void>;
  /**
   * 渲染该类型工作区在侧栏里的嵌入内容（含标题行 + 展开体）。
   * `ctx` 是客户端插件上下文：类型插件用它取 uiWorkspace / sessions 等服务，
   * 不需要为了拿服务反向 import workspace-browser。
   * `currentSessionId` 是当前打开着的会话（宿主用 retainedBy.mainView 判定），
   * 用来给对应节点行加选中态。
   */
  renderItem: (
    summary: WorkspaceKindItem,
    collapsed: boolean,
    onToggle: () => void,
    onChanged: (() => void) | undefined,
    ctx: any,
    currentSessionId: string | null,
  ) => any;
}

const plugins = new Map<WorkspaceKind, WorkspaceKindPlugin>();

export function registerWorkspaceKindPlugin(plugin: WorkspaceKindPlugin): void {
  plugins.set(plugin.kind, plugin);
}

export function getWorkspaceKindPlugin(kind: WorkspaceKind): WorkspaceKindPlugin | undefined {
  return plugins.get(kind);
}

/** 侧栏需要合并显示的非 usual 类型（当前只有 workflow）。 */
export function nonUsualWorkspaceKinds(): WorkspaceKind[] {
  return Array.from(plugins.keys());
}
