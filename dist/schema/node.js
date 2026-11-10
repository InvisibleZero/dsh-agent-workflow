import { z } from 'zod';
import { NodeState, StateDetail, NodeFlag } from './node-state';
/**
 * 万能节点（组合模式）：workspace / feature / task 共用一套结构。
 * context_payload 是节点私有上下文，绝不向上级透传（防止上下文窗口爆炸）。
 */
export const AgentNode = z.object({
    node_id: z.string(),
    parent_id: z.string().nullable(), // 根节点为 null
    /**
     * 节点显示名。可选：旧快照没有，UI 回退到 node_type。
     * （根节点的 title 与 WorkflowSnapshot.title 一致，不重复写也行。）
     */
    title: z.string().optional(),
    /**
     * 该节点绑定的 dsh 会话 id：点节点行时打开这个会话；没有则新建一个再写回。
     * 可选：旧快照没有这个字段，第一次点击时才写入。
     */
    session_id: z.string().optional(),
    node_type: z.enum(['workspace', 'feature', 'task']),
    current_state: NodeState,
    child_ids: z.array(z.string()),
    context_payload: z.unknown(),
    /** 横切标志（如 blocked = 异常阻塞待人审）。 */
    flags: z.array(NodeFlag).default([]),
    /**
     * 子节点对「自己当前状态」专属细节的覆盖。
     * 键只能是活跃态，值覆盖该态的专属细节（不动公共 A）。
     * 父节点（workspace 根）不写此字段。
     */
    state_detail_overrides: z.object({
        discussing: StateDetail.optional(),
        implementing: StateDetail.optional(),
        verifying: StateDetail.optional(),
    }).optional(),
    // —— 防御性约束 ——
    depth: z.number().int().nonnegative(),
    max_depth: z.number().int().positive(),
    step_count: z.number().int().nonnegative(),
    max_steps: z.number().int().positive(),
});
export const NODE_TYPE_LABEL = {
    workspace: '工作区',
    feature: '特性',
    task: '任务',
};
//# sourceMappingURL=node.js.map