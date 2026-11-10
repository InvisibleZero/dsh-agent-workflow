/** 全局操作细节（A + B/C/D）编辑弹窗：按 workflow 保存到该快照的 settings。 */
export declare function WorkflowSettingsDialog(props: {
    workflowId: string;
    onClose: () => void;
}): import("react").JSX.Element;
/** 节点操作细节弹窗：展示该节点当前生效的 A + B/C/D，并标出节点自己覆盖的条目。 */
export declare function WorkflowNodeDetailDialog(props: {
    workflowId: string;
    nodeId: string;
    onClose: () => void;
}): import("react").JSX.Element;
//# sourceMappingURL=workflow-dialogs.d.ts.map