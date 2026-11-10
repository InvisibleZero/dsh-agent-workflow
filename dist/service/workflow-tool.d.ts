/** 单个工具参数的自描述。 */
export interface WorkflowToolParam {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object';
    description: string;
    required: boolean;
}
/** 工具自描述（workflow 工具面的冻结契约）。 */
export interface WorkflowToolSpec {
    name: string;
    description: string;
    params: WorkflowToolParam[];
}
/**
 * agent 可调用的 workflow 工具清单。
 * 这是「严格数据结构 / 工具」的对外契约：状态只能经这些工具推进，禁止改文档推进状态。
 */
export declare const WORKFLOW_TOOL_SPECS: readonly WorkflowToolSpec[];
export type WorkflowToolName = (typeof WORKFLOW_TOOL_SPECS)[number]['name'];
//# sourceMappingURL=workflow-tool.d.ts.map