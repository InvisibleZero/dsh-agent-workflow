/**
 * 工具目录的数据形状与基础工具定义。
 *
 * 为什么要有目录：模型不再直接看到 5 个原生工具，只能通过网关按名字调用；
 * 目录是「有哪些工具、各在什么阶段可用、参数长什么样」的唯一真源。
 *
 * 本文件必须保持**无运行时依赖**：客户端半的 tsconfig 也会编译 src/schema，
 * 这里不能引 zod、不能引 node 内置模块。
 */
export type ToolState = 'discussing' | 'implementing' | 'verifying' | 'completed';
export type ToolSideEffect = 'read' | 'write';
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
/** 目录条目：基础工具与别名在网关眼里是同一种东西，靠 base_tool 区分执行入口。 */
export interface ToolCatalogEntry {
    name: string;
    /** 进系统提示的一句话说明（短）；长说明放 description，只给设置页看。 */
    summary: string;
    description: string;
    /** 真正执行的基础工具名；基础条目等于自身。 */
    base_tool: string;
    /** 预置参数：调用参数只能补剩余字段，不能覆盖这里的键。 */
    fixed_args: Record<string, unknown>;
    parameters: ToolParameterSchema;
    allowed_states: ToolState[];
    side_effect: ToolSideEffect;
    /** 别名条目标记为 true；基础条目省略。 */
    alias?: boolean;
    version?: number;
    created_at?: string;
}
/** 别名条目：持久化在 <baseDir>/tool-aliases.json，按 workflow_id 分组。 */
export interface ToolAliasEntry {
    tool_id: string;
    name: string;
    description: string;
    base_tool: string;
    fixed_args: Record<string, unknown>;
    allowed_states: ToolState[];
    created_at: string;
    version: number;
}
export declare const ALL_STATES: ToolState[];
/**
 * 五个基础工具：参数 schema 与原 tools.register 的定义保持一致，
 * 只把描述压缩到注入预算内（关键规则一条不丢）。
 */
export declare const BASE_TOOLS: ToolCatalogEntry[];
/** 基础工具名集合：别名只能挂在这五个上，不能挂别名（禁止链式）。 */
export declare const BASE_TOOL_NAMES: string[];
//# sourceMappingURL=tool-catalog.d.ts.map