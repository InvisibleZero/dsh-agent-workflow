import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { JsonStorageAdapter } from '../adapter/json-storage';
import { DEFAULT_SETTINGS, type WorkflowSnapshot } from '../schema/workflow';
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
export function buildRootNode(id: string, maxDepth: number, maxSteps: number): AgentNode {
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
  private readonly storage: JsonStorageAdapter;

  constructor(readonly baseDir: string) {
    this.storage = new JsonStorageAdapter(baseDir);
  }

  /** 列出所有 workflow 工作区，按最后修改时间倒序。单个损坏文件跳过，不影响整体。 */
  async list(): Promise<WorkflowSummary[]> {
    const dir = join(this.baseDir, 'workflows');
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const items: WorkflowSummary[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const id = name.slice(0, -'.json'.length);
      try {
        const snapshot = await this.storage.load(id);
        if (snapshot === null) continue;
        const stat = await fs.stat(join(dir, name));
        items.push({
          id,
          title: snapshot.title,
          path: snapshot.working_directory ?? null,
          pinned: snapshot.pinned === true,
          updatedAt: stat.mtime.toISOString(),
        });
      } catch {
        // 单个文件损坏时跳过，不拖垮整个列表。
      }
    }
    items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return items;
  }

  /** 新建一个 workflow 工作区：自动建根节点，标题缺省用目录名。 */
  async create(input: { title?: string; path: string }): Promise<WorkflowSummary> {
    const id = randomUUID();
    const trimmedTitle = input.title?.trim() ?? '';
    const title = trimmedTitle !== '' ? trimmedTitle : basename(input.path);
    const snapshot: WorkflowSnapshot = {
      version: 1,
      workspace_id: id,
      title,
      working_directory: input.path,
      settings: DEFAULT_SETTINGS,
      nodes: [buildRootNode(id, DEFAULT_SETTINGS.default_max_depth, DEFAULT_SETTINGS.default_max_steps)],
    };
    await this.storage.save(snapshot);
    return { id, title, path: input.path, pinned: false, updatedAt: new Date().toISOString() };
  }

  async get(id: string): Promise<WorkflowSnapshot | null> {
    return this.storage.load(id);
  }

  /** 置顶 / 取消置顶（只影响侧栏排序，不碰宿主的工作区置顶集合）。 */
  async setPinned(input: { id: string; pinned: boolean }): Promise<WorkflowSnapshot> {
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error('找不到该 workflow');
    const updated: WorkflowSnapshot = { ...snapshot, pinned: input.pinned === true };
    await this.storage.save(updated);
    return updated;
  }

  /** 把某个节点推进到下一状态（五态单向：not_started→discussing→implementing→verifying→completed）。 */
  async transitionNode(input: { id: string; nodeId: string; to: string }): Promise<WorkflowSnapshot> {
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error('找不到该 workflow');
    const validStates = ['not_started', 'discussing', 'implementing', 'verifying', 'completed'];
    if (!validStates.includes(input.to)) throw new Error('非法状态');
    const exists = snapshot.nodes.some((node) => node.node_id === input.nodeId);
    if (!exists) throw new Error('找不到节点');
    const updated: WorkflowSnapshot = {
      ...snapshot,
      nodes: snapshot.nodes.map((node) =>
        node.node_id === input.nodeId
          ? { ...node, current_state: input.to as AgentNode['current_state'] }
          : node,
      ),
    };
    await this.storage.save(updated);
    return updated;
  }

  /**
   * 在某个父节点下加一个子节点（可无限层，受 max_depth 限制）。
   * 只改我们自己的快照，与 dsh 的 workspace 无关。
   */
  async addNode(input: { id: string; parentId: string; title?: string }): Promise<WorkflowSnapshot> {
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error('找不到该 workflow');
    const parent = snapshot.nodes.find((node) => node.node_id === input.parentId);
    if (parent === undefined) throw new Error('找不到父节点');
    if (parent.depth + 1 > parent.max_depth) throw new Error(`超过最大深度（${String(parent.max_depth)}）`);

    const nodeId = randomUUID();
    const child = {
      ...buildRootNode(nodeId, parent.max_depth, parent.max_steps),
      parent_id: parent.node_id,
      title: input.title?.trim() !== '' && input.title !== undefined ? input.title.trim() : '新子节点',
      node_type: 'task' as const,
      depth: parent.depth + 1,
    };

    const updated: WorkflowSnapshot = {
      ...snapshot,
      nodes: [
        ...snapshot.nodes.map((node) =>
          node.node_id === parent.node_id ? { ...node, child_ids: [...node.child_ids, nodeId] } : node,
        ),
        child,
      ],
    };
    await this.storage.save(updated);
    return updated;
  }
}
