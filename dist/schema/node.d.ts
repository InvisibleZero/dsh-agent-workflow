import { z } from 'zod';
/**
 * 万能节点（组合模式）：workspace / feature / task 共用一套结构。
 * context_payload 是节点私有上下文，绝不向上级透传（防止上下文窗口爆炸）。
 */
export declare const AgentNode: z.ZodObject<{
    node_id: z.ZodString;
    parent_id: z.ZodNullable<z.ZodString>;
    /**
     * 节点显示名。可选：旧快照没有，UI 回退到 node_type。
     * （根节点的 title 与 WorkflowSnapshot.title 一致，不重复写也行。）
     */
    title: z.ZodOptional<z.ZodString>;
    /**
     * 该节点绑定的 dsh 会话 id：点节点行时打开这个会话；没有则新建一个再写回。
     * 可选：旧快照没有这个字段，第一次点击时才写入。
     */
    session_id: z.ZodOptional<z.ZodString>;
    node_type: z.ZodEnum<["workspace", "feature", "task"]>;
    current_state: z.ZodEnum<["not_started", "discussing", "implementing", "verifying", "completed"]>;
    child_ids: z.ZodArray<z.ZodString, "many">;
    context_payload: z.ZodUnknown;
    /** 横切标志（如 blocked = 异常阻塞待人审）。 */
    flags: z.ZodDefault<z.ZodArray<z.ZodEnum<["blocked"]>, "many">>;
    /**
     * 子节点对「自己当前状态」专属细节的覆盖。
     * 键只能是活跃态，值覆盖该态的专属细节（不动公共 A）。
     * 父节点（workspace 根）不写此字段。
     */
    state_detail_overrides: z.ZodOptional<z.ZodObject<{
        discussing: z.ZodOptional<z.ZodObject<{
            operation_detail: z.ZodString;
            enter_trigger: z.ZodNullable<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            operation_detail: string;
            enter_trigger: string | null;
        }, {
            operation_detail: string;
            enter_trigger: string | null;
        }>>;
        implementing: z.ZodOptional<z.ZodObject<{
            operation_detail: z.ZodString;
            enter_trigger: z.ZodNullable<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            operation_detail: string;
            enter_trigger: string | null;
        }, {
            operation_detail: string;
            enter_trigger: string | null;
        }>>;
        verifying: z.ZodOptional<z.ZodObject<{
            operation_detail: z.ZodString;
            enter_trigger: z.ZodNullable<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            operation_detail: string;
            enter_trigger: string | null;
        }, {
            operation_detail: string;
            enter_trigger: string | null;
        }>>;
    }, "strip", z.ZodTypeAny, {
        discussing?: {
            operation_detail: string;
            enter_trigger: string | null;
        } | undefined;
        implementing?: {
            operation_detail: string;
            enter_trigger: string | null;
        } | undefined;
        verifying?: {
            operation_detail: string;
            enter_trigger: string | null;
        } | undefined;
    }, {
        discussing?: {
            operation_detail: string;
            enter_trigger: string | null;
        } | undefined;
        implementing?: {
            operation_detail: string;
            enter_trigger: string | null;
        } | undefined;
        verifying?: {
            operation_detail: string;
            enter_trigger: string | null;
        } | undefined;
    }>>;
    /**
     * 节点级「附加说明」：不改全局设置，只在本节点当前状态后面追加一段。
     * 与覆盖相反——是纯增量，删掉就回到全局原样。
     * `global` 是这个节点的「全局附加」：不管当前什么状态都追加。
     */
    additional_detail: z.ZodOptional<z.ZodObject<{
        global: z.ZodOptional<z.ZodString>;
        discussing: z.ZodOptional<z.ZodString>;
        implementing: z.ZodOptional<z.ZodString>;
        verifying: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        discussing?: string | undefined;
        implementing?: string | undefined;
        verifying?: string | undefined;
        global?: string | undefined;
    }, {
        discussing?: string | undefined;
        implementing?: string | undefined;
        verifying?: string | undefined;
        global?: string | undefined;
    }>>;
    /**
     * 该节点的物理工作目录（绝对路径）：子节点创建时在父目录下新建一个同名文件夹，
     * `.workflow/` 里放两份 md（工作手册.md / 手册摘要.md）。
     * 根节点（workspace）不写此字段——它直接用 WorkflowSnapshot.working_directory。
     */
    work_dir: z.ZodOptional<z.ZodString>;
    depth: z.ZodNumber;
    max_depth: z.ZodNumber;
    step_count: z.ZodNumber;
    max_steps: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    node_id: string;
    parent_id: string | null;
    node_type: "workspace" | "feature" | "task";
    current_state: "not_started" | "discussing" | "implementing" | "verifying" | "completed";
    child_ids: string[];
    flags: "blocked"[];
    depth: number;
    max_depth: number;
    step_count: number;
    max_steps: number;
    title?: string | undefined;
    session_id?: string | undefined;
    context_payload?: unknown;
    state_detail_overrides?: {
        discussing?: {
            operation_detail: string;
            enter_trigger: string | null;
        } | undefined;
        implementing?: {
            operation_detail: string;
            enter_trigger: string | null;
        } | undefined;
        verifying?: {
            operation_detail: string;
            enter_trigger: string | null;
        } | undefined;
    } | undefined;
    additional_detail?: {
        discussing?: string | undefined;
        implementing?: string | undefined;
        verifying?: string | undefined;
        global?: string | undefined;
    } | undefined;
    work_dir?: string | undefined;
}, {
    node_id: string;
    parent_id: string | null;
    node_type: "workspace" | "feature" | "task";
    current_state: "not_started" | "discussing" | "implementing" | "verifying" | "completed";
    child_ids: string[];
    depth: number;
    max_depth: number;
    step_count: number;
    max_steps: number;
    title?: string | undefined;
    session_id?: string | undefined;
    context_payload?: unknown;
    flags?: "blocked"[] | undefined;
    state_detail_overrides?: {
        discussing?: {
            operation_detail: string;
            enter_trigger: string | null;
        } | undefined;
        implementing?: {
            operation_detail: string;
            enter_trigger: string | null;
        } | undefined;
        verifying?: {
            operation_detail: string;
            enter_trigger: string | null;
        } | undefined;
    } | undefined;
    additional_detail?: {
        discussing?: string | undefined;
        implementing?: string | undefined;
        verifying?: string | undefined;
        global?: string | undefined;
    } | undefined;
    work_dir?: string | undefined;
}>;
export type AgentNode = z.infer<typeof AgentNode>;
export declare const NODE_TYPE_LABEL: Record<AgentNode['node_type'], string>;
//# sourceMappingURL=node.d.ts.map