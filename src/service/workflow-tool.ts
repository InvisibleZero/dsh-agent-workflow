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
export const WORKFLOW_TOOL_SPECS: readonly WorkflowToolSpec[] = [
  {
    name: 'workflow_add_node',
    description: '在工作区树中添加一个子节点（带深度熔断）',
    params: [
      { name: 'parent_id', type: 'string', description: '父节点 ID', required: true },
      { name: 'node', type: 'object', description: '新节点对象（AgentNode）', required: true },
    ],
  },
  {
    name: 'workflow_remove_node',
    description: '移除节点及其全部子孙',
    params: [{ name: 'node_id', type: 'string', description: '节点 ID', required: true }],
  },
  {
    name: 'workflow_transition',
    description: '流转节点状态（gated 需用户确认；blocked 节点会被拒绝）',
    params: [
      { name: 'node_id', type: 'string', description: '节点 ID', required: true },
      { name: 'to', type: 'string', description: '目标状态', required: true },
    ],
  },
  {
    name: 'workflow_report_fault',
    description: '报告节点故障：系统异常可重试走 retry，AI 语义异常标 blocked 待人审',
    params: [
      { name: 'node_id', type: 'string', description: '节点 ID', required: true },
      { name: 'fault', type: 'object', description: '故障对象（WorkflowFault）', required: true },
    ],
  },
  {
    name: 'workflow_resolve_block',
    description: '解除节点阻塞',
    params: [{ name: 'node_id', type: 'string', description: '节点 ID', required: true }],
  },
  {
    name: 'workflow_list_nodes',
    description: '列出工作区全部节点',
    params: [],
  },
];

export type WorkflowToolName = (typeof WORKFLOW_TOOL_SPECS)[number]['name'];
