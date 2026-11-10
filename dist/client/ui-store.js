/** 简单可订阅的 UI store：把引擎状态推给 React 组件。 */
export class WorkflowUiStore {
    state = { nodes: [], rootId: null };
    listeners = new Set();
    getState() {
        return this.state;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    setNodes(nodes, rootId) {
        this.state = { nodes, rootId };
        this.emit();
    }
    setNodeState(nodeId, state) {
        this.state = {
            ...this.state,
            nodes: this.state.nodes.map((n) => (n.node_id === nodeId ? { ...n, current_state: state } : n)),
        };
        this.emit();
    }
    emit() {
        for (const listener of this.listeners)
            listener(this.state);
    }
}
//# sourceMappingURL=ui-store.js.map