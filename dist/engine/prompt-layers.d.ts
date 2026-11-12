export interface PromptLayerSpec {
    /** 层名：同时用作系统提示里 context 名后缀（workflow:<name>）。 */
    name: string;
    /** 挂载顺序：越小越靠前（贴系统提示头部）。 */
    order: number;
    /** 硬层：永不裁；挤不下就整体报错，不允许"悄悄少一条硬规则"。 */
    hard: boolean;
    /** 裁切优先级：数字越大越先被丢。硬层的值不参与排序。 */
    priority: number;
}
/**
 * 八层。顺序 = 用户认可的那条：硬规则 → 全局细节 → 状态细节 → 节点附加 → 约束 → 手册引导 → 会话手册。
 *
 * 会话手册标记为硬层，但它**自带降级**（先丢已勾项，再砍方案后半），
 * 所以即使它很大会先在自身内部瘦身，而不是整层消失。
 */
export declare const PROMPT_LAYER_SPECS: PromptLayerSpec[];
/** 标签表这一层的预算：标签本来就该短，超了说明表该合并了。 */
export declare const TAG_LAYER_BUDGET_BYTES = 600;
/** 会话手册这一层自己的预算：超了先丢已勾项，再砍方案后半（见 workflow-state-context 的渲染）。 */
export declare const SESSION_MANUAL_BUDGET_BYTES = 4600;
export interface PromptLayerInput {
    name: string;
    text: string;
}
export interface PromptLayerState {
    name: string;
    order: number;
    /** 被丢掉时为空串（挂载的 context 仍然在，只是不出内容）。 */
    text: string;
    bytes: number;
    dropped: boolean;
}
export interface PromptAssembly {
    /** 按 order 升序；被丢的层也在里面，text 为空串。 */
    layers: PromptLayerState[];
    keptBytes: number;
    dropped: Array<{
        name: string;
        bytes: number;
        reason: string;
    }>;
    /** 有任何一层因为超预算被丢掉。 */
    truncated: boolean;
}
/**
 * 按预算装配各层。
 *
 * 规则：硬层全部保留（合计超预算直接抛错，属于配置问题，不能静默）；
 * 软层按 priority 从高到低丢，丢到装得下就停。
 */
export declare function assemblePromptLayers(input: PromptLayerInput[], budgetBytes: number): PromptAssembly;
/** 会话手册拆出来的三块：方案全文、未勾条目、已勾条数。 */
export interface SessionManualParts {
    plan: string;
    unchecked: string[];
    checkedCount: number;
    totalItems: number;
    hasPlan: boolean;
}
/**
 * 按小节取会话手册用于注入的部分。
 *
 * 不再取"尾部 2000 字"：尾部保住的是最新勾选，砍掉的却是方案开头（目标与验收）——
 * 实现中恰恰是开头在指导干活。
 */
export declare function pickSessionManualParts(manual: string): SessionManualParts;
//# sourceMappingURL=prompt-layers.d.ts.map