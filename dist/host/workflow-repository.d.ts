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
    /** 手册元数据缓存：key = workflowId:nodeId，按文件 mtime 失效，避免每次轮询都读盘。 */
    private readonly manualMetaCache;
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
    /**
     * 删除整份 workflow 快照（宿主工作区被删除时同步清理，避免留下孤儿行）。
     * **不真删**：移到 workflows-trash/<id>.<时间戳>.json，便于误删后恢复。
     */
    remove(id: string): Promise<void>;
    /** 列出回收站里的快照（按文件名倒序 = 最近删除优先）。 */
    listTrash(): Promise<Array<{
        id: string;
        file: string;
        deletedAt: string;
    }>>;
    /**
     * 从回收站恢复（取该 id 最近一次删除的那份）。
     * 已存在同名快照时不覆盖，直接返回 false。
     */
    restoreFromTrash(id: string): Promise<boolean>;
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
    /** 把某个节点推进到下一状态；附状态迁移时间线（history）。 */
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
    /** 按工作目录反查 workflow 快照。 */
    private findByWorkingDirectory;
    /** 确保工作区根目录有项目手册（项目总览 / 决策 / 要点）。 */
    private ensureGlobalManual;
    /** 确保某目录是一个 workflow 工作区（没有快照就建，含根节点），返回快照。 */
    private ensureWorkflow;
    /**
     * 自动认领：确保某会话已经是 workflow 节点（没有就建），返回节点摘要。
     * 会话所属工作区 = workingDirectory；工作区还不是 workflow 就顺带建快照 + 项目手册。
     */
    ensureNode(input: {
        sessionId: string;
        workingDirectory: string;
    }): Promise<{
        workflowId: string;
        nodeId: string;
        title: string;
        current_state: string;
    }>;
    /** 读会话手册全文 + 实施清单（供只读 UI 展示）；notesDir 指向 .workflow 根目录。 */
    readNodeManual(workflowId: string, nodeId: string): Promise<{
        manual: string;
        notesDir: string;
        checklist: Array<{
            label: string;
            done: boolean;
        }>;
    } | null>;
    /** 读工作区项目手册（项目总览 / 决策 / 要点）。 */
    readGlobalManual(workflowId: string): Promise<string>;
    /**
     * 轻量取「实施清单 + 方案是否已写」：会话输入区每 3s 轮询用，带 mtime 缓存，
     * 文件没变就不重新读盘/解析。
     */
    getManualMeta(workflowId: string, nodeId: string): Promise<{
        checklist: Array<{
            label: string;
            done: boolean;
        }>;
        hasPlan: boolean;
    } | null>;
}
//# sourceMappingURL=workflow-repository.d.ts.map