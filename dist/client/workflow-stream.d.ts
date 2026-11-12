/** 一帧推送：只告诉「哪个会话变了、为什么变」，客户端收到就重取一次。 */
export interface WorkflowStreamEvent {
    sessionId: string;
    /** released / created / state / pending / pending-cleared —— 只用于日志与分派。 */
    reason: string;
    /** 已知的新状态；没有就是 null（客户端自己重取）。 */
    state: string | null;
}
/** 只依赖 onmessage / onopen / onerror / close，方便测试替身。 */
export interface WorkflowStreamSource {
    onmessage: ((message: {
        data: string;
    }) => void) | null;
    onopen?: (() => void) | null;
    onerror?: (() => void) | null;
    close(): void;
}
export interface WorkflowStream {
    /** 订阅；返回退订函数。首个订阅者会打开连接，最后一个退订会关闭。 */
    subscribe(listener: (event: WorkflowStreamEvent) => void): () => void;
}
/** 解析一帧；坏帧返回 null（不要因为一条脏数据把整个通道关掉）。 */
export declare function parseWorkflowStreamFrame(data: string): WorkflowStreamEvent | null;
/**
 * @param openSource 真正打开连接；返回 null 表示环境不支持（浏览器没有 EventSource）。
 * @param onStatus 连接状态变化回调：用来在浏览器侧留一条埋点，区分「没收到推送」和「收到了没渲染」。
 */
export declare function createWorkflowStream(openSource: () => WorkflowStreamSource | null, onStatus?: (open: boolean) => void): WorkflowStream;
/** 页面级单例：所有会话的徽标共用一条连接。 */
export declare function workflowStream(): WorkflowStream;
//# sourceMappingURL=workflow-stream.d.ts.map