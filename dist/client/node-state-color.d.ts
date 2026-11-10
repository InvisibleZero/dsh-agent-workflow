/**
 * 五态状态色 + 流程顺序（徽标 / 侧栏状态点 / 设置页流程条 共用，避免三处各存一份）。
 *
 * 注意：`--dsw-alias-brand-primary` 是对比色（浅色近黑、深色近白），不是蓝色强调色；
 * 「验收中」用宿主实打实的蓝色 token，并带 `#4176e6` 兜底。
 */
export declare const NODE_STATE_COLOR: Record<string, string>;
/** 设置页流程条用的顺序（含中文标签）。 */
export declare const WORKFLOW_FLOW: Array<{
    state: string;
    label: string;
}>;
//# sourceMappingURL=node-state-color.d.ts.map