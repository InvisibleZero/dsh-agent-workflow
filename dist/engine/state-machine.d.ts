import type { AgentNode } from '../schema/node';
import { type NodeState } from '../schema/node-state';
import type { GlobalOperationDetail } from '../schema/workflow';
/** 进入目标状态后实际读到的操作细节（A + B/C/D）与默认输入。 */
export declare function effectiveDetail(targetState: NodeState, node: AgentNode, global: GlobalOperationDetail): {
    full_detail: string;
    enter_trigger: string | null;
};
//# sourceMappingURL=state-machine.d.ts.map