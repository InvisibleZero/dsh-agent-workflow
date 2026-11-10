"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowUiAdapter = void 0;
/** React UI 适配器：把 WorkflowUiPort 接到 UI store + 确认弹窗。 */
class WorkflowUiAdapter {
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
exports.WorkflowUiAdapter = WorkflowUiAdapter;
//# sourceMappingURL=workflow-ui-adapter.js.map