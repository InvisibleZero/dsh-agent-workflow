import type { AgentNode } from '../schema/node';
import type { NodeState } from '../schema/node-state';

/** UI 持有的工作区视图状态。 */
export interface UiState {
  nodes: AgentNode[];
  rootId: string | null;
}

type Listener = (state: UiState) => void;

/** 简单可订阅的 UI store：把引擎状态推给 React 组件。 */
export class WorkflowUiStore {
  private state: UiState = { nodes: [], rootId: null };
  private readonly listeners = new Set<Listener>();

  getState(): UiState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setNodes(nodes: AgentNode[], rootId: string | null): void {
    this.state = { nodes, rootId };
    this.emit();
  }

  setNodeState(nodeId: string, state: NodeState): void {
    this.state = {
      ...this.state,
      nodes: this.state.nodes.map((n) => (n.node_id === nodeId ? { ...n, current_state: state } : n)),
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}
