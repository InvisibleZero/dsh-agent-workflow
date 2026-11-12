import type { AgentNode } from '../schema/node';
import { type NodeState } from '../schema/node-state';
import type { GlobalOperationDetail } from '../schema/workflow';
/** 进入目标状态后实际读到的操作细节（A + B/C/D）与默认输入。 */
export declare function effectiveDetail(targetState: NodeState, node: AgentNode, global: GlobalOperationDetail): {
    full_detail: string;
    enter_trigger: string | null;
};
/**
 * 把 A（三态通用）与 B/C/D（本状态专属）分开返回。
 *
 * 注入侧两层各自挂载、各自预算：拼成一坨之后，模型分不清哪句是三态通用、哪句是本阶段专用，
 * 日志里也看不出是哪一层把预算吃掉了。
 */
export declare function effectiveDetailParts(targetState: NodeState, node: AgentNode, global: GlobalOperationDetail): {
    shared_detail: string;
    state_detail: string;
    enter_trigger: string | null;
};
//# sourceMappingURL=state-machine.d.ts.map