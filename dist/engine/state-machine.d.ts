import type { AgentNode } from '../schema/node';
import { type NodeState } from '../schema/node-state';
import type { GlobalOperationDetail } from '../schema/workflow';
import type { Transition, TransitionRequest } from '../schema/transition';
/** 合法转移表（数据驱动，未来可在设置里扩展，不做硬编码 if-else）。 */
export declare const TRANSITIONS: readonly Transition[];
export declare function findTransition(from: NodeState, to: NodeState): Transition | undefined;
export declare function canTransition(from: NodeState, to: NodeState): boolean;
/** 判断节点是否被阻塞（异常待人审）。 */
export declare function isBlocked(node: AgentNode): boolean;
/** 进入目标状态后实际读到的操作细节（A + B/C/D）与默认输入。 */
export declare function effectiveDetail(targetState: NodeState, node: AgentNode, global: GlobalOperationDetail): {
    full_detail: string;
    enter_trigger: string | null;
};
/** 申请状态流转：校验合法性 + 步数熔断，返回待确认请求（gated 需弹窗）。 */
export declare function requestTransition(node: AgentNode, to: NodeState, global: GlobalOperationDetail): TransitionRequest;
/** 应用已确认的流转（gated 需先经 UI 确认）。返回新节点对象，不改原对象。 */
export declare function applyTransition(node: AgentNode, to: NodeState): AgentNode;
//# sourceMappingURL=state-machine.d.ts.map