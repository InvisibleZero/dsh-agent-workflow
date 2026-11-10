import type { WorkflowUiPort } from '../adapter/port';
import type { TransitionRequest } from '../schema/transition';
import type { NodeState } from '../schema/node-state';
import type { WorkflowUiStore } from './ui-store';

/** React UI 适配器：把 WorkflowUiPort 接到 UI store + 确认弹窗。 */
export class WorkflowUiAdapter implements WorkflowUiPort {
  constructor(
    private readonly store: WorkflowUiStore,
    private readonly confirm: (request: TransitionRequest) => Promise<boolean>,
  ) {}

  async confirmTransition(request: TransitionRequest): Promise<boolean> {
    return this.confirm(request);
  }

  pushNodeState(nodeId: string, state: NodeState): void {
    this.store.setNodeState(nodeId, state);
  }
}
