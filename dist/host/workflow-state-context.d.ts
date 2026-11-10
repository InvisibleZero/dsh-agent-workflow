/**
 * 注册 workflow 状态上下文。
 * @returns 调试用的 peek(sessionId)：强制算一次并返回将要注入的文本。
 */
export declare function registerWorkflowStateContext(ctx: any, repository: any): {
    peek: (sessionId: string) => Promise<string>;
};
//# sourceMappingURL=workflow-state-context.d.ts.map