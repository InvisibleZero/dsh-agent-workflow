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
};
/**
 * 所有可创建的工作区类型（「添加工作区」下拉框就按这个数组渲染，几项＝几个选项）。
 * 以后新增类型只改这一处，下拉框/侧栏自动多一项。
 */
export const WORKSPACE_KINDS = [
    { id: WorkspaceKind.Usual, label: '目录工作区', description: '把一个本地目录作为工作区，里面是一组会话', iconKey: 'folder' },
    { id: WorkspaceKind.Workflow, label: '工作流工作区', description: '树形任务分解 + 五态状态机，节点可与会话绑定', iconKey: 'tree' },
];
/** 按类型取图标键（未知类型回落到文件夹）。 */
export function workspaceKindIconKey(kind) {
    return WORKSPACE_KINDS.find((definition) => definition.id === kind)?.iconKey ?? 'folder';
}
//# sourceMappingURL=workspace-kind.js.map