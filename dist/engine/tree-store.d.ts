import type { AgentNode } from '../schema/node';
export type TreeResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: string;
};
/** 组合模式的树容器：O(1) 按 id 索引，维护父子关系。 */
export declare class TreeStore {
    private readonly nodes;
    private rootId;
    get root(): AgentNode | null;
    get size(): number;
    getNode(id: string): AgentNode | undefined;
    /** 添加根节点（父节点）。 */
    addRoot(node: AgentNode): TreeResult<void>;
    /** 添加子节点，强制 max_depth 熔断。 */
    addChild(parentId: string, child: AgentNode): TreeResult<void>;
    /** 移除节点及其全部子孙。 */
    remove(nodeId: string): TreeResult<void>;
    /** 直接子节点。 */
    childrenOf(nodeId: string): AgentNode[];
    /** 全部子孙 id（先序 DFS，用于级联打断）。 */
    descendantsOf(nodeId: string): string[];
    /** 回写一个节点（引擎产出新对象后落回索引）。 */
    update(node: AgentNode): TreeResult<void>;
    /** 全量导出（供持久化）。 */
    toArray(): AgentNode[];
}
//# sourceMappingURL=tree-store.d.ts.map