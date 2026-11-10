import { z } from 'zod';
import { AgentNode } from './node';
import { StateDetail } from './node-state';

/** 全局操作细节 = A（公共）+ B/C/D（三态专属），只在设置里改。 */
export const GlobalOperationDetail = z.object({
  shared_detail: z.string(),  // A：三态通用的公共操作细节
  /** 全局附加说明：所有状态都会追加在 A 后面，节点附加再追加在最后。 */
  global_additional: z.string().default(''),
  discussing: StateDetail,    // B
  implementing: StateDetail,  // C
  verifying: StateDetail,     // D
});
export type GlobalOperationDetail = z.infer<typeof GlobalOperationDetail>;

/** 父节点状态聚合方式。 */
export const AggregationMode = z.enum(['manual', 'all_complete', 'any_active']);
export type AggregationMode = z.infer<typeof AggregationMode>;

/** 全局设置（跨工作区默认）。 */
export const WorkflowSettings = z.object({
  global_operation_detail: GlobalOperationDetail,
  default_max_depth: z.number().int().positive(),
  default_max_steps: z.number().int().positive(),
  aggregation_mode: AggregationMode,
});
export type WorkflowSettings = z.infer<typeof WorkflowSettings>;

/** 持久化单元：一个 workflow 工作区的全量快照（根节点 parent_id 为 null）。 */
export const WorkflowSnapshot = z.object({
  version: z.literal(1),
  workspace_id: z.string(),
  title: z.string(),
  /** workflow 对应的本地工作目录（用户创建时选的那个文件夹）。可选，旧快照没有。 */
  working_directory: z.string().optional(),
  /**
   * 对应的宿主「目录工作区」id。workflow 工作区本身就是这个目录工作区，
   * 只是渲染走类型插件；旧快照没有该字段，靠 working_directory 反查。
   */
  host_workspace_id: z.string().optional(),
  /** 是否置顶（只影响侧栏排序）。可选，旧快照没有 = 未置顶。 */
  pinned: z.boolean().optional(),
  settings: WorkflowSettings,
  nodes: z.array(AgentNode),
});
export type WorkflowSnapshot = z.infer<typeof WorkflowSnapshot>;

/**
 * 内置通用示例预设（开源友好，不携带任何私有约定）。
 * 使用者可在设置里自行替换为符合自己场景的操作细节。
 */
export const DEFAULT_GLOBAL_OPERATION_DETAIL: GlobalOperationDetail = {
  // A —— 三态通用
  shared_detail: '结论先行、依据充分；对不确定处如实说明，不做无依据的判断。',
  // 全局附加（所有状态追加）
  global_additional: '',
  // B —— 讨论中
  discussing: {
    operation_detail: '梳理目标与现状，列出可选方案及各自取舍，暂不修改任何文件；待方案确认后再推进。',
    enter_trigger: null,
  },
  // C —— 实现中
  implementing: {
    operation_detail: '按已确认的方案实现；完成后用简明语言交代改了什么、影响范围、潜在风险。',
    enter_trigger: null,
  },
  // D —— 验收中
  verifying: {
    operation_detail: '逐项核对实现是否满足验收条件，检查回归与边界情况，记录问题与处理结果。',
    enter_trigger: null,
  },
};

export const DEFAULT_SETTINGS: WorkflowSettings = {
  global_operation_detail: DEFAULT_GLOBAL_OPERATION_DETAIL,
  default_max_depth: 8,
  default_max_steps: 200,
  aggregation_mode: 'manual',
};
