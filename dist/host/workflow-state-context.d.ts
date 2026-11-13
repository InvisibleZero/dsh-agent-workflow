import { truncateToBytes } from '../engine/text-budget';
export { truncateToBytes };
/**
 * 注册 workflow 状态上下文。
 * @returns 调试用的 peek(sessionId)：强制算一次并返回合并后的文本。
 */
export declare function registerWorkflowStateContext(ctx: any, repository: any, 
/** 只有返回 true 的会话才注入；由宿主半按"这个会话是不是工作流预设"判定。 */
isWorkflowSession?: (sessionId: string) => boolean, 
/** 工具目录文本：按当前状态现算（基础 + 扩展，按状态过滤），不在这里读文件。 */
options?: {
    catalogTextOf?: (state: string) => Promise<string>;
}): {
    peek: (sessionId: string) => Promise<string>;
    refreshNow: (sessionId: string) => Promise<string>;
};
//# sourceMappingURL=workflow-state-context.d.ts.map