import { type FaultRoute } from '../engine/fault-router';
import type { WorkflowStoragePort, WorkflowRuntimePort, WorkflowUiPort, ContextSummaryPort } from '../adapter/port';
import type { WorkflowSnapshot } from '../schema/workflow';
import type { AgentNode } from '../schema/node';
import type { NodeState } from '../schema/node-state';
import type { WorkflowFault } from '../schema/fault';
/**
 * workflow 服务：把纯引擎包装成面向 agent 的「严格数据结构 / 工具」。
 * 状态只能经本服务的方法推进，禁止「改文档推进状态」。
 *
 * TODO(spike): 用 cordis 服务形式挂到 dsh harness 生命周期（见 index.ts），
 * 并把以下方法暴露成 agent 可调用的 workflow 工具（增删节点 / 流转状态 / 改操作细节）。
 */
export declare class WorkflowService {
    private readonly storage;
    private readonly runtime;
    private readonly ui;
    private readonly summarizer;
    private readonly tree;
    private snapshot;
    constructor(snapshot: WorkflowSnapshot, storage: WorkflowStoragePort, runtime: WorkflowRuntimePort, ui: WorkflowUiPort, summarizer?: ContextSummaryPort);
    get settings(): {
        global_operation_detail: {
            discussing: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            implementing: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            verifying: {
                operation_detail: string;
                enter_trigger: string | null;
            };
            shared_detail: string;
        };
        default_max_depth: number;
        default_max_steps: number;
        aggregation_mode: "manual" | "all_complete" | "any_active";
    };
    get nodes(): AgentNode[];
    getNode(nodeId: string): AgentNode | undefined;
    childrenOf(nodeId: string): AgentNode[];
    descendantsOf(nodeId: string): string[];
    /** 节点当前状态的有效操作细节（A + B/C/D）与默认输入。 */
    getEffectiveDetail(nodeId: string): {
        full_detail: string;
        enter_trigger: string | null;
    };
    /** 子节点应接收的上下文 = 父节点私有上下文的精简摘要（不塞整棵树）。 */
    getChildContext(childId: string): string;
    /** workflow 工具面：把工具名分发到具体方法（agent 唯一入口）。 */
    dispatchTool(name: string, args: Record<string, unknown>): Promise<unknown>;
    /** 添加子节点（严格数据结构，走引擎，带深度熔断）。 */
    addNode(parentId: string, node: AgentNode): Promise<void>;
    /** 移除节点及其全部子孙。 */
    removeNode(nodeId: string): Promise<void>;
    /** 申请状态流转：gated 走弹窗确认，auto 直接过。 */
    requestTransition(nodeId: string, to: NodeState): Promise<void>;
    /** 级联打断：父节点被打断，递归停所有子孙。 */
    interrupt(nodeId: string): Promise<void>;
    /** 故障路由。 */
    routeFault(fault: WorkflowFault): FaultRoute;
    /** 报告故障：按类型路由；人审类标记 blocked。返回路由结果。 */
    reportFault(nodeId: string, fault: WorkflowFault): Promise<FaultRoute>;
    /** 人工解除阻塞。 */
    resolveBlock(nodeId: string): Promise<void>;
    /** 断点续传：从快照恢复某节点的上下文。 */
    resume(nodeId: string): Promise<void>;
    private trace;
    private persist;
}
//# sourceMappingURL=workflow-service.d.ts.map