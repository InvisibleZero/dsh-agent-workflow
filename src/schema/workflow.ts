import { z } from 'zod';
import { AgentNode } from './node';
import { StateDetail } from './node-state';

/** 硬规则：插件层强制的阶段约束，不随「操作细节」一起编辑；可覆盖但需警告。 */
export const HardRules = z.object({
  discussing: z.string().optional(),
  implementing: z.string().optional(),
  verifying: z.string().optional(),
});
export type HardRules = z.infer<typeof HardRules>;

/** 全局操作细节 = A（公共）+ B/C/D（三态专属）+ 硬规则覆盖，只在设置里改。 */
export const GlobalOperationDetail = z.object({
  shared_detail: z.string(),  // A：三态通用的公共操作细节
  discussing: StateDetail,    // B
  implementing: StateDetail,  // C
  verifying: StateDetail,     // D
  /** 硬规则覆盖值；缺省 = 用 DEFAULT_HARD_RULES。 */
  hard_rules: HardRules.optional(),
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
  version: z.literal(2),
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
 * 内置预设（默认 A/B/C/D）：工作流方法论——
 * 结论先行 + 讨论中三段式方案 + 实现中按「实施顺序」逐层落地 + 验收检查表。
 * 使用者可在设置里替换成自己的操作细节；这份只是出厂默认。
 */
export const DEFAULT_GLOBAL_OPERATION_DETAIL: GlobalOperationDetail = {
  // A —— 三态通用
  shared_detail: `你在某个 workflow 节点的某个阶段工作：当前状态决定本阶段做什么，不要越过它去做下一阶段的事。

结论先行，不确定就说不确定，不要编一个听起来合理的因果。

改动前先读原文；没读过的文件不要声称知道它是什么样。

交付三项（动了文件 / 数据就必须交代，缺一项算没交付完）：
① 按用户看得见的东西点名改了哪些模块（页签 / 卡片 / 按钮 / 文件），只报函数名或文件名＝不合格；
② 数据流向：改前谁写谁读、改后谁写谁读、哪条写入被切断或新增；「内部逻辑调整了一下」＝不合格；
③ 给 1~3 个真实的坑 + 怎么复核（看哪里、看哪个值）；「应该没问题」＝不合格。

提建议必附「已知可优化但没做」：逐条写 是什么现象 / 能省多少 / 代价或风险 / 这次为什么没做；宁可多列一条被否掉。`,
  // B —— 讨论中
  discussing: {
    operation_detail: `本阶段只讨论，不动手改代码或文件。

默认「先对齐」：我没说要方案时，不列方案清单、不催推进；只复述目标、指出待澄清处、记录结论、等下一步。

我说「给方案」「怎么选」「有什么选项」「展开说说」时，才按三段输出：1. 目标与现状 2. 可选方案（至少两个，做法、代价、风险）3. 取舍与建议。

需要先确认的地方单独列出来，等人确认后再推进。`,
    enter_trigger: null,
  },
  // C —— 实现中
  implementing: {
    operation_detail: `本阶段按已确认的方案落地。

先读后改：只改与目标相关的文件，改动越少越好。

每处改动说明三件事：改了哪个文件、为什么改、会影响什么。

完成后给出验证方式：怎么运行、看什么输出、什么算通过。

实现中发现方案有洞，停下来说明，不要自行扩大范围。`,
    enter_trigger: '先读会话手册「实施顺序」，按未勾的第一层开始实现，完成一层勾掉再继续。',
  },
  // D —— 验收中
  verifying: {
    operation_detail: `本阶段以核对为主；发现问题可以直接修，但要在该项报备里注明改了什么、影响哪些验收项。

另外必须写两段：

1. 回归：列出可能被影响的原有行为，逐项说明怎么确认没坏。

2. 遗留风险与未做项：说清是什么、影响什么、什么时候该处理。

发现必须修的问题，能就地修的修掉并在报备里注明；改动较大或方案本身有问题时，说明后回到实现中阶段（返工要带 reason）。`,
    enter_trigger: '开始验收：逐条对照验收条件，给我通过/不通过和证据。',
  },
};

export const DEFAULT_SETTINGS: WorkflowSettings = {
  global_operation_detail: DEFAULT_GLOBAL_OPERATION_DETAIL,
  default_max_depth: 8,
  default_max_steps: 200,
  aggregation_mode: 'manual',
};
