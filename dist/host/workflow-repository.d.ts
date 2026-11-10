import { type WorkflowSnapshot } from '../schema/workflow';
import type { AgentNode } from '../schema/node';
/**
 * workflow 工作区的持久化仓库：一份快照文件 = 一个 workflow 工作区。
 * 存储目录：<baseDir>/workflows/<workspace_id>.json（复用 JsonStorageAdapter 的原子写 + 迁移）。
 *
 * 与 dsh 的「目录工作区」完全无关：dsh workspace 走它自己的 workspace.json，
 * 这里写的是我们自己的 WorkflowSnapshot，互不共享实体。
 */
export interface WorkflowSummary {
    id: string;
    title: string;
    /** 用户创建时选的工作目录；旧快照可能没有。 */
    path: string | null;
    /** 是否置顶（只影响侧栏排序）。 */
    pinned: boolean;
    /** 文件最后修改时间（ISO），用于列表排序；不是严格意义上的"创建时间"。 */
    updatedAt: string;
}
/** 造一个合法的根节点（workspace 类型，parent_id 为 null，初始态 not_started）。 */
export declare function buildRootNode(id: string, maxDepth: number, maxSteps: number): AgentNode;
export declare class WorkflowRepository {
    readonly baseDir: string;
    private readonly storage;
    constructor(baseDir: string);
    /** 列出所有 workflow 工作区，按最后修改时间倒序。单个损坏文件跳过，不影响整体。 */
    list(): Promise<WorkflowSummary[]>;
    /** 新建一个 workflow 工作区：自动建根节点，标题缺省用目录名。 */
    create(input: {
        title?: string;
        path: string;
    }): Promise<WorkflowSummary>;
    get(id: string): Promise<WorkflowSnapshot | null>;
    /** 置顶 / 取消置顶（只影响侧栏排序，不碰宿主的工作区置顶集合）。 */
    setPinned(input: {
        id: string;
        pinned: boolean;
    }): Promise<WorkflowSnapshot>;
    /** 把某个节点推进到下一状态（五态单向：not_started→discussing→implementing→verifying→completed）。 */
    transitionNode(input: {
        id: string;
        nodeId: string;
        to: string;
    }): Promise<WorkflowSnapshot>;
    /**
     * 把节点绑定到一个 dsh 会话（点节点时打开）。
     * 传空字符串表示解绑；只改我们自己的快照，不碰宿主的会话存储。
     */
    bindSession(input: {
        id: string;
        nodeId: string;
        sessionId: string;
    }): Promise<WorkflowSnapshot>;
    /**
     * 在某个父节点下加一个子节点（可无限层，受 max_depth 限制）。
     * 只改我们自己的快照，与 dsh 的 workspace 无关。
     */
    addNode(input: {
        id: string;
        parentId: string;
        title?: string;
    }): Promise<WorkflowSnapshot>;
}
//# sourceMappingURL=workflow-repository.d.ts.map