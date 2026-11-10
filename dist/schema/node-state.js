import { z } from 'zod';
/**
 * 节点主状态（生命周期四态）。
 * 三个活跃态（discussing / implementing / verifying）各自拥有专属操作细节（B/C/D）；
 * 新节点直接进入 discussing（见 workflow-repository 的 ensureNode），
 * completed 是终态（无操作细节）。
 */
export const NodeState = z.enum([
    'discussing', // 讨论中（B）
    'implementing', // 实现中（C）
    'verifying', // 验收中（D）
    'completed', // 已完结（终态）
]);
/** 三个活跃状态，拥有专属操作细节的态。 */
export const ActiveState = z.enum(['discussing', 'implementing', 'verifying']);
/** 横切标志：叠加在主态之上（不是主态）。 */
export const NodeFlag = z.enum(['blocked']); // blocked = 异常阻塞，待人审
/**
 * 每个活跃状态的「专属细节」：
 * - operation_detail：该状态要做什么（独立输入框一）
 * - enter_trigger：进入该状态后自动触发的默认输入（独立输入框二，可空）
 */
export const StateDetail = z.object({
    operation_detail: z.string(),
    enter_trigger: z.string().nullable(),
});
/** 活跃态的前进顺序，用于聚合与排序。 */
const ACTIVE_STATE_ORDER = [
    'discussing',
    'implementing',
    'verifying',
];
/** 判断是否为活跃态（拥有专属细节的态）。 */
export function isActiveState(state) {
    return ACTIVE_STATE_ORDER.includes(state);
}
//# sourceMappingURL=node-state.js.map