/**
 * 认领后的节点补齐 —— 宿主半的「已认领会话必须有 workflow 节点」这条不变量。
 *
 * 为什么放在宿主，而不是只靠浏览器：
 *   浏览器半的 `/ensure-node` 只在状态徽标挂载时试一次，而新会话刚创建时宿主还认不出
 *   「这是工作流预设的会话」（会话预设投影还没写、agent 还没建好），那一次会被拒；
 *   等 agent 建好、插件认领成功，却没有任何人补建节点——于是徽标永不出现、门禁永远拿不到状态，
 *   写操作全被「状态表缺这一条」拦住。
 *   认领是宿主自己的事件，补建放在这里最稳：不依赖浏览器时序，也赶在第一次工具调用之前。
 */
/** 只用到 ensureNode，方便测试时换成假仓储。 */
export interface ClaimNodeRepository {
    ensureNode(input: {
        sessionId: string;
        workingDirectory: string;
    }): Promise<{
        workflowId: string;
        nodeId: string;
        title: string;
        current_state: string;
    }>;
}
export interface ClaimNodeDeps {
    repository: ClaimNodeRepository;
    /** 会话工作目录；取不到返回空串（此时不建节点，只留痕）。 */
    resolveWorkingDirectory: (sessionId: string) => string;
    /** 门禁同步读这张表，建好节点必须立刻回填。 */
    setState: (sessionId: string, state: string) => void;
    log: (level: 'info' | 'warn', message: string) => void;
}
/**
 * 解析会话的工作目录。
 *
 * 先问 workingDirectory 服务（它跟着会话里的 cd / 工作树走，是真值），
 * 再退回会话头部记录的初始目录（冷会话、服务不可用时还能用）。
 * 两处都没有就返回空串：调用方据此降级，不要在这里抛。
 */
export declare function resolveSessionWorkingDirectory(ctx: any, sessionId: string): string;
/**
 * 确保被认领的会话有节点，并把当前状态回填进内存状态表。
 *
 * `ensureNode` 自身幂等（按工作目录串行、按 sessionId 查重），所以重复调用安全；
 * 失败只记 warn 并返回 null，不把异常抛给调用方——认领是事件回调，抛出去没人接。
 *
 * @returns 节点当前状态；没有工作目录或建失败返回 null。
 */
export declare function ensureClaimedSessionNode(deps: ClaimNodeDeps, sessionId: string, trigger: string): Promise<string | null>;
//# sourceMappingURL=session-claim.d.ts.map