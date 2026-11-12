import { GlobalOperationDetail, type WorkflowSnapshot } from '../schema/workflow';
import { type ManualLimits } from '../schema/manual-limits';
import type { AgentNode } from '../schema/node';
/** 随插件提供的内置存档名：只读，不可改不可删，缺省时就用它。 */
export declare const BUILTIN_PROFILE_NAME = "\u9ED8\u8BA4\u5B58\u6863";
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
/** 侧栏状态表读盘时，坏快照被跳过的回调：让上层能留一条痕，分清「没有这个会话」和「快照读坏了」。 */
export type BrokenSnapshotHandler = (fileName: string, error: unknown) => void;
/** 造一个合法的根节点（workspace 类型，parent_id 为 null，初始态 discussing）。 */
export declare function buildRootNode(id: string, maxDepth: number, maxSteps: number): AgentNode;
export declare class WorkflowRepository {
    readonly baseDir: string;
    private readonly storage;
    /** 手册元数据缓存：key = workflowId:nodeId，按文件 mtime 失效，避免每次轮询都读盘。 */
    private readonly manualMetaCache;
    /** 每个工作区的写队列（串行化读-改-写，避免并发覆盖丢更新）。 */
    private readonly writeQueues;
    constructor(baseDir: string);
    /**
     * 按 key（通常是 workflowId 或工作目录）串行执行写操作。
     * 前一个任务无论成功失败，后面的都会接着跑；返回本次任务的真实结果。
     */
    private serial;
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
    /** 存档目录：一份存档 = 一个 json 文件；内置「默认存档」来自代码常量，不落盘。 */
    private profilesDir;
    /** 当前生效存档的指针：只存一个名字，存在 <baseDir>/global-settings.json。 */
    private activePointerPath;
    /** 存档名 → 文件名：去掉路径分隔符等非法字符并限长，防止写到目录外。 */
    private profileFileName;
    /** 列出存档名（不含内置存档；读不出来的文件跳过，不让坏文件阻塞设置页）。 */
    private listProfileNames;
    /** 当前生效存档名；指针失效时回到内置存档。 */
    private activeProfileName;
    private writeActivePointer;
    private writeProfileFile;
    private readProfileFile;
    /**
     * 一次性迁移：旧的 `{ active, profiles }` 或更早的扁平 A/B/C/D，都拆成"一份存档一个文件"。
     * 只在指针文件还是旧格式时动手，迁完就只剩 `{ active }`。
     */
    private migrateLegacySettings;
    /** 存档列表：内置存档永远排第一，其余按文件名排序。 */
    listProfiles(): Promise<{
        active: string;
        names: string[];
    }>;
    /** 当前生效的操作细节：内置存档来自代码常量，其余读对应的 json 文件。 */
    getAppGlobalOperationDetail(): Promise<GlobalOperationDetail>;
    /** 保存当前生效的存档。内置存档只读，改它会被拒绝。 */
    updateAppGlobalOperationDetail(raw: unknown): Promise<GlobalOperationDetail>;
    /** 新建/覆盖一份用户存档（内置存档名不可用）。detail 省略时复制当前生效的那份。 */
    saveProfile(name: string, raw?: unknown): Promise<{
        active: string;
        names: string[];
    }>;
    activateProfile(name: string): Promise<{
        active: string;
        names: string[];
    }>;
    /** 删除存档：文件移进 exports/trash/（不直接删，误删可捞回来）。 */
    deleteProfile(name: string): Promise<{
        active: string;
        names: string[];
    }>;
    /** 把当前生效的存档复制一份到存档目录（带时间戳），返回路径。 */
    exportActiveProfile(): Promise<{
        path: string;
        name: string;
    }>;
    /**
     * 导入一份存档：接受 `{ name, detail }` 包装，或直接一份 A/B/C/D。
     * @returns 导入后的存档名与列表（不自动切换，避免导入即改全局行为）。
     */
    importProfile(name: string, json: string): Promise<{
        imported: string;
        names: string[];
    }>;
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
        by?: string;
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
    /** 侧栏批量用：返回某工作区所有会话节点的状态映射（sessionId → current_state）。 */
    getNodeStatesByDirectory(workingDirectory: string, onBroken?: BrokenSnapshotHandler): Promise<Record<string, string>>;
    /**
     * 侧栏全量用：一次汇总所有工作区里已绑定会话的状态（sessionId → current_state）。
     *
     * 状态点的显示只认「节点绑过哪个会话」这条持久化事实，不读宿主内存里的预设名单：
     * 名单是进程内的，重启后为空，会让重启前的会话全部丢掉状态点。
     * 坏了 / 读不出来的快照直接跳过，不影响其他工作区；跳过时通过 onBroken 留痕。
     */
    getAllNodeStates(onBroken?: BrokenSnapshotHandler): Promise<Record<string, string>>;
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
    /** 项目手册的绝对路径（只读用途：注入里那句「去哪查」要用它，不能只给相对名）。 */
    globalManualPath(workflowId: string): Promise<string | null>;
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
    /**
     * 应用级设置：切换状态时是否自动发送默认输入 + 手册字数上限。
     * 存在 <baseDir>/app-settings.json。
     */
    private appSettingsPath;
    getAppSettings(): Promise<{
        autoSendEnterTrigger: boolean;
        manualLimits: ManualLimits;
    }>;
    updateAppSettings(patch: {
        autoSendEnterTrigger?: boolean;
        manualLimits?: unknown;
    }): Promise<{
        autoSendEnterTrigger: boolean;
        manualLimits: ManualLimits;
    }>;
    /**
     * 读项目手册并按四类内容拆开，供注入按优先级取用。
     * 旧标题「要点 / 疑难杂症」也算「坑与防线」。
     */
    readGlobalManualSections(workflowId: string): Promise<{
        overview: string;
        decisions: string;
        constraints: string;
        pitfalls: string;
        tags: string[];
    }>;
    /** 项目手册四节（标签表不算条目节，它由工具维护）。 */
    private projectEntrySections;
    /** 读项目手册全文（不存在时用模板）。 */
    private readProjectManual;
    /** 写回项目手册：先过「约束」一节的字数闸门与整本字节上限，再原子写。 */
    private writeProjectManual;
    /** 按小节替换，小节不存在就追加（旧手册没有「标签表」时走这条）。 */
    private upsertSection;
    /** 当前标签表。 */
    listProjectTags(workflowId: string): Promise<string[]>;
    /**
     * 追加一条带标签的条目。标签不在表里就自动登记；表满 30 条时拒写，逼用 rename_tag 合并。
     * @returns 登记后的完整标签表 + 这次新登记的标签 + 实际写入的行
     */
    appendProjectEntry(input: {
        workflowId: string;
        section: string;
        tags: string[];
        content: string;
    }): Promise<{
        tags: string[];
        registered: string[];
        entry: string;
    }>;
    /** 改写一条条目（按正文精确匹配；匹配到多条就报错，猜错比报错更糟）。 */
    updateProjectEntry(input: {
        workflowId: string;
        section: string;
        entry: string;
        tags: string[];
        content: string;
    }): Promise<{
        tags: string[];
        entry: string;
    }>;
    /** 删掉一条条目（按正文精确匹配）。 */
    removeProjectEntry(input: {
        workflowId: string;
        section: string;
        entry: string;
    }): Promise<{
        removed: string;
    }>;
    /**
     * 合并 / 重命名标签：级联改写所有条目行里的 from → to，再从标签表删 from。
     * 这条通道不占 30 条额度（只会让表变小或不变），是"表满了还能收拾"的唯一出口。
     */
    renameProjectTag(input: {
        workflowId: string;
        from: string;
        to: string;
    }): Promise<{
        tags: string[];
        rewritten: number;
    }>;
    /** 条目只能写进四节；标签表由工具自动维护，不许当条目节用。 */
    private assertEntrySection;
    /** 归一化标签数组：过滤非法、去重；一个都不剩就拒写并列出可用标签。 */
    private normalizeEntryTags;
    /**
     * 读手册全文（AI 专用工具的 read 动作）。
     * nodeId 为 null 时读项目手册；否则读该会话的会话手册。
     */
    readManual(workflowId: string, nodeId: string | null): Promise<string>;
    /**
     * 按小节替换手册正文（AI 专用工具的唯一写入口）。
     * 只改指定 `## 小节` 的正文，标题与其它小节原样保留；路径由这里拼，调用方不能指定。
     */
    replaceManualSection(input: {
        workflowId: string;
        nodeId: string | null;
        section: string;
        content: string;
    }): Promise<{
        bytes: number;
        section: string;
        chars: number;
    }>;
    /**
     * 勾选 / 取消勾选「实施顺序」里的一条（按条目文字精确匹配，不许新增或改写条目）。
     * @returns 勾选后的完整清单，方便模型确认进度。
     */
    setChecklistItem(input: {
        workflowId: string;
        nodeId: string;
        label: string;
        done: boolean;
        /** 勾选时必填：这一层怎么验的、结果是什么。 */
        evidence?: string;
    }): Promise<Array<{
        label: string;
        done: boolean;
    }>>;
    /** 会话/项目手册的绝对路径与"是不是会话手册"。 */
    private resolveManualFile;
    private readFileOrTemplate;
}
//# sourceMappingURL=workflow-repository.d.ts.map