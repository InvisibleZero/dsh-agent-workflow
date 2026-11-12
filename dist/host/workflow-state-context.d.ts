import { truncateToBytes } from '../engine/text-budget';
export { truncateToBytes };
/**
 * 注册 workflow 状态上下文。
 * @returns 调试用的 peek(sessionId)：强制算一次并返回合并后的文本。
 */
export declare function registerWorkflowStateContext(ctx: any, repository: any, 
/** 只有返回 true 的会话才注入；由宿主半按"这个会话是不是工作流预设"判定。 */
isWorkflowSession?: (sessionId: string) => boolean): {
    peek: (sessionId: string) => Promise<string>;
    refreshNow: (sessionId: string) => Promise<string>;
};
//# sourceMappingURL=workflow-state-context.d.ts.map