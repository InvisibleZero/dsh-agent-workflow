import { z } from 'zod';
/**
 * 节点主状态（生命周期四态）。
 * 三个活跃态（discussing / implementing / verifying）各自拥有专属操作细节（B/C/D）；
 * 新节点直接进入 discussing（见 workflow-repository 的 ensureNode），
 * completed 是终态（无操作细节）。
 */
export declare const NodeState: z.ZodEnum<["discussing", "implementing", "verifying", "completed"]>;
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
/** 判断是否为活跃态（拥有专属细节的态）。 */
export declare function isActiveState(state: NodeState): state is ActiveState;
//# sourceMappingURL=node-state.d.ts.map