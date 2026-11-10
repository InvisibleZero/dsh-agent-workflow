import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { JsonStorageAdapter } from '../adapter/json-storage';
import { DEFAULT_SETTINGS } from '../schema/workflow';
/** 造一个合法的根节点（workspace 类型，parent_id 为 null，初始态 not_started）。 */
export function buildRootNode(id, maxDepth, maxSteps) {
    return {
        node_id: id,
        parent_id: null,
        node_type: 'workspace',
        current_state: 'not_started',
        child_ids: [],
        context_payload: null,
        flags: [],
        depth: 0,
        max_depth: maxDepth,
        step_count: 0,
        max_steps: maxSteps,
    };
}
export class WorkflowRepository {
    baseDir;
    storage;
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.storage = new JsonStorageAdapter(baseDir);
    }
    /** 列出所有 workflow 工作区，按最后修改时间倒序。单个损坏文件跳过，不影响整体。 */
    async list() {
        const dir = join(this.baseDir, 'workflows');
        let names = [];
        try {
            names = await fs.readdir(dir);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return [];
            throw error;
        }
        const items = [];
        for (const name of names) {
            if (!name.endsWith('.json'))
                continue;
            const id = name.slice(0, -'.json'.length);
            try {
                const snapshot = await this.storage.load(id);
                if (snapshot === null)
                    continue;
                const stat = await fs.stat(join(dir, name));
                items.push({
                    id,
                    title: snapshot.title,
                    path: snapshot.working_directory ?? null,
                    ...(snapshot.host_workspace_id === undefined ? {} : { workspaceId: snapshot.host_workspace_id }),
                    pinned: snapshot.pinned === true,
                    updatedAt: stat.mtime.toISOString(),
                });
            }
            catch {
                // 单个文件损坏时跳过，不拖垮整个列表。
            }
        }
        items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        return items;
    }
    /** 新建一个 workflow 工作区：自动建根节点，标题缺省用目录名。 */
    async create(input) {
        const id = randomUUID();
        const trimmedTitle = input.title?.trim() ?? '';
        const title = trimmedTitle !== '' ? trimmedTitle : basename(input.path);
        const hostWorkspaceId = typeof input.hostWorkspaceId === 'string' && input.hostWorkspaceId !== ''
            ? input.hostWorkspaceId
            : undefined;
        const snapshot = {
            version: 1,
            workspace_id: id,
            title,
            working_directory: input.path,
            ...(hostWorkspaceId === undefined ? {} : { host_workspace_id: hostWorkspaceId }),
            settings: DEFAULT_SETTINGS,
            nodes: [buildRootNode(id, DEFAULT_SETTINGS.default_max_depth, DEFAULT_SETTINGS.default_max_steps)],
        };
        await this.storage.save(snapshot);
        return {
            id,
            title,
            path: input.path,
            ...(hostWorkspaceId === undefined ? {} : { workspaceId: hostWorkspaceId }),
            pinned: false,
            updatedAt: new Date().toISOString(),
        };
    }
    async get(id) {
        return this.storage.load(id);
    }
    /**
     * 把宿主目录工作区 id 写回快照（一次性迁移用：旧快照只有 working_directory）。
     * 已写过就不重复写；传空串等于清空。
     */
    async linkWorkspace(input) {
        const snapshot = await this.storage.load(input.id);
        if (snapshot === null)
            throw new Error('找不到该 workflow');
        const hostWorkspaceId = input.hostWorkspaceId.trim();
        const updated = hostWorkspaceId === ''
            ? (() => {
                const { host_workspace_id: _removed, ...rest } = snapshot;
                return rest;
            })()
            : { ...snapshot, host_workspace_id: hostWorkspaceId };
        await this.storage.save(updated);
        return updated;
    }
    /** 置顶 / 取消置顶（只影响侧栏排序，不碰宿主的工作区置顶集合）。 */
    async setPinned(input) {
        const snapshot = await this.storage.load(input.id);
        if (snapshot === null)
            throw new Error('找不到该 workflow');
        const updated = { ...snapshot, pinned: input.pinned === true };
        await this.storage.save(updated);
        return updated;
    }
    /** 把某个节点推进到下一状态（五态单向：not_started→discussing→implementing→verifying→completed）。 */
    async transitionNode(input) {
        const snapshot = await this.storage.load(input.id);
        if (snapshot === null)
            throw new Error('找不到该 workflow');
        const validStates = ['not_started', 'discussing', 'implementing', 'verifying', 'completed'];
        if (!validStates.includes(input.to))
            throw new Error('非法状态');
        const exists = snapshot.nodes.some((node) => node.node_id === input.nodeId);
        if (!exists)
            throw new Error('找不到节点');
        const updated = {
            ...snapshot,
            nodes: snapshot.nodes.map((node) => node.node_id === input.nodeId
                ? { ...node, current_state: input.to }
                : node),
        };
        await this.storage.save(updated);
        return updated;
    }
    /**
     * 把节点绑定到一个 dsh 会话（点节点时打开）。
     * 传空字符串表示解绑；只改我们自己的快照，不碰宿主的会话存储。
     */
    async bindSession(input) {
        const snapshot = await this.storage.load(input.id);
        if (snapshot === null)
            throw new Error('找不到该 workflow');
        if (typeof input.sessionId !== 'string')
            throw new Error('缺少 sessionId');
        const exists = snapshot.nodes.some((node) => node.node_id === input.nodeId);
        if (!exists)
            throw new Error('找不到节点');
        const sessionId = input.sessionId.trim();
        const updated = {
            ...snapshot,
            nodes: snapshot.nodes.map((node) => {
                if (node.node_id !== input.nodeId)
                    return node;
                if (sessionId === '') {
                    const { session_id: _removed, ...rest } = node;
                    return rest;
                }
                return { ...node, session_id: sessionId };
            }),
        };
        await this.storage.save(updated);
        return updated;
    }
    /**
     * 在某个父节点下加一个子节点（可无限层，受 max_depth 限制）。
     * 只改我们自己的快照，与 dsh 的 workspace 无关。
     */
    async addNode(input) {
        const snapshot = await this.storage.load(input.id);
        if (snapshot === null)
            throw new Error('找不到该 workflow');
        const parent = snapshot.nodes.find((node) => node.node_id === input.parentId);
        if (parent === undefined)
            throw new Error('找不到父节点');
        if (parent.depth + 1 > parent.max_depth)
            throw new Error(`超过最大深度（${String(parent.max_depth)}）`);
        const nodeId = randomUUID();
        const child = {
            ...buildRootNode(nodeId, parent.max_depth, parent.max_steps),
            parent_id: parent.node_id,
            title: input.title?.trim() !== '' && input.title !== undefined ? input.title.trim() : '新子节点',
            node_type: 'task',
            depth: parent.depth + 1,
        };
        const updated = {
            ...snapshot,
            nodes: [
                ...snapshot.nodes.map((node) => node.node_id === parent.node_id ? { ...node, child_ids: [...node.child_ids, nodeId] } : node),
                child,
            ],
        };
        await this.storage.save(updated);
        return updated;
    }
}
//# sourceMappingURL=workflow-repository.js.map