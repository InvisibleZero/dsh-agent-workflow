/**
 * 设置页里的「操作细节」分区内容。
 * A/B/C/D 四个页签横向排开；每个状态页签内：默认输入在上（20%），操作细节在下（80%）。
 */
export declare function WorkflowGlobalSettingsSection(): import("react").JSX.Element;
/** 把「操作细节」分区挂进 设置 → 左侧导航。 */
export declare function applyWorkflowSettingsSection(ctx: any): void;
/** 节点操作细节弹窗：展示该节点当前生效的 A + B/C/D，并标出节点自己覆盖的条目。 */
export declare function WorkflowNodeDetailDialog(props: {
    workflowId: string;
    nodeId: string;
    onClose: () => void;
}): import("react").JSX.Element;
//# sourceMappingURL=workflow-dialogs.d.ts.map