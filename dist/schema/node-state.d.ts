import { z } from 'zod';
/**
 * 节点主状态（生命周期五态）。
 * 前三个活跃态（discussing / implementing / verifying）各自拥有专属操作细节（B/C/D）；
 * not_started 是保留态（无操作细节，首次对话自动进入 discussing）；
 * completed 是终态（无操作细节）。
 */
export declare const NodeState: z.ZodEnum<["not_started", "discussing", "implementing", "verifying", "completed"]>;
export type NodeState = z.infer<typeof NodeState>;
/** 三个活跃状态，拥有专属操作细节的态。 */
export declare const ActiveState: z.ZodEnum<["discussing", "implementing", "verifying"]>;
export type ActiveState = z.infer<typeof ActiveState>;
/** 横切标志：叠加在主态之上（不是主态）。 */
export declare const NodeFlag: z.ZodEnum<["blocked"]>;
export type NodeFlag = z.infer<typeof NodeFlag>;
/**
 * 每个活跃状态的「专属细节」：
 * - operation_detail：该状态要做什么（独立输入框一）
 * - enter_trigger：进入该状态后自动触发的默认输入（独立输入框二，可空）
 */
export declare const StateDetail: z.ZodObject<{
    operation_detail: z.ZodString;
    enter_trigger: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    operation_detail: string;
    enter_trigger: string | null;
}, {
    operation_detail: string;
    enter_trigger: string | null;
}>;
export type StateDetail = z.infer<typeof StateDetail>;
/** 活跃态的前进顺序，用于聚合与排序。 */
export declare const ACTIVE_STATE_ORDER: readonly ActiveState[];
/** 判断是否为活跃态（拥有专属细节的态）。 */
export declare function isActiveState(state: NodeState): state is ActiveState;
/** 状态中文名（UI 显示用）；实现搬到 node-state-label，避免客户端半被迫引入 zod。 */
export { NODE_STATE_LABEL } from './node-state-label';
//# sourceMappingURL=node-state.d.ts.map