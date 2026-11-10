import { GlobalOperationDetail, type WorkflowSnapshot } from '../schema/workflow';
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
    /** 对应的宿主目录工作区 id；旧快照可能没有（靠 path 反查）。 */
    workspaceId?: string;
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
        hostWorkspaceId?: string;
    }): Promise<WorkflowSummary>;
    get(id: string): Promise<WorkflowSnapshot | null>;
    /** 读取某个 workflow 的全局操作细节（A + B/C/D）。 */
    getGlobalOperationDetail(id: string): Promise<WorkflowSnapshot['settings']['global_operation_detail'] | null>;
    /** 应用级全局操作细节（A + B/C/D）：所有 workflow 共用一份，存在 <baseDir>/global-settings.json。 */
    private appGlobalSettingsPath;
    getAppGlobalOperationDetail(): Promise<GlobalOperationDetail>;
    updateAppGlobalOperationDetail(raw: unknown): Promise<GlobalOperationDetail>;
    /** 覆盖某个 workflow 的全局操作细节（A + B/C/D），用 zod 校验后落盘。 */
    updateGlobalOperationDetail(id: string, raw: unknown): Promise<WorkflowSnapshot['settings']['global_operation_detail']>;
    /**
     * 设置节点级「附加说明」（纯增量，不覆盖全局）。
     * 传空串 = 删除该状态的附加说明；三个都空则把字段整个去掉。
     */
    setNodeNote(input: {
        id: string;
        nodeId: string;
        state: string;
        text: string;
    }): Promise<WorkflowSnapshot>;
    /**
     * 按绑定的会话 id 反查节点（输入框旁的状态徽标用）。
     * workflow 数量很少，逐个文件扫一遍足够；单文件损坏就跳过。
     */
    findBySession(sessionId: string): Promise<{
        workflowId: string;
        nodeId: string;
        title: string;
        current_state: string;
    } | null>;
    /** 删除整份 workflow 快照（宿主工作区被删除时同步清理，避免留下孤儿行）。 */
    remove(id: string): Promise<void>;
    /**
     * 把宿主目录工作区 id 写回快照（一次性迁移用：旧快照只有 working_directory）。
     * 已写过就不重复写；传空串等于清空。
     */
    linkWorkspace(input: {
        id: string;
        hostWorkspaceId: string;
    }): Promise<WorkflowSnapshot>;
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