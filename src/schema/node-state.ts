import { z } from 'zod';

/**
 * 节点主状态（生命周期五态）。
 * 前三个活跃态（discussing / implementing / verifying）各自拥有专属操作细节（B/C/D）；
 * not_started 是保留态（无操作细节，首次对话自动进入 discussing）；
 * completed 是终态（无操作细节）。
 */
export const NodeState = z.enum([
  'not_started',   // 未开始（保留态）
  'discussing',    // 讨论中（B）
  'implementing',  // 实现中（C）
  'verifying',     // 验收中（D）
  'completed',     // 已完结（终态）
]);
export type NodeState = z.infer<typeof NodeState>;

/** 三个活跃状态，拥有专属操作细节的态。 */
export const ActiveState = z.enum(['discussing', 'implementing', 'verifying']);
export type ActiveState = z.infer<typeof ActiveState>;

/** 横切标志：叠加在主态之上（不是主态）。 */
export const NodeFlag = z.enum(['blocked']); // blocked = 异常阻塞，待人审
export type NodeFlag = z.infer<typeof NodeFlag>;

/**
 * 每个活跃状态的「专属细节」：
 * - operation_detail：该状态要做什么（独立输入框一）
 * - enter_trigger：进入该状态后自动触发的默认输入（独立输入框二，可空）
 */
export const StateDetail = z.object({
  operation_detail: z.string(),
  enter_trigger: z.string().nullable(),
});
export type StateDetail = z.infer<typeof StateDetail>;

/** 活跃态的前进顺序，用于聚合与排序。 */
export const ACTIVE_STATE_ORDER: readonly ActiveState[] = [
  'discussing',
  'implementing',
  'verifying',
];

/** 判断是否为活跃态（拥有专属细节的态）。 */
export function isActiveState(state: NodeState): state is ActiveState {
  return (ACTIVE_STATE_ORDER as readonly string[]).includes(state);
}

/** 状态中文名（UI 显示用）；实现搬到 node-state-label，避免客户端半被迫引入 zod。 */
export { NODE_STATE_LABEL } from './node-state-label';
