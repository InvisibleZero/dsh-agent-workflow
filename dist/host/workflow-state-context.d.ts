/**
 * 按**字节**截断，且不切坏多字节字符。
 *
 * 之前是「按字节判断、按字符切」：中文一个字 3 字节，字节超了 8000、字符没超 8000 时
 * 内容一个字都没切却照样追加「（已截断）」，等于骗模型；真到 8000 字符时又切出 24KB。
 */
export declare function truncateToBytes(text: string, maxBytes: number): string;
/**
 * 注册 workflow 状态上下文。
 * @returns 调试用的 peek(sessionId)：强制算一次并返回将要注入的文本。
 */
export declare function registerWorkflowStateContext(ctx: any, repository: any, 
/** 只有返回 true 的会话才注入；由宿主半按"这个会话是不是工作流预设"判定。 */
isWorkflowSession?: (sessionId: string) => boolean): {
    peek: (sessionId: string) => Promise<string>;
};
//# sourceMappingURL=workflow-state-context.d.ts.map