import { z } from 'zod';
/** 硬规则：插件层强制的阶段约束，不随「操作细节」一起编辑；可覆盖但需警告。 */
export declare const HardRules: z.ZodObject<{
    discussing: z.ZodOptional<z.ZodString>;
    implementing: z.ZodOptional<z.ZodString>;
    verifying: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    discussing?: string | undefined;
    implementing?: string | undefined;
    verifying?: string | undefined;
}, {
    discussing?: string | undefined;
    implementing?: string | undefined;
    verifying?: string | undefined;
}>;
export type HardRules = z.infer<typeof HardRules>;
/** 全局操作细节 = A（公共）+ B/C/D（三态专属）+ 硬规则覆盖，只在设置里改。 */
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
    /** 硬规则覆盖值；缺省 = 用 DEFAULT_HARD_RULES。 */
    hard_rules: z.ZodOptional<z.ZodObject<{
        discussing: z.ZodOptional<z.ZodString>;
        implementing: z.ZodOptional<z.ZodString>;
        verifying: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        discussing?: string | undefined;
        implementing?: string | undefined;
        verifying?: string | undefined;
    }, {
        discussing?: string | undefined;
        implementing?: string | undefined;
        verifying?: string | undefined;
    }>>;
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
    hard_rules?: {
        discussing?: string | undefined;
        implementing?: string | undefined;
        verifying?: string | undefined;
    } | undefined;
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
    hard_rules?: {
        discussing?: string | undefined;
        implementing?: string | undefined;
        verifying?: string | undefined;
    } | undefined;
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
        /** 硬规则覆盖值；缺省 = 用 DEFAULT_HARD_RULES。 */
        hard_rules: z.ZodOptional<z.ZodObject<{
            discussing: z.ZodOptional<z.ZodString>;
            implementing: z.ZodOptional<z.ZodString>;
            verifying: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            discussing?: string | undefined;
            implementing?: string | undefined;
            verifying?: string | undefined;
        }, {
            discussing?: string | undefined;
            implementing?: string | undefined;
            verifying?: string | undefined;
        }>>;
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
        hard_rules?: {
            discussing?: string | undefined;
            implementing?: string | undefined;
            verifying?: string | undefined;
        } | undefined;
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
        hard_rules?: {
            discussing?: string | undefined;
            implementing?: string | undefined;
            verifying?: string | undefined;
        } | undefined;
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
        hard_rules?: {
            discussing?: string | undefined;
            implementing?: string | undefined;
            verifying?: string | undefined;
        } | undefined;
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
        hard_rules?: {
            discussing?: string | undefined;
            implementing?: string | undefined;
            verifying?: string | undefined;
        } | undefined;
    };
    default_max_depth: number;
    default_max_steps: number;
    aggregation_mode: "manual" | "all_complete" | "any_active";
}>;
export type WorkflowSettings = z.infer<typeof WorkflowSettings>;
/** 持久化单元：一个 workflow 工作区的全量快照（根节点 parent_id 为 null）。 */
export declare const WorkflowSnapshot: z.ZodObject<{
    version: z.ZodLiteral<2>;
    workspace_id: z.ZodString;
    title: z.ZodString;
    /** workflow 对应的本地工作目录（用户创建时选的那个文件夹）。可选，旧快照没有。 */
    working_directory: z.ZodOptional<z.ZodString>;
    /**
     * 对应的宿主「目录工作区」id。workflow 工作区本身就是这个目录工作区，
     * 只是渲染走类型插件；旧快照没有该字段，靠 working_directory 反查。
     */
    host_workspace_id: z.ZodOptional<z.ZodString>;
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
            /** 硬规则覆盖值；缺省 = 用 DEFAULT_HARD_RULES。 */
            hard_rules: z.ZodOptional<z.ZodObject<{
                discussing: z.ZodOptional<z.ZodString>;
                implementing: z.ZodOptional<z.ZodString>;
                verifying: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                discussing?: string | undefined;
                implementing?: string | undefined;
                verifying?: string | undefined;
            }, {
                discussing?: string | undefined;
                implementing?: string | undefined;
                verifying?: string | undefined;
            }>>;
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
            hard_rules?: {
                discussing?: string | undefined;
                implementing?: string | undefined;
                verifying?: string | undefined;
            } | undefined;
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
            hard_rules?: {
                discussing?: string | undefined;
                implementing?: string | undefined;
                verifying?: string | undefined;
            } | undefined;
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
            hard_rules?: {
                discussing?: string | undefined;
                implementing?: string | undefined;
                verifying?: string | undefined;
            } | undefined;
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
            hard_rules?: {
                discussing?: string | undefined;
                implementing?: string | undefined;
                verifying?: string | undefined;
            } | undefined;
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
        current_state: z.ZodEnum<["discussing", "implementing", "verifying", "completed"]>;
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
        history: z.ZodOptional<z.ZodArray<z.ZodObject<{
            at: z.ZodString;
            from: z.ZodString;
            to: z.ZodString;
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
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    title: string;
    version: 2;
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
            hard_rules?: {
                discussing?: string | undefined;
                implementing?: string | undefined;
                verifying?: string | undefined;
            } | undefined;
        };
        default_max_depth: number;
        default_max_steps: number;
        aggregation_mode: "manual" | "all_complete" | "any_active";
    };
    nodes: {
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
    }[];
    working_directory?: string | undefined;
    host_workspace_id?: string | undefined;
    pinned?: boolean | undefined;
}, {
    title: string;
    version: 2;
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
            hard_rules?: {
                discussing?: string | undefined;
                implementing?: string | undefined;
                verifying?: string | undefined;
            } | undefined;
        };
        default_max_depth: number;
        default_max_steps: number;
        aggregation_mode: "manual" | "all_complete" | "any_active";
    };
    nodes: {
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
    }[];
    working_directory?: string | undefined;
    host_workspace_id?: string | undefined;
    pinned?: boolean | undefined;
}>;
export type WorkflowSnapshot = z.infer<typeof WorkflowSnapshot>;
/**
 * 内置预设（默认 A/B/C/D）：工作流方法论——
 * 结论先行 + 讨论中三段式方案 + 实现中按「实施顺序」逐层落地 + 验收检查表。
 * 使用者可在设置里替换成自己的操作细节；这份只是出厂默认。
 */
export declare const DEFAULT_GLOBAL_OPERATION_DETAIL: GlobalOperationDetail;
export declare const DEFAULT_SETTINGS: WorkflowSettings;
//# sourceMappingURL=workflow.d.ts.map