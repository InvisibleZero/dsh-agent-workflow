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
    current_state: z.ZodEnum<["discussing", "implementing", "verifying", "completed"]>;
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
     * 验收七项的报备与标记（「验收中」专用）。
     *
     * 可选：旧快照没有这个字段 = 七项都没处理；读侧用 pickVerification 收口，不做数据迁移。
     * 标记只能由报备落（pass → ✓，deferred → ？），取消勾会把条目清回 pending。
     */
    verification: z.ZodOptional<z.ZodObject<{
        round: z.ZodNumber;
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodNumber;
            mark: z.ZodEnum<["pending", "pass", "deferred"]>;
            report: z.ZodNullable<z.ZodObject<{
                round: z.ZodNumber;
                result: z.ZodEnum<["pass", "deferred"]>;
                summary: z.ZodString;
                anchors: z.ZodArray<z.ZodObject<{
                    file: z.ZodString;
                    line: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    file: string;
                    line?: number | undefined;
                }, {
                    file: string;
                    line?: number | undefined;
                }>, "many">;
                command: z.ZodOptional<z.ZodString>;
                findings: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    location: z.ZodString;
                    problem: z.ZodString;
                    why_not_fixed: z.ZodString;
                    impact: z.ZodString;
                }, "strip", z.ZodTypeAny, {
                    location: string;
                    problem: string;
                    why_not_fixed: string;
                    impact: string;
                }, {
                    location: string;
                    problem: string;
                    why_not_fixed: string;
                    impact: string;
                }>, "many">>;
                at: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                at: string;
                round: number;
                result: "pass" | "deferred";
                summary: string;
                anchors: {
                    file: string;
                    line?: number | undefined;
                }[];
                command?: string | undefined;
                findings?: {
                    location: string;
                    problem: string;
                    why_not_fixed: string;
                    impact: string;
                }[] | undefined;
            }, {
                at: string;
                round: number;
                result: "pass" | "deferred";
                summary: string;
                anchors: {
                    file: string;
                    line?: number | undefined;
                }[];
                command?: string | undefined;
                findings?: {
                    location: string;
                    problem: string;
                    why_not_fixed: string;
                    impact: string;
                }[] | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            id: number;
            mark: "pending" | "pass" | "deferred";
            report: {
                at: string;
                round: number;
                result: "pass" | "deferred";
                summary: string;
                anchors: {
                    file: string;
                    line?: number | undefined;
                }[];
                command?: string | undefined;
                findings?: {
                    location: string;
                    problem: string;
                    why_not_fixed: string;
                    impact: string;
                }[] | undefined;
            } | null;
        }, {
            id: number;
            mark: "pending" | "pass" | "deferred";
            report: {
                at: string;
                round: number;
                result: "pass" | "deferred";
                summary: string;
                anchors: {
                    file: string;
                    line?: number | undefined;
                }[];
                command?: string | undefined;
                findings?: {
                    location: string;
                    problem: string;
                    why_not_fixed: string;
                    impact: string;
                }[] | undefined;
            } | null;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        round: number;
        items: {
            id: number;
            mark: "pending" | "pass" | "deferred";
            report: {
                at: string;
                round: number;
                result: "pass" | "deferred";
                summary: string;
                anchors: {
                    file: string;
                    line?: number | undefined;
                }[];
                command?: string | undefined;
                findings?: {
                    location: string;
                    problem: string;
                    why_not_fixed: string;
                    impact: string;
                }[] | undefined;
            } | null;
        }[];
    }, {
        round: number;
        items: {
            id: number;
            mark: "pending" | "pass" | "deferred";
            report: {
                at: string;
                round: number;
                result: "pass" | "deferred";
                summary: string;
                anchors: {
                    file: string;
                    line?: number | undefined;
                }[];
                command?: string | undefined;
                findings?: {
                    location: string;
                    problem: string;
                    why_not_fixed: string;
                    impact: string;
                }[] | undefined;
            } | null;
        }[];
    }>>;
    /**
     * 状态迁移时间线：每次推进追加一条 { at, from, to }。
     * 可选，旧快照没有。
     */
    history: z.ZodOptional<z.ZodArray<z.ZodObject<{
        at: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        /** 谁触发的这次迁移：human（点胶囊）/ agent-request（模型请求并经人同意）/ agent（返工等）。 */
        by: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        at: string;
        from: string;
        to: string;
        by?: string | undefined;
    }, {
        at: string;
        from: string;
        to: string;
        by?: string | undefined;
    }>, "many">>;
    depth: z.ZodNumber;
    max_depth: z.ZodNumber;
    step_count: z.ZodNumber;
    max_steps: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    node_id: string;
    parent_id: string | null;
    node_type: "workspace" | "feature" | "task";
    current_state: "discussing" | "implementing" | "verifying" | "completed";
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
    verification?: {
        round: number;
        items: {
            id: number;
            mark: "pending" | "pass" | "deferred";
            report: {
                at: string;
                round: number;
                result: "pass" | "deferred";
                summary: string;
                anchors: {
                    file: string;
                    line?: number | undefined;
                }[];
                command?: string | undefined;
                findings?: {
                    location: string;
                    problem: string;
                    why_not_fixed: string;
                    impact: string;
                }[] | undefined;
            } | null;
        }[];
    } | undefined;
    history?: {
        at: string;
        from: string;
        to: string;
        by?: string | undefined;
    }[] | undefined;
}, {
    node_id: string;
    parent_id: string | null;
    node_type: "workspace" | "feature" | "task";
    current_state: "discussing" | "implementing" | "verifying" | "completed";
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
    verification?: {
        round: number;
        items: {
            id: number;
            mark: "pending" | "pass" | "deferred";
            report: {
                at: string;
                round: number;
                result: "pass" | "deferred";
                summary: string;
                anchors: {
                    file: string;
                    line?: number | undefined;
                }[];
                command?: string | undefined;
                findings?: {
                    location: string;
                    problem: string;
                    why_not_fixed: string;
                    impact: string;
                }[] | undefined;
            } | null;
        }[];
    } | undefined;
    history?: {
        at: string;
        from: string;
        to: string;
        by?: string | undefined;
    }[] | undefined;
}>;
export type AgentNode = z.infer<typeof AgentNode>;
//# sourceMappingURL=node.d.ts.map