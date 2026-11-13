import { type ToolEntry } from '../schema/tool-catalog';
import type { ToolLedgerInput } from './tool-ledger';
export interface WorkflowToolsDeps {
    repository: any;
    /** 推进 / 报备后立刻重算系统提示（工具登记后目录也要跟着变）。 */
    stateContext?: {
        refreshNow?: (sessionId: string) => Promise<string>;
    };
    /** 扩展工具表：全局一份，不分工作区。 */
    registryStore: {
        list: () => Promise<{
            entries: ToolEntry[];
            corrupt: boolean;
        }>;
        save: (entry: ToolEntry) => Promise<ToolEntry[]>;
        update: (entry: ToolEntry) => Promise<ToolEntry[]>;
    };
    /** 插件自带的工具脚本目录：扩展工具的 script 相对这里解析。 */
    /** 插件 node_modules/.bin 的绝对路径：检查器跑命令时加进 PATH，让命令用插件自带的工具、不触发 npx 下载。 */
    nodeModulesBin?: string;
    /** 检查器跑命令的执行器：测试注入用，默认是真跑。 */
    runCommand?: (input: {
        cwd: string;
        command: string;
        timeoutMs?: number;
        binDir?: string;
    }) => Promise<{
        ok: boolean;
        exit_code: number | null;
        timed_out: boolean;
        ms: number;
        tail: string;
    }>;
    /**
     * 宿主审批：登记 / 更新工具前问一次用户。
     *
     * 返回 ApprovalOutcome（allowed-once / rejected / cancelled / unavailable）。
     * 没接这个依赖、或它答不上来时，调用方按 'unavailable' 处理，即拒绝——fail-closed。
     */
    requestApproval?: (input: {
        sessionId: string;
        agent: any;
        toolName: string;
        reason: string;
    }) => Promise<string>;
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
 * 注册两个模型工具：网关调用与工具登记。
 *
 * 两个工具都只在工作流会话里出现（`when`），不污染标准模式。
 */
export declare function registerWorkflowTools(ctx: any, deps: WorkflowToolsDeps): void;
/** 推进前置：方案非空才能进实现中；清单全勾才能进验收中。工具与人工点击共用。 */
export declare function assertAdvanceAllowed(repository: any, found: any, from: string, to: string): Promise<void>;
//# sourceMappingURL=workflow-tools.d.ts.map