"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NODE_STATE_LABEL = exports.ACTIVE_STATE_ORDER = exports.StateDetail = exports.NodeFlag = exports.ActiveState = exports.NodeState = void 0;
exports.isActiveState = isActiveState;
const zod_1 = require("zod");
/**
 * 节点主状态（生命周期五态）。
 * 前三个活跃态（discussing / implementing / verifying）各自拥有专属操作细节（B/C/D）；
 * not_started 是保留态（无操作细节，首次对话自动进入 discussing）；
 * completed 是终态（无操作细节）。
 */
exports.NodeState = zod_1.z.enum([
    'not_started', // 未开始（保留态）
    'discussing', // 讨论中（B）
    'implementing', // 实现中（C）
    'verifying', // 验收中（D）
    'completed', // 已完结（终态）
]);
/** 三个活跃状态，拥有专属操作细节的态。 */
exports.ActiveState = zod_1.z.enum(['discussing', 'implementing', 'verifying']);
/** 横切标志：叠加在主态之上（不是主态）。 */
exports.NodeFlag = zod_1.z.enum(['blocked']); // blocked = 异常阻塞，待人审
/**
 * 每个活跃状态的「专属细节」：
 * - operation_detail：该状态要做什么（独立输入框一）
 * - enter_trigger：进入该状态后自动触发的默认输入（独立输入框二，可空）
 */
exports.StateDetail = zod_1.z.object({
    operation_detail: zod_1.z.string(),
    enter_trigger: zod_1.z.string().nullable(),
});
/** 活跃态的前进顺序，用于聚合与排序。 */
exports.ACTIVE_STATE_ORDER = [
    'discussing',
    'implementing',
    'verifying',
];
/** 判断是否为活跃态（拥有专属细节的态）。 */
function isActiveState(state) {
    return exports.ACTIVE_STATE_ORDER.includes(state);
}
/** 状态中文名（UI 显示用）；实现搬到 node-state-label，避免客户端半被迫引入 zod。 */
var node_state_label_1 = require("./node-state-label");
Object.defineProperty(exports, "NODE_STATE_LABEL", { enumerable: true, get: function () { return node_state_label_1.NODE_STATE_LABEL; } });
//# sourceMappingURL=node-state.js.map