import { truncateToBytes } from '../engine/text-budget';
export { truncateToBytes };
/** 整块注入的预算（字节）：A 公共细节常驻交付三项与提建议规范，且用户可把它改得更长。
 *  实测默认文本最坏情况（验收中 + 满额会话手册 4600B）硬层合计 8863 字节（含工具目录 1397），
 *  9000 只剩 137 字节余量，用户一改长就撞「硬层超预算」。
 *  现在预算抬到 11000，给用户自定义留约 2.1 KB 余量；超了仍显式报错（fail-closed），不静默丢硬层。 */
export declare const TOTAL_BUDGET_BYTES = 11000;
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