"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORKFLOW_FLOW = exports.NODE_STATE_COLOR = void 0;
// @ts-nocheck
/**
 * 五态状态色 + 流程顺序（徽标 / 侧栏状态点 / 设置页流程条 共用，避免三处各存一份）。
 *
 * 注意：`--dsw-alias-brand-primary` 是对比色（浅色近黑、深色近白），不是蓝色强调色；
 * 「验收中」用宿主实打实的蓝色 token，并带 `#4176e6` 兜底。
 */
exports.NODE_STATE_COLOR = {
    not_started: 'var(--dsw-alias-state-idle-primary)',
    discussing: 'var(--dsw-alias-state-warn-primary)',
    implementing: 'var(--dsw-alias-brand-primary)',
    verifying: 'var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6)',
    completed: 'var(--dsw-alias-state-success-primary)',
};
/** 设置页流程条用的顺序（含中文标签）。 */
exports.WORKFLOW_FLOW = [
    { state: 'not_started', label: '未开始' },
    { state: 'discussing', label: '讨论中' },
    { state: 'implementing', label: '实现中' },
    { state: 'verifying', label: '验收中' },
    { state: 'completed', label: '已完结' },
];
//# sourceMappingURL=node-state-color.js.map