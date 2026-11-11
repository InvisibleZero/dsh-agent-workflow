"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = exports.DEFAULT_GLOBAL_OPERATION_DETAIL = exports.WorkflowSnapshot = exports.WorkflowSettings = exports.AggregationMode = exports.GlobalOperationDetail = exports.HardRules = void 0;
const zod_1 = require("zod");
const node_1 = require("./node");
const node_state_1 = require("./node-state");
/** 硬规则：插件层强制的阶段约束，不随「操作细节」一起编辑；可覆盖但需警告。 */
exports.HardRules = zod_1.z.object({
    discussing: zod_1.z.string().optional(),
    implementing: zod_1.z.string().optional(),
    verifying: zod_1.z.string().optional(),
});
/** 全局操作细节 = A（公共）+ B/C/D（三态专属）+ 硬规则覆盖，只在设置里改。 */
exports.GlobalOperationDetail = zod_1.z.object({
    shared_detail: zod_1.z.string(), // A：三态通用的公共操作细节
    discussing: node_state_1.StateDetail, // B
    implementing: node_state_1.StateDetail, // C
    verifying: node_state_1.StateDetail, // D
    /** 硬规则覆盖值；缺省 = 用 DEFAULT_HARD_RULES。 */
    hard_rules: exports.HardRules.optional(),
});
/** 父节点状态聚合方式。 */
exports.AggregationMode = zod_1.z.enum(['manual', 'all_complete', 'any_active']);
/** 全局设置（跨工作区默认）。 */
exports.WorkflowSettings = zod_1.z.object({
    global_operation_detail: exports.GlobalOperationDetail,
    default_max_depth: zod_1.z.number().int().positive(),
    default_max_steps: zod_1.z.number().int().positive(),
    aggregation_mode: exports.AggregationMode,
});
/** 持久化单元：一个 workflow 工作区的全量快照（根节点 parent_id 为 null）。 */
exports.WorkflowSnapshot = zod_1.z.object({
    version: zod_1.z.literal(2),
    workspace_id: zod_1.z.string(),
    title: zod_1.z.string(),
    /** workflow 对应的本地工作目录（用户创建时选的那个文件夹）。可选，旧快照没有。 */
    working_directory: zod_1.z.string().optional(),
    /**
     * 对应的宿主「目录工作区」id。workflow 工作区本身就是这个目录工作区，
     * 只是渲染走类型插件；旧快照没有该字段，靠 working_directory 反查。
     */
    host_workspace_id: zod_1.z.string().optional(),
    /** 是否置顶（只影响侧栏排序）。可选，旧快照没有 = 未置顶。 */
    pinned: zod_1.z.boolean().optional(),
    settings: exports.WorkflowSettings,
    nodes: zod_1.z.array(node_1.AgentNode),
});
/**
 * 内置预设（默认 A/B/C/D）：工作流方法论——
 * 结论先行 + 讨论中三段式方案 + 实现中按「实施顺序」逐层落地 + 验收检查表。
 * 使用者可在设置里替换成自己的操作细节；这份只是出厂默认。
 */
exports.DEFAULT_GLOBAL_OPERATION_DETAIL = {
    // A —— 三态通用
    shared_detail: `你在某个 workflow 节点的某个阶段工作：当前状态决定本阶段做什么，不要越过它去做下一阶段的事。

结论先行，不确定就说不确定，不要编一个听起来合理的因果。

改动前先读原文；没读过的文件不要声称知道它是什么样。`,
    // B —— 讨论中
    discussing: {
        operation_detail: `本阶段只讨论，不动手改代码或文件。

给出三段：

1. 目标与现状：把问题压缩成一句话，列出已知约束和已有做法。

2. 可选方案：至少两个，每个写清做法、代价、风险。

3. 取舍与建议：选哪个、为什么、还有哪些分叉点没定。

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
        operation_detail: `本阶段只核对与报告，不改代码。

交一张检查表，一行一项：

｜验收项｜结果（通过 / 不通过）｜证据（命令输出、日志、文件位置、界面现象）｜

另外必须写两段：

1. 回归：列出可能被影响的原有行为，逐项说明怎么确认没坏。

2. 遗留风险与未做项：说清是什么、影响什么、什么时候该处理。

没有证据的「通过」不算通过；不要用「应该没问题」收尾。

发现必须修的问题，说明后回到实现中阶段。`,
        enter_trigger: '开始验收：逐条对照验收条件，给我通过/不通过和证据。',
    },
};
exports.DEFAULT_SETTINGS = {
    global_operation_detail: exports.DEFAULT_GLOBAL_OPERATION_DETAIL,
    default_max_depth: 8,
    default_max_steps: 200,
    aggregation_mode: 'manual',
};
//# sourceMappingURL=workflow.js.map