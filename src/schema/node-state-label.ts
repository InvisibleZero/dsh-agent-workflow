import type { NodeState } from './node-state';

/**
 * 状态中文名（UI 显示用）。
 *
 * 单独成文件的原因：客户端半（浏览器）要用这张表，但 `node-state.ts` 里
 * 有 zod 的运行时依赖，客户端模块表并不提供 zod。客户端只从这里取值，
 * 就不会把 zod 拖进浏览器包（否则整个客户端 entry 会在启动时失败）。
 */
export const NODE_STATE_LABEL: Record<NodeState, string> = {
  discussing: '讨论中',
  implementing: '实现中',
  verifying: '验收中',
  completed: '已完结',
};
