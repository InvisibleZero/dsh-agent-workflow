import { type ToolAliasEntry } from '../schema/tool-catalog';
import type { ToolLedgerInput } from './tool-ledger';
export interface WorkflowToolsDeps {
    repository: any;
    /** 推进 / 报备后立刻重算系统提示（别名登记后目录也要跟着变）。 */
    stateContext?: {
        refreshNow?: (sessionId: string) => Promise<string>;
    };
    /** 别名目录：按 workflow 分组持久化。 */
    aliasStore: {
        list: (workflowId: string) => Promise<{
            aliases: ToolAliasEntry[];
            corrupt: boolean;
        }>;
        add: (workflowId: string, entry: ToolAliasEntry) => Promise<ToolAliasEntry[]>;
    };
    /** 审计账：每次 tool.call / tool.add 一条。 */
    recordToolEvent?: (entry: ToolLedgerInput) => void;
    isPresetSession: (sessionId: unknown) => boolean;
    getState: (sessionId: string) => string | undefined;
    /** 状态表缺条时补一次（异步、可读盘）；门禁与工具都靠它自愈。 */
    refreshState?: (sessionId: string) => Promise<void>;
    setState: (sessionId: string, state: string) => void;
    logger: any;
    /** 记一条"等待用户同意"的推进请求；真正切换状态由用户的点击完成。 */
    requestAdvance: (input: {
        sessionId: string;
        to: string;
        reason?: string;
    }) => void;
    pendingAdvanceOf: (sessionId: string) => {
        to: string;
        reason?: string;
    } | null;
    clearPendingAdvance: (sessionId: string) => void;
    /**
     * 通知前端「这个会话变了」。
     *
     * 报备 / 撤勾都不改状态，但徽标上的 n/7 会变；不推的话聊过的会话没有轮询，
     * 只能等页面刷新才看得见——验收时会被当成「没打勾」。
     */
    notify?: (sessionId: string, reason: string) => void;
}
/** 注册门禁：只在「讨论中」拦截写操作。 */
export declare function registerWorkflowGuard(ctx: any, deps: WorkflowToolsDeps): void;
/**
 * 注册两个模型工具：网关调用与别名申请。
 *
 * 两个工具都只在工作流会话里出现（`when`），不污染标准模式。
 */
export declare function registerWorkflowTools(ctx: any, deps: WorkflowToolsDeps): void;
/** 推进前置：方案非空才能进实现中；清单全勾才能进验收中。工具与人工点击共用。 */
export declare function assertAdvanceAllowed(repository: any, found: any, from: string, to: string): Promise<void>;
//# sourceMappingURL=workflow-tools.d.ts.map