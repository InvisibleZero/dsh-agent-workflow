/**
 * 工作区类型：区分宿主的老工作区（usual）与 workflow 工作区（workflow）。
 *
 * 类型**不再拼标题后缀**（`（usual）`/`（workflow）` 会让标题变吵），
 * 改由左侧图标区分：usual = 文件夹，workflow = 树结构。
 * 这里只放数据与文案，图标由客户端组件按 `iconKey` 渲染。
 */

export const WorkspaceKind = {
  Usual: 'usual',
  Workflow: 'workflow',
} as const;

export type WorkspaceKind = (typeof WorkspaceKind)[keyof typeof WorkspaceKind];

/** 一类工作区的元信息：下拉框的选项来源，以及侧栏里用什么图标。 */
export interface WorkspaceKindDefinition {
  id: WorkspaceKind;
  label: string;
  description: string;
  /** 侧栏行与下拉项前面的图标：文件夹 or 树结构。 */
  iconKey: 'folder' | 'tree';
}

/**
 * 所有可创建的工作区类型（「添加工作区」下拉框就按这个数组渲染，几项＝几个选项）。
 * 以后新增类型只改这一处，下拉框/侧栏自动多一项。
 */
export const WORKSPACE_KINDS: readonly WorkspaceKindDefinition[] = [
  { id: WorkspaceKind.Usual, label: '目录工作区', description: '把一个本地目录作为工作区，里面是一组会话', iconKey: 'folder' },
  { id: WorkspaceKind.Workflow, label: '工作流工作区', description: '树形任务分解 + 五态状态机，节点可与会话绑定', iconKey: 'tree' },
];

/** 按类型取图标键（未知类型回落到文件夹）。 */
export function workspaceKindIconKey(kind: WorkspaceKind): 'folder' | 'tree' {
  return WORKSPACE_KINDS.find((definition) => definition.id === kind)?.iconKey ?? 'folder';
}
