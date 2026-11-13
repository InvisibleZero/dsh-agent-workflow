/**
 * 工具目录的数据形状与基础工具定义。
 *
 * 为什么要有目录：模型不再直接看到 5 个原生工具，只能通过网关按名字调用；
 * 目录是「有哪些工具、各在什么阶段可用、参数长什么样」的唯一真源。
 *
 * 本文件必须保持**无运行时依赖**：客户端半的 tsconfig 也会编译 src/schema，
 * 这里不能引 zod、不能引 node 内置模块。
 *
 * 2026-11-13 起工具集分两类：基础工具（代码定义）与扩展工具（登记而来，执行体只能是脚本）。
 * 两类同型（ToolEntry），靠 kind 区分；分类名只在这里定义，别处一律读标签表。
 */
export type ToolState = 'discussing' | 'implementing' | 'verifying' | 'completed';
/** 工具分类：定义在 tool-kind.ts（客户端只引那一份），这里 re-export 方便宿主侧使用。 */
export { TOOL_KIND, TOOL_KIND_LABEL } from './tool-kind';
export type { ToolKind } from './tool-kind';
import { type ToolKind } from './tool-kind';
/**
 * 扩展工具的执行方式：交给哪个内置检查器。
 * checker 必须是 `engine/checkers` 注册表里的 id——插件不执行外部脚本。
 */
export type ToolRun = {
    kind: 'checker';
    checker: string;
};
/** 副作用分级：审批界面按它排序，exec 最危险。 */
export type ToolEffect = 'read-state' | 'write-state' | 'exec';
/** 参数值的最小 JSON Schema 子集：够校验五类工具的参数，不引入第三方校验器。 */
export interface ToolValueSchema {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description?: string;
    enum?: string[];
    /** 多类型字段（例：验收项既收 '3' 也收 3）：任一支通过即可。 */
    anyOf?: ToolValueSchema[];
    items?: ToolValueSchema;
    properties?: Record<string, ToolValueSchema>;
    required?: string[];
    additionalProperties?: boolean;
}
export interface ToolParameterSchema {
    type: 'object';
    properties: Record<string, ToolValueSchema>;
    required?: string[];
    additionalProperties?: boolean;
}
/**
 * 一条工具。
 *
 * 基础工具由代码定义、不可被登记覆盖；扩展工具带 run / version / created_at。
 * parameters 是给模型看的 JSON Schema：基础工具必填，扩展工具可以是宽松 schema。
 */
export interface ToolEntry {
    name: string;
    description: string;
    kind: ToolKind;
    /** 扩展工具必须带；基础工具没有（由 name 分派到内置 handler）。 */
    run?: ToolRun;
    allowed_states: ToolState[];
    effect: ToolEffect;
    parameters: ToolParameterSchema;
    version?: number;
    created_at?: string;
}
export declare const ALL_STATES: ToolState[];
/**
 * 五个基础工具：name 就是分派键，parameters 是给模型的参数 schema。
 * description 的第一句会被注入系统提示（见 tool-policy 的 summarizeDescription），
 * 所以第一句必须能独立说明「什么时候用」。
 */
export declare const BASE_TOOLS: ToolEntry[];
/**
 * 出厂扩展工具：全部指向 `src/engine/checkers` 里的检查器，随代码分发。
 *
 * 为什么在代码里而不是 JSON：checker 的实现也在代码里，定义和实现分开两处迟早对不上。
 * 开发期仍可用 `workflow_tool_add` 往 `tools/tool-registry.json` 加额外工具，那是增量，不在这里。
 */
export declare const EXTENSION_TOOLS: ToolEntry[];
//# sourceMappingURL=tool-catalog.d.ts.map