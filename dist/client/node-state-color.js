// @ts-nocheck
/**
 * 四态状态色 + 流程顺序（徽标 / 侧栏状态点 / 设置页流程条 共用，避免三处各存一份）。
 *
 * 配色约定（对齐 Jira/GitHub 惯例）：讨论中=黄、实现中=蓝、验收中=紫、已完结=绿。
 * - 「实现中」用宿主实打实的蓝色 token（`brand-primary-new-colorprimary-new-color`），带 `#4176e6` 兜底；
 * - 「验收中」主题里没有紫色 token，直接硬编码 violet-500（#8b5cf6），深浅色下都可读。
 */
export const NODE_STATE_COLOR = {
    discussing: 'var(--dsw-alias-state-warn-primary)',
    implementing: 'var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6)',
    verifying: '#8b5cf6',
    completed: 'var(--dsw-alias-state-success-primary)',
};
/** 设置页流程条用的顺序（含中文标签）。 */
export const WORKFLOW_FLOW = [
    { state: 'discussing', label: '讨论中' },
    { state: 'implementing', label: '实现中' },
    { state: 'verifying', label: '验收中' },
    { state: 'completed', label: '已完结' },
];
//# sourceMappingURL=node-state-color.js.map