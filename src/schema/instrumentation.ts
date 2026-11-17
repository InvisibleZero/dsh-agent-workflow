/**
 * 埋点计划的证据模型（第 6 项「埋点检测」专用）。
 *
 * 两个数据结构：
 *   - tree：黑盒排查路径树。根固定 none；根的子节点是 bug 标签（只当标题，本身不埋）；
 *           bug 之下递归「路径 = 埋点」节点，每个路径节点带函数名 / 事件名 / 树版本。
 *   - nodes：节点 KV，key = 函数名 + 事件名；黑盒路径节点与白盒字段节点都进这里去重。
 *
 * 只放类型与纯函数，不引 zod、不碰 node 内置模块（保持 schema 层惯例）。
 */

export type InstrumentationKind = 'path' | 'field';

/** 一个埋点节点：黑盒路径节点（path）或白盒字段节点（field）。 */
export interface InstrumentationInstrument {
  /** 落点函数名。 */
  function: string;
  /** 事件名：黑盒用 logEvent message 的稳定前缀，白盒用字段名。 */
  event: string;
  /** 树版本：结构变化才 +1。 */
  tree_version: number;
  /** 节点类型。 */
  kind: InstrumentationKind;
}

/** 树节点：根 none / bug 标签 / 递归「路径 = 埋点」。 */
export interface InstrumentationTreeNode {
  /** 树内唯一 id（parent 引用与定位用）。 */
  id: string;
  /** 显示名：bug 节点是 bug 名，路径节点是排查分支名。 */
  label: string;
  /** 埋点信息：bug 标签节点没有；路径 / 字段节点有。 */
  instrument?: InstrumentationInstrument;
  /** 子节点（递归）。 */
  children: InstrumentationTreeNode[];
}

/** 埋点计划证据：tree + 节点 KV。 */
export interface InstrumentationPlan {
  /** 树版本。 */
  tree_version: number;
  /** 根节点（id 固定 'none'）。 */
  root: InstrumentationTreeNode;
  /** 节点 KV：key = `${function}::${event}`，全量去重索引。 */
  nodes: Record<string, InstrumentationInstrument>;
}

/** 扫描产物：代码里已有的埋点调用点（回填时用，避免重复埋）。 */
export interface ExistingInstrumentation {
  /** 从 logEvent message 里抽出的稳定事件名；抽不出时给空串。 */
  event: string;
  /** 调用点位置：文件:行。 */
  location: string;
}

/** KV 的去重键：函数名 + 事件名。 */
export function instrumentationKey(fn: string, event: string): string {
  return `${fn}::${event}`;
}
