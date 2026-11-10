import type { AgentNode } from '../schema/node';
import { assertCanDescend } from './circuit-breaker';

export type TreeResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** 组合模式的树容器：O(1) 按 id 索引，维护父子关系。 */
export class TreeStore {
  private readonly nodes = new Map<string, AgentNode>();
  private rootId: string | null = null;

  get root(): AgentNode | null {
    return this.rootId ? (this.nodes.get(this.rootId) ?? null) : null;
  }

  get size(): number {
    return this.nodes.size;
  }

  getNode(id: string): AgentNode | undefined {
    return this.nodes.get(id);
  }

  /** 添加根节点（父节点）。 */
  addRoot(node: AgentNode): TreeResult<void> {
    if (this.rootId) return { ok: false, error: '根节点已存在' };
    this.rootId = node.node_id;
    this.nodes.set(node.node_id, { ...node, parent_id: null });
    return { ok: true, value: undefined };
  }

  /** 添加子节点，强制 max_depth 熔断。 */
  addChild(parentId: string, child: AgentNode): TreeResult<void> {
    const parent = this.nodes.get(parentId);
    if (!parent) return { ok: false, error: `父节点不存在：${parentId}` };
    if (this.nodes.has(child.node_id)) return { ok: false, error: `节点 id 已存在：${child.node_id}` };
    try {
      assertCanDescend(parent, child.depth);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    this.nodes.set(child.node_id, { ...child, parent_id: parentId });
    const updated = this.nodes.get(parentId)!;
    this.nodes.set(parentId, { ...updated, child_ids: [...updated.child_ids, child.node_id] });
    return { ok: true, value: undefined };
  }

  /** 移除节点及其全部子孙。 */
  remove(nodeId: string): TreeResult<void> {
    if (!this.nodes.has(nodeId)) return { ok: false, error: `节点不存在：${nodeId}` };
    const doomed = this.descendantsOf(nodeId);
    doomed.push(nodeId);
    for (const id of doomed) this.nodes.delete(id);
    for (const [pid, parent] of this.nodes) {
      if (parent.child_ids.includes(nodeId)) {
        this.nodes.set(pid, { ...parent, child_ids: parent.child_ids.filter((x) => x !== nodeId) });
      }
    }
    if (this.rootId === nodeId) this.rootId = null;
    return { ok: true, value: undefined };
  }

  /** 直接子节点。 */
  childrenOf(nodeId: string): AgentNode[] {
    const parent = this.nodes.get(nodeId);
    if (!parent) return [];
    return parent.child_ids
      .map((id) => this.nodes.get(id))
      .filter((x): x is AgentNode => x !== undefined);
  }

  /** 全部子孙 id（先序 DFS，用于级联打断）。 */
  descendantsOf(nodeId: string): string[] {
    const out: string[] = [];
    const stack = [...(this.nodes.get(nodeId)?.child_ids ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      out.push(id);
      const child = this.nodes.get(id);
      if (child) stack.push(...child.child_ids);
    }
    return out;
  }

  /** 回写一个节点（引擎产出新对象后落回索引）。 */
  update(node: AgentNode): TreeResult<void> {
    if (!this.nodes.has(node.node_id)) return { ok: false, error: `节点不存在：${node.node_id}` };
    this.nodes.set(node.node_id, node);
    return { ok: true, value: undefined };
  }

  /** 全量导出（供持久化）。 */
  toArray(): AgentNode[] {
    return [...this.nodes.values()];
  }
}
