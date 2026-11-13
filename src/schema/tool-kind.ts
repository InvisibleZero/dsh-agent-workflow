/**
 * 工具分类：分类名只在这里定义，别处读标签表，不写死字面量。
 *
 * 单独成文件是为了客户端包瘦身：客户端只需要标签表，
 * 不需要为了它把整份工具目录（含 10 条工具描述）打进去。
 */

export const TOOL_KIND = { base: 'base', extension: 'extension' } as const;
export type ToolKind = (typeof TOOL_KIND)[keyof typeof TOOL_KIND];

export const TOOL_KIND_LABEL: Record<ToolKind, string> = {
  base: '基础工具',
  extension: '扩展工具',
};
