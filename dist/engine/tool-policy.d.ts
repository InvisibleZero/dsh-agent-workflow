import { type ToolAliasEntry, type ToolCatalogEntry, type ToolParameterSchema, type ToolState } from '../schema/tool-catalog';
export type DenyCode = 'unknown-tool' | 'stage-denied' | 'arguments-invalid' | 'arguments-override' | 'base-tool-invalid' | 'name-invalid' | 'name-duplicate' | 'description-invalid' | 'fixed-args-invalid' | 'sample-args-invalid' | 'states-invalid';
export type ToolDecision = {
    allow: true;
} | {
    allow: false;
    code: DenyCode;
    message: string;
};
export type AliasValidation = {
    ok: true;
    parameters: ToolParameterSchema;
    allowedStates: ToolState[];
} | {
    ok: false;
    code: DenyCode;
    message: string;
};
/**
 * 别名可见的参数 = 基础参数去掉固定键。
 * 固定键从 properties 里整个删掉：调用时传了它会被 additionalProperties=false 挡下，
 * 同时 decideToolCall 还会先给一个更明确的 arguments-override。
 */
export declare function deriveAliasParameters(base: ToolParameterSchema, fixedArgs: Record<string, unknown>): ToolParameterSchema;
/** 基础目录 + 本工作区别名 = 模型这次能看到的目录；基础工具不存在的脏别名直接丢弃。 */
export declare function mergeCatalog(base: ToolCatalogEntry[], aliases: ToolAliasEntry[]): ToolCatalogEntry[];
/** 参数校验：args 必须是对象，且满足目录条目的 schema。 */
export declare function validateToolArgs(schema: ToolParameterSchema, args: unknown): string | undefined;
/** 网关调用前的唯一判定点：阶段 → 固定值覆盖 → 参数。 */
export declare function decideToolCall(input: {
    state: string;
    entry: ToolCatalogEntry;
    args: unknown;
}): ToolDecision;
/** 合并固定参数：调用参数只能补剩余字段（判定已挡掉覆盖，这里固定值仍然优先）。 */
export declare function mergeArgs(fixed: Record<string, unknown> | undefined, call: unknown): Record<string, unknown>;
/** 参数摘要进审计账：截断 + 去掉换行，避免一条日志占满整个事件环。 */
export declare function summarizeArgs(args: unknown, maxChars?: number): string;
/** 别名校验：四关里除「账」以外的全部规则（类型 / 静态 / 样例 / 阶段继承）。 */
export declare function validateAliasInput(input: {
    name: unknown;
    description: unknown;
    baseTool: unknown;
    fixedArgs: unknown;
    allowedStates: unknown;
    sampleArgs: unknown;
    existingNames: string[];
}): AliasValidation;
/** 注入给模型的目录文本：名字 + 可用阶段 + 必填参数 + 一句话说明。 */
export declare function renderCatalogText(entries: ToolCatalogEntry[]): string;
//# sourceMappingURL=tool-policy.d.ts.map