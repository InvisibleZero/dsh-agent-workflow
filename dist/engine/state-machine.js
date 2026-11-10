import { isActiveState } from '../schema/node-state';
import { assertCanStep } from './circuit-breaker';
/** 合法转移表（数据驱动，未来可在设置里扩展，不做硬编码 if-else）。 */
export const TRANSITIONS = [
    { from: 'not_started', to: 'discussing', kind: 'auto' }, // 首次对话自动
    { from: 'discussing', to: 'implementing', kind: 'gated' },
    { from: 'implementing', to: 'verifying', kind: 'gated' },
    { from: 'verifying', to: 'completed', kind: 'gated' },
    { from: 'implementing', to: 'discussing', kind: 'gated' }, // 返工
    { from: 'verifying', to: 'discussing', kind: 'gated' }, // 返工
];
export function findTransition(from, to) {
    return TRANSITIONS.find((t) => t.from === from && t.to === to);
}
export function canTransition(from, to) {
    return findTransition(from, to) !== undefined;
}
/** 判断节点是否被阻塞（异常待人审）。 */
export function isBlocked(node) {
    return node.flags.includes('blocked');
}
function assertNotBlocked(node) {
    if (isBlocked(node)) {
        throw new Error(`节点 ${node.node_id} 处于阻塞状态，需人工解除后才能流转`);
    }
}
/** 进入目标状态后实际读到的操作细节（A + B/C/D）与默认输入。 */
export function effectiveDetail(targetState, node, global) {
    // 未开始 / 已完结没有专属细节，只返回公共 A
    if (!isActiveState(targetState)) {
        return { full_detail: global.shared_detail, enter_trigger: null };
    }
    const target = targetState;
    const slot = global[target];
    const specific = node.state_detail_overrides?.[target] ?? slot;
    return {
        full_detail: `${global.shared_detail}\n\n${specific.operation_detail}`,
        enter_trigger: specific.enter_trigger,
    };
}
/** 申请状态流转：校验合法性 + 步数熔断，返回待确认请求（gated 需弹窗）。 */
export function requestTransition(node, to, global) {
    assertNotBlocked(node);
    const t = findTransition(node.current_state, to);
    if (!t) {
        throw new Error(`非法状态迁移：${node.current_state} -> ${to}`);
    }
    assertCanStep(node); // 熔断：max_steps
    const detail = effectiveDetail(to, node, global);
    return { node_id: node.node_id, from: node.current_state, to, kind: t.kind, ...detail };
}
/** 应用已确认的流转（gated 需先经 UI 确认）。返回新节点对象，不改原对象。 */
export function applyTransition(node, to) {
    assertNotBlocked(node);
    if (!canTransition(node.current_state, to)) {
        throw new Error(`非法状态迁移：${node.current_state} -> ${to}`);
    }
    return { ...node, current_state: to, step_count: node.step_count + 1 };
}
//# sourceMappingURL=state-machine.js.map