import type { NodeState } from './node-state';
/** 流转类型：auto=自动（首次对话），gated=需弹窗确认。 */
export type TransitionKind = 'auto' | 'gated';
/** 一次合法的状态迁移（转移表条目）。 */
export interface Transition {
    from: NodeState;
    to: NodeState;
    kind: TransitionKind;
}
/** 状态流转请求：引擎产出、UI 消费的契约 DTO。 */
export interface TransitionRequest {
    node_id: string;
    from: NodeState;
    to: NodeState;
    kind: TransitionKind;
    full_detail: string;
    enter_trigger: string | null;
}
//# sourceMappingURL=transition.d.ts.map