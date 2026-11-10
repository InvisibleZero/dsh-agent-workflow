/** React UI 适配器：把 WorkflowUiPort 接到 UI store + 确认弹窗。 */
export class WorkflowUiAdapter {
    store;
    confirm;
    constructor(store, confirm) {
        this.store = store;
        this.confirm = confirm;
    }
    async confirmTransition(request) {
        return this.confirm(request);
    }
    pushNodeState(nodeId, state) {
        this.store.setNodeState(nodeId, state);
    }
}
//# sourceMappingURL=workflow-ui-adapter.js.map