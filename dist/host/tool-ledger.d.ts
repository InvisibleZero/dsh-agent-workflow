/**
 * 工具审计账：每次 tool.call / tool.add 各记一条，`/tools` 路由读最近 N 条。
 *
 * 只落进程内环形缓冲（和 event-log 一样）：设置页展示「最近调用与拒绝」够用，
 * 真要长期留存再谈落盘；这里先保证「拒了没拒、为什么拒」查得到。
 */
export interface ToolLedgerEntry {
    at: string;
    kind: 'call' | 'add';
    session: string;
    workflow_id?: string;
    name: string;
    base_tool?: string;
    decision: 'allow' | 'deny' | 'error';
    /** 拒绝分类或执行失败（unknown-tool / stage-denied / arguments-invalid / …）。 */
    code?: string;
    state?: string;
    args?: string;
    ms?: number;
    message?: string;
}
export type ToolLedgerInput = Omit<ToolLedgerEntry, 'at'>;
export declare function recordToolEvent(input: ToolLedgerInput): void;
export declare function recentToolEvents(limit?: number): ToolLedgerEntry[];
export declare function clearToolEvents(): void;
//# sourceMappingURL=tool-ledger.d.ts.map