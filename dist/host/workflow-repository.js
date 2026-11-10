import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { JsonStorageAdapter } from '../adapter/json-storage';
import { DEFAULT_GLOBAL_OPERATION_DETAIL, DEFAULT_SETTINGS, GlobalOperationDetail } from '../schema/workflow';
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
    /** 读取某个 workflow 的全局操作细节（A + B/C/D）。 */
    async getGlobalOperationDetail(id) {
        const snapshot = await this.storage.load(id);
        return snapshot === null ? null : snapshot.settings.global_operation_detail;
    }
    /** 应用级全局操作细节（A + B/C/D）：所有 workflow 共用一份，存在 <baseDir>/global-settings.json。 */
    appGlobalSettingsPath() {
        return join(this.baseDir, 'global-settings.json');
    }
    async getAppGlobalOperationDetail() {
        try {
            const raw = JSON.parse(await fs.readFile(this.appGlobalSettingsPath(), 'utf8'));
            return GlobalOperationDetail.parse(raw);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return DEFAULT_GLOBAL_OPERATION_DETAIL;
            // 文件损坏时退回内置默认值，不让设置页打不开。
            return DEFAULT_GLOBAL_OPERATION_DETAIL;
        }
    }
    async updateAppGlobalOperationDetail(raw) {
        const parsed = GlobalOperationDetail.parse(raw);
        await fs.mkdir(this.baseDir, { recursive: true });
        const target = this.appGlobalSettingsPath();
        const tmp = `${target}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(parsed, null, 2), 'utf8');
        await fs.rename(tmp, target);
        return parsed;
    }
    /** 覆盖某个 workflow 的全局操作细节（A + B/C/D），用 zod 校验后落盘。 */
    async updateGlobalOperationDetail(id, raw) {
        const snapshot = await this.storage.load(id);
        if (snapshot === null)
            throw new Error('找不到该 workflow');
        const parsed = GlobalOperationDetail.parse(raw);
        const updated = {
            ...snapshot,
            settings: { ...snapshot.settings, global_operation_detail: parsed },
        };
        await this.storage.save(updated);
        return parsed;
    }
    /**
     * 设置节点级「附加说明」（纯增量，不覆盖全局）。
     * 传空串 = 删除该状态的附加说明；三个都空则把字段整个去掉。
     */
    async setNodeNote(input) {
        const snapshot = await this.storage.load(input.id);
        if (snapshot === null)
            throw new Error('找不到该 workflow');
        const state = input.state;
        if (!['global', 'discussing', 'implementing', 'verifying'].includes(state))
            throw new Error('非法状态');
        const exists = snapshot.nodes.some((node) => node.node_id === input.nodeId);
        if (!exists)
            throw new Error('找不到节点');
        const text = input.text.trim();
        const updated = {
            ...snapshot,
            nodes: snapshot.nodes.map((node) => {
                if (node.node_id !== input.nodeId)
                    return node;
                const next = { ...(node.additional_detail ?? {}) };
                if (text === '')
                    delete next[state];
                else
                    next[state] = text;
                const hasAny = Object.keys(next).length > 0;
                const { additional_detail: _previous, ...rest } = node;
                return hasAny ? { ...rest, additional_detail: next } : rest;
            }),
        };
        await this.storage.save(updated);
        return updated;
    }
    /**
     * 按绑定的会话 id 反查节点（输入框旁的状态徽标用）。
     * workflow 数量很少，逐个文件扫一遍足够；单文件损坏就跳过。
     */
    async findBySession(sessionId) {
        const dir = join(this.baseDir, 'workflows');
        let names = [];
        try {
            names = await fs.readdir(dir);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return null;
            throw error;
        }
        for (const name of names) {
            if (!name.endsWith('.json'))
                continue;
            const id = name.slice(0, -'.json'.length);
            try {
                const snapshot = await this.storage.load(id);
                if (snapshot === null)
                    continue;
                const node = snapshot.nodes.find((candidate) => candidate.session_id === sessionId);
                if (node !== undefined) {
                    return {
                        workflowId: id,
                        nodeId: node.node_id,
                        title: node.title ?? '',
                        current_state: node.current_state,
                    };
                }
            }
            catch {
                // 单个快照损坏时跳过，不影响其它 workflow。
            }
        }
        return null;
    }
    /** 删除整份 workflow 快照（宿主工作区被删除时同步清理，避免留下孤儿行）。 */
    async remove(id) {
        const path = join(this.baseDir, 'workflows', `${id}.json`);
        try {
            await fs.unlink(path);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return;
            throw error;
        }
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