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
/** 子节点手册/摘要统一平铺在工作区根目录的 .workflow/ 下，文件名自索引 node_id。 */
const WORKFLOW_SUBDIR = '.workflow';
const MANUAL_MAX_BYTES = 200 * 1024;
const SUMMARY_MAX_BYTES = 32 * 1024;
function manualFileName(nodeId) {
    return `工作手册-${nodeId}.md`;
}
function summaryFileName(nodeId) {
    return `手册摘要-${nodeId}.md`;
}
/** 新节点的初始工作手册模板：分层方案 + 决策记录 + 实施顺序（勾选清单）。 */
const MANUAL_TEMPLATE = [
    '# 工作手册',
    '',
    '## 方案（上层 → 下层）',
    '### 1. 目标与验收',
    '<!-- 要解决什么、不做什么、验收标准 -->',
    '### 2. 对外契约',
    '<!-- 对外接口 / 命令 / 事件，入参出参 -->',
    '### 3. 结构与依赖',
    '<!-- 模块划分、职责、调用方向 -->',
    '### 4. 数据与状态',
    '<!-- 数据结构、状态流转、持久化 -->',
    '### 5. 表现与文案',
    '<!-- 界面、字段、文案、交互细节 -->',
    '',
    '## 决策记录',
    '<!-- 讨论中拍板的分叉点：为什么选 A 不选 B -->',
    '',
    '## 实施顺序',
    '- [ ] 2. 对外契约',
    '- [ ] 3. 结构与依赖',
    '- [ ] 4. 数据与状态',
    '- [ ] 5. 表现与文案',
    '',
    '## 要点 / 需求 / 疑难杂症',
    '',
].join('\n');
/** 从工作手册里解析「实施顺序」小节的勾选清单；解析不到返回空数组。 */
function parseChecklist(manual) {
    const lines = manual.split(/\r?\n/);
    let inSection = false;
    const items = [];
    for (const line of lines) {
        if (line.trim() === '## 实施顺序') {
            inSection = true;
            continue;
        }
        if (inSection && line.startsWith('## '))
            break;
        if (!inSection)
            continue;
        const match = /^\s*-\s+\[([ xX])\]\s*(.+)$/.exec(line);
        if (match !== null)
            items.push({ label: (match[2] ?? '').trim(), done: match[1] !== ' ' });
    }
    return items;
}
/** 判断「方案」小节是否已经写了实质内容（非标题、非注释、非空行）。 */
function parseHasPlan(manual) {
    const lines = manual.split(/\r?\n/);
    let inPlan = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('## 方案')) {
            inPlan = true;
            continue;
        }
        if (inPlan && trimmed.startsWith('## '))
            break;
        if (!inPlan)
            continue;
        if (trimmed === '' || trimmed.startsWith('### ') || trimmed.startsWith('<!--'))
            continue;
        return true;
    }
    return false;
}
async function writeIfMissing(path, content) {
    try {
        await fs.access(path);
    }
    catch {
        await fs.writeFile(path, content, 'utf8');
    }
}
async function readTextCapped(path, maxBytes) {
    try {
        const raw = await fs.readFile(path, 'utf8');
        if (Buffer.byteLength(raw, 'utf8') <= maxBytes)
            return raw;
        return `${raw.slice(0, maxBytes)}\n…（已截断）`;
    }
    catch {
        return '';
    }
}
/** 往根工作目录的 .gitignore 追加 .workflow/（文件不存在则跳过，不主动新建）。 */
async function appendGitignore(workingDir) {
    if (typeof workingDir !== 'string' || workingDir === '')
        return;
    const target = join(workingDir, '.gitignore');
    try {
        await fs.access(target);
    }
    catch {
        return;
    }
    try {
        const content = await fs.readFile(target, 'utf8');
        if (content.includes('.workflow'))
            return;
        const separator = content !== '' && !content.endsWith('\n') ? '\n' : '';
        await fs.writeFile(target, `${content}${separator}.workflow/\n`, 'utf8');
    }
    catch {
        // 读写失败不阻塞建节点。
    }
}
export class WorkflowRepository {
    baseDir;
    storage;
    /** 手册元数据缓存：key = workflowId:nodeId，按文件 mtime 失效，避免每次轮询都读盘。 */
    manualMetaCache = new Map();
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
    /**
     * 删除整份 workflow 快照（宿主工作区被删除时同步清理，避免留下孤儿行）。
     * **不真删**：移到 workflows-trash/<id>.<时间戳>.json，便于误删后恢复。
     */
    async remove(id) {
        const source = join(this.baseDir, 'workflows', `${id}.json`);
        const trashDir = join(this.baseDir, 'workflows-trash');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        try {
            await fs.mkdir(trashDir, { recursive: true });
            await fs.rename(source, join(trashDir, `${id}.${stamp}.json`));
            return;
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return;
            // 移动失败（跨盘/权限）时退回真删，保证删除动作本身不会卡住。
            try {
                await fs.unlink(source);
            }
            catch (unlinkError) {
                if (unlinkError.code === 'ENOENT')
                    return;
                throw unlinkError;
            }
        }
    }
    /** 列出回收站里的快照（按文件名倒序 = 最近删除优先）。 */
    async listTrash() {
        const trashDir = join(this.baseDir, 'workflows-trash');
        let names = [];
        try {
            names = await fs.readdir(trashDir);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return [];
            throw error;
        }
        return names
            .filter((name) => name.endsWith('.json'))
            .sort()
            .reverse()
            .map((name) => {
            const match = /^(.+)\.(\d{4}-\d{2}-\d{2}T[^.]+)\.json$/.exec(name);
            return {
                id: match?.[1] ?? name.slice(0, -'.json'.length),
                file: name,
                deletedAt: match?.[2] ?? '',
            };
        });
    }
    /**
     * 从回收站恢复（取该 id 最近一次删除的那份）。
     * 已存在同名快照时不覆盖，直接返回 false。
     */
    async restoreFromTrash(id) {
        const trashDir = join(this.baseDir, 'workflows-trash');
        const target = join(this.baseDir, 'workflows', `${id}.json`);
        try {
            await fs.access(target);
            return false;
        }
        catch {
            // 目标不存在，可以恢复。
        }
        let names = [];
        try {
            names = await fs.readdir(trashDir);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return false;
            throw error;
        }
        const newest = names
            .filter((name) => name.startsWith(`${id}.`) && name.endsWith('.json'))
            .sort()
            .reverse()[0];
        if (newest === undefined)
            return false;
        await fs.mkdir(join(this.baseDir, 'workflows'), { recursive: true });
        await fs.rename(join(trashDir, newest), target);
        return true;
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
     * 同时在工作区根目录 `.workflow/` 下平铺两份 md（文件名带 node_id 自索引）。
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
        const title = input.title?.trim() !== '' && input.title !== undefined ? input.title.trim() : '新子节点';
        // 平铺到工作区根 .workflow/，只 mkdir 一次目录；文件名带 node_id。
        const workingDir = snapshot.working_directory;
        if (typeof workingDir === 'string' && workingDir.trim() !== '') {
            const wfDir = join(workingDir, WORKFLOW_SUBDIR);
            await fs.mkdir(wfDir, { recursive: true });
            await writeIfMissing(join(wfDir, manualFileName(nodeId)), MANUAL_TEMPLATE);
            await writeIfMissing(join(wfDir, summaryFileName(nodeId)), '# 手册摘要\n\n（本手册的概要，供子节点查看一层。）\n');
            await appendGitignore(workingDir);
        }
        const child = {
            ...buildRootNode(nodeId, parent.max_depth, parent.max_steps),
            parent_id: parent.node_id,
            title,
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
        return { snapshot: updated, nodeId };
    }
    /** 读节点自己的工作手册全文 + 摘要（供只读 UI 展示）；notesDir 指向 .workflow 根目录。 */
    async readNodeManual(workflowId, nodeId) {
        const snapshot = await this.storage.load(workflowId);
        if (snapshot === null)
            return null;
        const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
        if (node === undefined)
            return null;
        const workingDir = snapshot.working_directory;
        if (typeof workingDir !== 'string' || workingDir === '')
            return null;
        const wfDir = join(workingDir, WORKFLOW_SUBDIR);
        const manual = await readTextCapped(join(wfDir, manualFileName(nodeId)), MANUAL_MAX_BYTES);
        const summary = await readTextCapped(join(wfDir, summaryFileName(nodeId)), SUMMARY_MAX_BYTES);
        return { manual, summary, notesDir: wfDir, checklist: parseChecklist(manual) };
    }
    /** 读父节点的手册摘要（只看一层；父是根或没有对应文件时返回空串）。 */
    async readParentSummary(workflowId, nodeId) {
        const snapshot = await this.storage.load(workflowId);
        if (snapshot === null)
            return '';
        const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
        if (node === undefined || node.parent_id === null)
            return '';
        const parent = snapshot.nodes.find((candidate) => candidate.node_id === node.parent_id);
        if (parent === undefined)
            return '';
        const workingDir = snapshot.working_directory;
        if (typeof workingDir !== 'string' || workingDir === '')
            return '';
        return readTextCapped(join(workingDir, WORKFLOW_SUBDIR, summaryFileName(parent.node_id)), SUMMARY_MAX_BYTES);
    }
    /**
     * 轻量取「实施清单 + 方案是否已写」：会话输入区每 3s 轮询用，带 mtime 缓存，
     * 文件没变就不重新读盘/解析。
     */
    async getManualMeta(workflowId, nodeId) {
        const snapshot = await this.storage.load(workflowId);
        if (snapshot === null)
            return null;
        const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
        if (node === undefined)
            return null;
        const workingDir = snapshot.working_directory;
        if (typeof workingDir !== 'string' || workingDir === '')
            return null;
        const file = join(workingDir, WORKFLOW_SUBDIR, manualFileName(nodeId));
        let mtimeMs = 0;
        try {
            mtimeMs = (await fs.stat(file)).mtimeMs;
        }
        catch {
            // 文件不存在：mtime 保持 0，下面读到空串。
        }
        const key = `${workflowId}:${nodeId}`;
        const cached = this.manualMetaCache.get(key);
        if (cached !== undefined && cached.mtimeMs === mtimeMs) {
            return { checklist: cached.checklist, hasPlan: cached.hasPlan };
        }
        const manual = await readTextCapped(file, MANUAL_MAX_BYTES);
        const meta = { mtimeMs, checklist: parseChecklist(manual), hasPlan: parseHasPlan(manual) };
        this.manualMetaCache.set(key, meta);
        return { checklist: meta.checklist, hasPlan: meta.hasPlan };
    }
}
//# sourceMappingURL=workflow-repository.js.map