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
 *
 * 重要模型：**一个宿主的目录工作区只属于一种类型**。
 * workflow 工作区就是一个真实的目录工作区，只是类型插件认领了它、用树形逻辑渲染；
 * 侧栏按 `matchWorkspace` 判断认领关系，因此同一个目录不会出现两行。
 */

/** 侧栏列表里一项非 usual 工作区的摘要（workflow 等自己定义）。 */
export interface WorkspaceKindItem {
  id: string;
  title: string;
  /** 对应的宿主目录工作区 id（认领关系的主键）。 */
  workspaceId?: string;
  /** 对应的磁盘目录（认领关系的兜底判据，旧数据没有 workspaceId 时用）。 */
  path?: string;
  pinned?: boolean;
  updatedAt?: string;
}

/** 宿主目录工作区的最小外观（只读，侧栏提供）。 */
export interface HostWorkspaceRef {
  workspaceId?: string;
  path?: string;
}

/** 类型插件在侧栏里渲染时拿到的运行环境（由侧栏浏览器提供，避免反向 import）。 */
export interface WorkspaceKindRuntime {
  /** 客户端插件上下文：用来取 uiWorkspace / sessions / workspaces 等服务。 */
  ctx: any;
  /** 当前打开着的会话 id（宿主用 retainedBy.mainView 判定）；没有就是 null。 */
  currentSessionId: string | null;
  /** 按目录路径找宿主「目录工作区」的 id；找不到返回 null。 */
  findWorkspaceIdByPath(path: string): string | null;
  /** 打开宿主的「重命名工作区」对话框（与 usual 行一致）。 */
  requestRenameWorkspace(workspaceId: string, currentTitle: string): void;
  /** 删除宿主工作区；若该工作区被某个类型认领，连带删除它的类型数据。 */
  requestDeleteWorkspace(workspaceId: string): void;
}

export interface WorkspaceKindPlugin {
  kind: WorkspaceKind;
  /** 列出该类型的所有工作区（侧栏合并显示用）。 */
  list(): Promise<WorkspaceKindItem[]>;
  /**
   * 新建一个该类型工作区（传入已选的目录路径）。
   * `context.workspaceId` 是侧栏已经建好的宿主目录工作区 id——
   * workflow 工作区本质就是它，所以创建时就要把两者绑在一起。
   */
  create(path: string, context?: { workspaceId?: string | null }): Promise<void>;
  /** 判断这一项是否就是这个宿主目录工作区（类型认领）。 */
  matchWorkspace(item: WorkspaceKindItem, workspace: HostWorkspaceRef): boolean;
  /** 渲染该类型工作区在侧栏里的嵌入内容（含标题行 + 展开体）。 */
  renderItem: (
    summary: WorkspaceKindItem,
    collapsed: boolean,
    onToggle: () => void,
    onChanged: (() => void) | undefined,
    runtime: WorkspaceKindRuntime,
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

/** 目录路径归一化：Windows 下大小写、路径分隔符、结尾斜杠都不敏感。 */
export function normalizeWorkspacePath(path: string): string {
  return path.trim().replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
}

/** 这一项类型工作区是否认领了某个宿主目录工作区。 */
export function workspaceKindClaims(kind: WorkspaceKind, item: WorkspaceKindItem, workspace: HostWorkspaceRef): boolean {
  const plugin = plugins.get(kind);
  if (plugin === undefined || typeof plugin.matchWorkspace !== 'function') return false;
  return plugin.matchWorkspace(item, workspace) === true;
}
