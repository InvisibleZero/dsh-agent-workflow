import type { WorkflowUiPort } from '../adapter/port';
import type { TransitionRequest } from '../schema/transition';
import type { NodeState } from '../schema/node-state';
import type { WorkflowUiStore } from './ui-store';
/** React UI 适配器：把 WorkflowUiPort 接到 UI store + 确认弹窗。 */
export declare class WorkflowUiAdapter implements WorkflowUiPort {
    private readonly store;
    private readonly confirm;
    constructor(store: WorkflowUiStore, confirm: (request: TransitionRequest) => Promise<boolean>);
    confirmTransition(request: TransitionRequest): Promise<boolean>;
    pushNodeState(nodeId: string, state: NodeState): void;
}
//# sourceMappingURL=workflow-ui-adapter.d.ts.map