"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NODE_TYPE_LABEL = exports.AgentNode = void 0;
const zod_1 = require("zod");
const node_state_1 = require("./node-state");
/**
 * 万能节点（组合模式）：workspace / feature / task 共用一套结构。
 * context_payload 是节点私有上下文，绝不向上级透传（防止上下文窗口爆炸）。
 */
exports.AgentNode = zod_1.z.object({
    node_id: zod_1.z.string(),
    parent_id: zod_1.z.string().nullable(), // 根节点为 null
    /**
     * 节点显示名。可选：旧快照没有，UI 回退到 node_type。
     * （根节点的 title 与 WorkflowSnapshot.title 一致，不重复写也行。）
     */
    title: zod_1.z.string().optional(),
    /**
     * 该节点绑定的 dsh 会话 id：点节点行时打开这个会话；没有则新建一个再写回。
     * 可选：旧快照没有这个字段，第一次点击时才写入。
     */
    session_id: zod_1.z.string().optional(),
    node_type: zod_1.z.enum(['workspace', 'feature', 'task']),
    current_state: node_state_1.NodeState,
    child_ids: zod_1.z.array(zod_1.z.string()),
    context_payload: zod_1.z.unknown(),
    /** 横切标志（如 blocked = 异常阻塞待人审）。 */
    flags: zod_1.z.array(node_state_1.NodeFlag).default([]),
    /**
     * 子节点对「自己当前状态」专属细节的覆盖。
     * 键只能是活跃态，值覆盖该态的专属细节（不动公共 A）。
     * 父节点（workspace 根）不写此字段。
     */
    state_detail_overrides: zod_1.z.object({
        discussing: node_state_1.StateDetail.optional(),
        implementing: node_state_1.StateDetail.optional(),
        verifying: node_state_1.StateDetail.optional(),
    }).optional(),
    /**
     * 节点级「附加说明」：不改全局设置，只在本节点当前状态后面追加一段。
     * 与覆盖相反——是纯增量，删掉就回到全局原样。
     * `global` 是这个节点的「全局附加」：不管当前什么状态都追加。
     */
    additional_detail: zod_1.z.object({
        global: zod_1.z.string().optional(),
        discussing: zod_1.z.string().optional(),
        implementing: zod_1.z.string().optional(),
        verifying: zod_1.z.string().optional(),
    }).optional(),
    // —— 防御性约束 ——
    depth: zod_1.z.number().int().nonnegative(),
    max_depth: zod_1.z.number().int().positive(),
    step_count: zod_1.z.number().int().nonnegative(),
    max_steps: zod_1.z.number().int().positive(),
});
exports.NODE_TYPE_LABEL = {
    workspace: '工作区',
    feature: '特性',
    task: '任务',
};
//# sourceMappingURL=node.js.map