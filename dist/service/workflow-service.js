import { TreeStore } from '../engine/tree-store';
import { requestTransition, applyTransition, effectiveDetail } from '../engine/state-machine';
import { bubbleUp } from '../engine/aggregation';
import { cascadeInterrupt } from '../engine/interrupt';
import { routeFault } from '../engine/fault-router';
import { NaiveContextSummarizer } from '../adapter/context-summary';
import { randomUUID } from 'node:crypto';
/**
 * workflow 服务：把纯引擎包装成面向 agent 的「严格数据结构 / 工具」。
 * 状态只能经本服务的方法推进，禁止「改文档推进状态」。
 *
 * TODO(spike): 用 cordis 服务形式挂到 dsh harness 生命周期（见 index.ts），
 * 并把以下方法暴露成 agent 可调用的 workflow 工具（增删节点 / 流转状态 / 改操作细节）。
 */
export class WorkflowService {
    storage;
    runtime;
    ui;
    summarizer;
    tree = new TreeStore();
    snapshot;
    constructor(snapshot, storage, runtime, ui, summarizer = new NaiveContextSummarizer()) {
        this.storage = storage;
        this.runtime = runtime;
        this.ui = ui;
        this.summarizer = summarizer;
        this.snapshot = snapshot;
        // 按深度升序重建：先根后子，避免父节点尚未入树时 addChild 失败
        const ordered = [...snapshot.nodes].sort((a, b) => a.depth - b.depth);
        for (const node of ordered) {
            if (node.parent_id === null)
                this.tree.addRoot(node);
            else
                this.tree.addChild(node.parent_id, node);
        }
    }
    get settings() {
        return this.snapshot.settings;
    }
    get nodes() {
        return this.tree.toArray();
    }
    getNode(nodeId) {
        return this.tree.getNode(nodeId);
    }
    childrenOf(nodeId) {
        return this.tree.childrenOf(nodeId);
    }
    descendantsOf(nodeId) {
        return this.tree.descendantsOf(nodeId);
    }
    /** 节点当前状态的有效操作细节（A + B/C/D）与默认输入。 */
    getEffectiveDetail(nodeId) {
        const node = this.tree.getNode(nodeId);
        if (!node)
            throw new Error(`节点不存在：${nodeId}`);
        return effectiveDetail(node.current_state, node, this.snapshot.settings.global_operation_detail);
    }
    /** 子节点应接收的上下文 = 父节点私有上下文的精简摘要（不塞整棵树）。 */
    getChildContext(childId) {
        const child = this.tree.getNode(childId);
        if (!child || !child.parent_id)
            return '';
        const parent = this.tree.getNode(child.parent_id);
        if (!parent)
            return '';
        return this.summarizer.summarize(parent.context_payload);
    }
    /** workflow 工具面：把工具名分发到具体方法（agent 唯一入口）。 */
    async dispatchTool(name, args) {
        switch (name) {
            case 'workflow_add_node':
                return this.addNode(args.parent_id, args.node);
            case 'workflow_remove_node':
                return this.removeNode(args.node_id);
            case 'workflow_transition':
                return this.requestTransition(args.node_id, args.to);
            case 'workflow_report_fault':
                return this.reportFault(args.node_id, args.fault);
            case 'workflow_resolve_block':
                return this.resolveBlock(args.node_id);
            case 'workflow_list_nodes':
                return this.nodes;
            default:
                throw new Error(`未知工具：${name}`);
        }
    }
    /** 添加子节点（严格数据结构，走引擎，带深度熔断）。 */
    async addNode(parentId, node) {
        const r = this.tree.addChild(parentId, node);
        if (!r.ok)
            throw new Error(r.error);
        this.runtime.emit({ type: 'node_added', node_id: node.node_id, parent_id: parentId });
        await this.persist();
    }
    /** 移除节点及其全部子孙。 */
    async removeNode(nodeId) {
        const r = this.tree.remove(nodeId);
        if (!r.ok)
            throw new Error(r.error);
        this.runtime.emit({ type: 'node_removed', node_id: nodeId });
        await this.persist();
    }
    /** 申请状态流转：gated 走弹窗确认，auto 直接过。 */
    async requestTransition(nodeId, to) {
        const node = this.tree.getNode(nodeId);
        if (!node)
            throw new Error(`节点不存在：${nodeId}`);
        const req = requestTransition(node, to, this.snapshot.settings.global_operation_detail);
        if (req.kind === 'gated') {
            const ok = await this.ui.confirmTransition(req);
            if (!ok)
                return; // 用户取消，状态不变
        }
        const updated = applyTransition(node, to);
        this.tree.update(updated);
        this.ui.pushNodeState(nodeId, to);
        this.runtime.emit({ type: 'node_state_changed', node_id: nodeId, from: req.from, to });
        // 冒泡：子状态变化向上逐层聚合
        for (const u of bubbleUp(this.tree, nodeId, this.snapshot.settings.aggregation_mode)) {
            const parent = this.tree.getNode(u.node_id);
            if (parent) {
                this.tree.update({ ...parent, current_state: u.state });
                this.ui.pushNodeState(u.node_id, u.state);
            }
        }
        await this.persist();
        // 埋点 + 断点快照
        await this.trace(nodeId, 'transition', req.from, to);
        await this.storage.saveCheckpoint(nodeId, {
            current_state: to,
            context_payload: updated.context_payload,
            step_count: updated.step_count,
        });
        // 进入状态后触发默认输入（string，可空）
        const detail = effectiveDetail(to, updated, this.snapshot.settings.global_operation_detail);
        if (detail.enter_trigger) {
            await this.runtime.injectInput(detail.enter_trigger);
        }
    }
    /** 级联打断：父节点被打断，递归停所有子孙。 */
    async interrupt(nodeId) {
        await cascadeInterrupt((id) => this.tree.descendantsOf(id), nodeId, this.runtime);
    }
    /** 故障路由。 */
    routeFault(fault) {
        return routeFault(fault);
    }
    /** 报告故障：按类型路由；人审类标记 blocked。返回路由结果。 */
    async reportFault(nodeId, fault) {
        const node = this.tree.getNode(nodeId);
        if (!node)
            throw new Error(`节点不存在：${nodeId}`);
        const route = routeFault(fault);
        if (route === 'human_in_the_loop' && !node.flags.includes('blocked')) {
            this.tree.update({ ...node, flags: [...node.flags, 'blocked'] });
        }
        this.runtime.emit({ type: 'fault_routed', node_id: nodeId, route });
        await this.persist();
        await this.trace(nodeId, 'fault', node.current_state, node.current_state, fault);
        return route;
    }
    /** 人工解除阻塞。 */
    async resolveBlock(nodeId) {
        const node = this.tree.getNode(nodeId);
        if (!node)
            throw new Error(`节点不存在：${nodeId}`);
        if (node.flags.includes('blocked')) {
            this.tree.update({ ...node, flags: node.flags.filter((f) => f !== 'blocked') });
            await this.persist();
        }
    }
    /** 断点续传：从快照恢复某节点的上下文。 */
    async resume(nodeId) {
        const checkpoint = await this.storage.loadCheckpoint(nodeId);
        await this.runtime.resume(nodeId, checkpoint);
    }
    async trace(nodeId, action, stateFrom, stateTo, fault) {
        const log = {
            trace_id: randomUUID(),
            node_id: nodeId,
            action,
            latency_ms: 0,
            token_usage: { input_tokens: 0, output_tokens: 0 },
            state_from: stateFrom,
            state_to: stateTo,
            ...(fault ? { fault } : {}),
        };
        await this.storage.appendTrace(log);
    }
    async persist() {
        this.snapshot = { ...this.snapshot, nodes: this.tree.toArray() };
        await this.storage.save(this.snapshot);
    }
}
//# sourceMappingURL=workflow-service.js.map