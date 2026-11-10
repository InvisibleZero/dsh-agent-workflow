import type { AgentNode } from '../schema/node';
import type { NodeState } from '../schema/node-state';
/** UI 持有的工作区视图状态。 */
export interface UiState {
    nodes: AgentNode[];
    rootId: string | null;
}
type Listener = (state: UiState) => void;
/** 简单可订阅的 UI store：把引擎状态推给 React 组件。 */
export declare class WorkflowUiStore {
    private state;
    private readonly listeners;
    getState(): UiState;
    subscribe(listener: Listener): () => void;
    setNodes(nodes: AgentNode[], rootId: string | null): void;
    setNodeState(nodeId: string, state: NodeState): void;
    private emit;
}
export {};
//# sourceMappingURL=ui-store.d.ts.map