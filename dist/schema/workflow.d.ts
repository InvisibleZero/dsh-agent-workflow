import { z } from 'zod';
/** 全局操作细节 = A（公共）+ B/C/D（三态专属），只在设置里改。 */
export declare const GlobalOperationDetail: z.ZodObject<{
    shared_detail: z.ZodString;
    discussing: z.ZodObject<{
        operation_detail: z.ZodString;
        enter_trigger: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        operation_detail: string;
        enter_trigger: string | null;
    }, {
        operation_detail: string;
        enter_trigger: string | null;
    }>;
    implementing: z.ZodObject<{
        operation_detail: z.ZodString;
        enter_trigger: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        operation_detail: string;
        enter_trigger: string | null;
    }, {
        operation_detail: string;
        enter_trigger: string | null;
    }>;
    verifying: z.ZodObject<{
        operation_detail: z.ZodString;
        enter_trigger: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        operation_detail: string;
        enter_trigger: string | null;
    }, {
        operation_detail: string;
        enter_trigger: string | null;
    }>;
}, "strip", z.ZodTypeAny, {
    discussing: {
        operation_detail: string;
        enter_trigger: string | null;
    };
    implementing: {
        operation_detail: string;
        enter_trigger: string | null;
    };
    verifying: {
        operation_detail: string;
        enter_trigger: string | null;
    };
    shared_detail: string;
}, {
    discussing: {
        operation_detail: string;
        enter_trigger: string | null;
    };
    implementing: {
        operation_detail: string;
        enter_trigger: string | null;
    };
    verifying: {
        operation_detail: string;
        enter_trigger: string | null;
    };
    shared_detail: string;
}>;
export type GlobalOperationDetail = z.infer<typeof GlobalOperationDetail>;
/** 父节点状态聚合方式。 */
export declare const AggregationMode: z.ZodEnum<["manual", "all_complete", "any_active"]>;
export type AggregationMode = z.infer<typeof AggregationMode>;
/** 全局设置（跨工作区默认）。 */
export declare const WorkflowSettings: z.ZodObject<{
    global_operation_detail: z.ZodObject<{
        shared_detail: z.ZodString;
        discussing: z.ZodObject<{
            operation_detail: z.ZodString;
            enter_trigger: z.ZodNullable<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            operation_detail: string;
            enter_trigger: string | null;
        }, {
            operation_detail: string;
            enter_trigger: string | null;
        }>;
        implementing: z.ZodObject<{
            operation_detail: z.ZodString;
            enter_trigger: z.ZodNullable<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            operation_detail: string;
            enter_trigger: string | null;
        }, {
            operation_detail: string;
            enter_trigger: string | null;
        }>;
        verifying: z.ZodObject<{
            operation_detail: z.ZodString;
            enter_trigger: z.ZodNullable<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            operation_detail: string;
            enter_trigger: string | null;
        }, {
            operation_detail: string;
            enter_trigger: string | null;
        }>;
    }, "strip", z.ZodTypeAny, {
        discussing: {
            operation_detail: string;
            enter_trigger: string | null;
        };
        implementing: {
            operation_detail: string;
            enter_trigger: string | null;
        };
        verifying: {
            operation_detail: string;
            enter_trigger: string | null;
        };
        shared_detail: string;
    }, {
        discussing: {
            operation_detail: string;
            enter_trigger: string | null;
        };
        implementing: {
            operation_detail: string;
            enter_trigger: string | null;
        };
        verifying: {
            operation_detail: string;
            enter_trigger: string | null;
        };
        shared_detail: string;
    }>;
    default_max_depth: z.ZodNumber;
    default_max_steps: z.ZodNumber;
    aggregation_mode: z.ZodEnum<["manual", "all_complete", "any_active"]>;
}, "strip", z.ZodTypeAny, {
    global_operation_detail: {
        discussing: {
            operation_detail: string;
            enter_trigger: string | null;
        };
        implementing: {
            operation_detail: string;
            enter_trigger: string | null;
        };
        verifying: {
            operation_detail: string;
            enter_trigger: string | null;
        };
        shared_detail: string;
    };
    default_max_depth: number;
    default_max_steps: number;
    aggregation_mode: "manual" | "all_complete" | "any_active";
}, {
    global_operation_detail: {
        discussing: {
            operation_detail: string;
            enter_trigger: string | null;
        };
        implementing: {
            operation_detail: string;
            enter_trigger: string | null;
        };
        verifying: {
            operation_detail: string;
            enter_trigger: string | null;
        };
        shared_detail: string;
    };
    default_max_depth: number;
    default_max_steps: number;
    aggregation_mode: "manual" | "all_complete" | "any_active";
}>;
export type WorkflowSettings = z.infer<typeof WorkflowSettings>;
/** 持久化单元：一个 workflow 工作区的全量快照（根节点 parent_id 为 null）。 */
export declare const WorkflowSnapshot: z.ZodObject<{
    version: z.ZodLiteral<1>;
    workspace_id: z.ZodString;
    title: z.ZodString;
    /** workflow 对应的本地工作目录（用户创建时选的那个文件夹）。可选，旧快照没有。 */
    working_directory: z.ZodOptional<z.ZodString>;
    /** 是否置顶（只影响侧栏排序）。可选，旧快照没有 = 未置顶。 */
    pinned: z.ZodOptional<z.ZodBoolean>;
    settings: z.ZodObject<{
        global_operation_detail: z.ZodObject<{
            shared_detail: z.ZodString;
            discussing: z.ZodObject<{
                operation_detail: z.ZodString;
                enter_trigger: z.ZodNullable<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                operation_detail: string;
                enter_trigger: string | null;
            }, {
                operation_detail: string;
                enter_trigger: string | null;
            }>;
            implementing: z.ZodObject<{
                operation_detail: z.ZodString;
                enter_trigger: z.ZodNullable<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                operation_detail: string;
                enter_trigger: string | null;
            }, {
                operation_detail: string;
                enter_trigger: string | null;
            }>;
            verifying: z.ZodObject<{
                operation_detail: z.ZodString;
                enter_trigger: z.ZodNullable<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                operation_detail: string;
                enter_trigger: string | null;
            }, {
                operation_detail: string;
                enter_trigger: string | null;
            }>;
        }, "strip", z.ZodTypeAny, {
            discussing: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            implementing: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            verifying: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            shared_detail: string;
        }, {
            discussing: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            implementing: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            verifying: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            shared_detail: string;
        }>;
        default_max_depth: z.ZodNumber;
        default_max_steps: z.ZodNumber;
        aggregation_mode: z.ZodEnum<["manual", "all_complete", "any_active"]>;
    }, "strip", z.ZodTypeAny, {
        global_operation_detail: {
            discussing: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            implementing: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            verifying: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            shared_detail: string;
        };
        default_max_depth: number;
        default_max_steps: number;
        aggregation_mode: "manual" | "all_complete" | "any_active";
    }, {
        global_operation_detail: {
            discussing: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            implementing: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            verifying: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            shared_detail: string;
        };
        default_max_depth: number;
        default_max_steps: number;
        aggregation_mode: "manual" | "all_complete" | "any_active";
    }>;
    nodes: z.ZodArray<z.ZodObject<{
        node_id: z.ZodString;
        parent_id: z.ZodNullable<z.ZodString>;
        title: z.ZodOptional<z.ZodString>;
        session_id: z.ZodOptional<z.ZodString>;
        node_type: z.ZodEnum<["workspace", "feature", "task"]>;
        current_state: z.ZodEnum<["not_started", "discussing", "implementing", "verifying", "completed"]>;
        child_ids: z.ZodArray<z.ZodString, "many">;
        context_payload: z.ZodUnknown;
        flags: z.ZodDefault<z.ZodArray<z.ZodEnum<["blocked"]>, "many">>;
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
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    title: string;
    version: 1;
    workspace_id: string;
    settings: {
        global_operation_detail: {
            discussing: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            implementing: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            verifying: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            shared_detail: string;
        };
        default_max_depth: number;
        default_max_steps: number;
        aggregation_mode: "manual" | "all_complete" | "any_active";
    };
    nodes: {
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
    }[];
    working_directory?: string | undefined;
    pinned?: boolean | undefined;
}, {
    title: string;
    version: 1;
    workspace_id: string;
    settings: {
        global_operation_detail: {
            discussing: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            implementing: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            verifying: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            shared_detail: string;
        };
        default_max_depth: number;
        default_max_steps: number;
        aggregation_mode: "manual" | "all_complete" | "any_active";
    };
    nodes: {
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
    }[];
    working_directory?: string | undefined;
    pinned?: boolean | undefined;
}>;
export type WorkflowSnapshot = z.infer<typeof WorkflowSnapshot>;
/**
 * 内置通用示例预设（开源友好，不携带任何私有约定）。
 * 使用者可在设置里自行替换为符合自己场景的操作细节。
 */
export declare const DEFAULT_GLOBAL_OPERATION_DETAIL: GlobalOperationDetail;
export declare const DEFAULT_SETTINGS: WorkflowSettings;
//# sourceMappingURL=workflow.d.ts.map