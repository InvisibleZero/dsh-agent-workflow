"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = exports.DEFAULT_GLOBAL_OPERATION_DETAIL = exports.WorkflowSnapshot = exports.WorkflowSettings = exports.AggregationMode = exports.GlobalOperationDetail = void 0;
const zod_1 = require("zod");
const node_1 = require("./node");
const node_state_1 = require("./node-state");
/** 全局操作细节 = A（公共）+ B/C/D（三态专属），只在设置里改。 */
exports.GlobalOperationDetail = zod_1.z.object({
    shared_detail: zod_1.z.string(), // A：三态通用的公共操作细节
    /** 全局附加说明：所有状态都会追加在 A 后面，节点附加再追加在最后。 */
    global_additional: zod_1.z.string().default(''),
    discussing: node_state_1.StateDetail, // B
    implementing: node_state_1.StateDetail, // C
    verifying: node_state_1.StateDetail, // D
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
    version: zod_1.z.literal(1),
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
 * 内置通用示例预设（开源友好，不携带任何私有约定）。
 * 使用者可在设置里自行替换为符合自己场景的操作细节。
 */
exports.DEFAULT_GLOBAL_OPERATION_DETAIL = {
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
exports.DEFAULT_SETTINGS = {
    global_operation_detail: exports.DEFAULT_GLOBAL_OPERATION_DETAIL,
    default_max_depth: 8,
    default_max_steps: 200,
    aggregation_mode: 'manual',
};
//# sourceMappingURL=workflow.js.map