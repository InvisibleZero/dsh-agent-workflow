/**
 * 设置页里的「操作细节」分区内容。
 * A/B/C/D 四个页签横向排开；每个状态页签内：默认输入在上（20%），操作细节在下（80%）。
 */
export declare function WorkflowGlobalSettingsSection(): import("react").JSX.Element;
/** 把「操作细节」分区挂进 设置 → 左侧导航。 */
export declare function applyWorkflowSettingsSection(ctx: any): void;
/** 全局操作细节的独立弹窗版（与设置页共用同一个编辑组件）。 */
export declare function WorkflowSettingsDialog(props: {
    onClose: () => void;
}): import("react").JSX.Element;
/** 节点补充说明弹窗：只编辑这个节点自己的附加说明，全局内容去设置里看。 */
export declare function WorkflowNodeDetailDialog(props: {
    workflowId: string;
    nodeId: string;
    onClose: () => void;
    onOpenSettings?: () => void;
}): import("react").JSX.Element;
//# sourceMappingURL=workflow-dialogs.d.ts.map