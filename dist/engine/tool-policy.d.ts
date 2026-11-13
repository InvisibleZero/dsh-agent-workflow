import { type ToolEntry, type ToolKind } from '../schema/tool-catalog';
/** 每类工具的条数上限：只卡「验收中」这一档，两类各自独立计数。 */
export declare const TOOL_LIMIT_BY_KIND: Record<ToolKind, number>;
/** 出厂工具名（基础 + 扩展）：登记工具不能重名（挡住"覆盖出厂工具"这条路）。 */
export declare const FACTORY_TOOL_NAMES: string[];
/** 完整出厂目录：5 个基础工具 + 5 个扩展工具，不读盘。 */
export declare const FACTORY_TOOLS: ToolEntry[];
export type DenyCode = 'unknown-tool' | 'stage-denied' | 'arguments-invalid' | 'name-invalid' | 'name-duplicate' | 'description-invalid' | 'sample-args-invalid' | 'states-invalid' | 'run-invalid' | 'effect-invalid' | 'script-invalid' | 'quota-exceeded';
export type ToolDecision = {
    allow: true;
} | {
    allow: false;
    code: DenyCode;
    message: string;
};
export type RegistrationValidation = {
    ok: true;
    entry: ToolEntry;
} | {
    ok: false;
    code: DenyCode;
    message: string;
};
/** 内置 + 登记 = 完整目录；与基础工具同名的登记条目直接丢掉（登记时已挡，这里兜底）。 */
export declare function mergeCatalog(base: ToolEntry[], registered: ToolEntry[]): ToolEntry[];
/** 当前状态能看到的工具：目录按 allowed_states 过滤，不做任何分组。 */
export declare function visibleTools(entries: ToolEntry[], state: string): ToolEntry[];
/** 按 kind 统计某状态下的可见条数：两类配额各自独立，就是靠这个计数。 */
export declare function countVisibleByKind(entries: ToolEntry[], state: string): Record<ToolKind, number>;
/** 网关调用前的唯一判定点：阶段 → 参数。 */
export declare function decideToolCall(input: {
    state: string;
    entry: ToolEntry;
    args: unknown;
}): ToolDecision;
/** 参数摘要进审计账：截断 + 去掉换行，避免一条日志占满整个事件环。 */
export declare function summarizeArgs(args: unknown, maxChars?: number): string;
/**
 * 登记校验：新增与更新共用，产物一律是扩展工具。
 *
 * 和调用的区别：登记是「造工具」，所以校验 run / effect / 配额 / 样例参数；
 * 调用只校验「这个状态能不能用、参数对不对」。
 *
 * parameters：基础工具必填，扩展工具可选（不传就是宽松 schema）。
 * 配额：只卡验收中，且按 kind 分别计数——两类工具各自的上限互不挤占。
 */
export declare function validateToolRegistration(input: {
    name: unknown;
    description: unknown;
    run: unknown;
    effect: unknown;
    allowedStates: unknown;
    parameters: unknown;
    parametersGiven: boolean;
    sampleArgs: unknown;
    existingNames: string[];
    verifyingCounts: Record<ToolKind, number>;
    mode: 'create' | 'update';
}): RegistrationValidation;
/** 描述第一句：注入只留这一句，长描述留给设置页。 */
export declare function summarizeDescription(description: string, maxChars?: number): string;
/**
 * 注入给模型的目录文本：当前状态能看到的工具，一张表，不分段、不标类别。
 * 名字 + 可用阶段 + 必填参数 + 一句话说明。
 */
export declare function renderCatalogText(entries: ToolEntry[], state: string): string;
//# sourceMappingURL=tool-policy.d.ts.map