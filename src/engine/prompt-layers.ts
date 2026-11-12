/**
 * 系统提示的「分层装配」：把每段上下文当成独立一层，按裁切优先级丢段，而不是拼成一坨再截尾。
 *
 * 为什么不截尾：截尾是"谁写在后面谁先死"，跟内容重要程度无关。
 * 之前实测会话手册占到 7078/8000 字节，再写一点就轮到「收尾提醒」被砍——
 * 恰恰是"永远该在"的东西最先消失。
 *
 * 纯函数、无 IO：给一组层文本 + 总预算，算出保留哪些、丢了哪些。
 */
import { parseChecklist, parseHasPlan, pickSectionBody } from './manual-parse';
import { countUtf8Bytes } from './text-budget';

export interface PromptLayerSpec {
  /** 层名：同时用作系统提示里 context 名后缀（workflow:<name>）。 */
  name: string;
  /** 挂载顺序：越小越靠前（贴系统提示头部）。 */
  order: number;
  /** 硬层：永不裁；挤不下就整体报错，不允许"悄悄少一条硬规则"。 */
  hard: boolean;
  /** 裁切优先级：数字越大越先被丢。硬层的值不参与排序。 */
  priority: number;
}

/**
 * 八层。顺序 = 用户认可的那条：硬规则 → 全局细节 → 状态细节 → 节点附加 → 约束 → 手册引导 → 会话手册。
 *
 * 会话手册标记为硬层，但它**自带降级**（先丢已勾项，再砍方案后半），
 * 所以即使它很大会先在自身内部瘦身，而不是整层消失。
 */
export const PROMPT_LAYER_SPECS: PromptLayerSpec[] = [
  { name: 'header', order: 130, hard: true, priority: 0 },
  { name: 'hard-rules', order: 140, hard: true, priority: 0 },
  { name: 'shared-detail', order: 145, hard: true, priority: 0 },
  { name: 'state-detail', order: 150, hard: true, priority: 0 },
  { name: 'node-addition', order: 155, hard: false, priority: 3 },
  { name: 'verify-progress', order: 156, hard: false, priority: 1 },
  { name: 'constraints', order: 160, hard: false, priority: 1 },
  { name: 'manual-tags', order: 162, hard: false, priority: 2 },
  { name: 'manual-cue', order: 165, hard: false, priority: 2 },
  { name: 'session-manual', order: 170, hard: true, priority: 0 },
];

/** 标签表这一层的预算：标签本来就该短，超了说明表该合并了。 */
export const TAG_LAYER_BUDGET_BYTES = 600;

/** 会话手册这一层自己的预算：超了先丢已勾项，再砍方案后半（见 workflow-state-context 的渲染）。 */
export const SESSION_MANUAL_BUDGET_BYTES = 4600;

export interface PromptLayerInput {
  name: string;
  text: string;
}

export interface PromptLayerState {
  name: string;
  order: number;
  /** 被丢掉时为空串（挂载的 context 仍然在，只是不出内容）。 */
  text: string;
  bytes: number;
  dropped: boolean;
}

export interface PromptAssembly {
  /** 按 order 升序；被丢的层也在里面，text 为空串。 */
  layers: PromptLayerState[];
  keptBytes: number;
  dropped: Array<{ name: string; bytes: number; reason: string }>;
  /** 有任何一层因为超预算被丢掉。 */
  truncated: boolean;
}

/**
 * 按预算装配各层。
 *
 * 规则：硬层全部保留（合计超预算直接抛错，属于配置问题，不能静默）；
 * 软层按 priority 从高到低丢，丢到装得下就停。
 */
export function assemblePromptLayers(input: PromptLayerInput[], budgetBytes: number): PromptAssembly {
  const specs = [...PROMPT_LAYER_SPECS].sort((left, right) => left.order - right.order);
  const textOf = new Map<string, string>();
  for (const layer of input) textOf.set(layer.name, layer.text ?? '');

  const known = new Set(specs.map((spec) => spec.name));
  const dropped: PromptAssembly['dropped'] = input
    .filter((layer) => !known.has(layer.name) && (layer.text ?? '').trim() !== '')
    .map((layer) => ({ name: layer.name, bytes: countUtf8Bytes(layer.text), reason: 'unknown-layer' }));

  const rows = specs.map((spec) => {
    const text = (textOf.get(spec.name) ?? '').trim();
    return { spec, text, bytes: countUtf8Bytes(text) };
  });

  const hardRows = rows.filter((row) => row.spec.hard && row.text !== '');
  const softRows = rows.filter((row) => !row.spec.hard && row.text !== '');
  const hardBytes = hardRows.reduce((sum, row) => sum + row.bytes, 0);
  if (hardBytes > budgetBytes) {
    throw new Error(
      `硬层合计 ${hardBytes} 字节，超过总预算 ${budgetBytes} 字节：请精简阶段硬规则或操作细节（这几层不允许被裁）。`,
    );
  }

  // 先从最不重要的软层丢起；同样优先级时按 order 从后往前（靠后的更可丢）。
  const dropOrder = [...softRows].sort((left, right) => {
    if (right.spec.priority !== left.spec.priority) return right.spec.priority - left.spec.priority;
    return right.spec.order - left.spec.order;
  });

  let keptBytes = hardBytes + softRows.reduce((sum, row) => sum + row.bytes, 0);
  const droppedNames = new Set<string>();
  // 从最不重要的软层开始丢，丢到装得下就停：重要的层不会因为"它自己装不下"先死。
  for (const row of dropOrder) {
    if (keptBytes <= budgetBytes) break;
    droppedNames.add(row.spec.name);
    keptBytes -= row.bytes;
    dropped.push({ name: row.spec.name, bytes: row.bytes, reason: 'over-budget' });
  }

  const layers = rows
    .filter((row) => row.text !== '')
    .map((row) => ({
      name: row.spec.name,
      order: row.spec.order,
      text: droppedNames.has(row.spec.name) ? '' : row.text,
      bytes: row.bytes,
      dropped: droppedNames.has(row.spec.name),
    }));

  return { layers, keptBytes, dropped, truncated: droppedNames.size > 0 };
}

/** 会话手册拆出来的三块：方案全文、未勾条目、已勾条数。 */
export interface SessionManualParts {
  plan: string;
  unchecked: string[];
  checkedCount: number;
  totalItems: number;
  hasPlan: boolean;
}

/**
 * 按小节取会话手册用于注入的部分。
 *
 * 不再取"尾部 2000 字"：尾部保住的是最新勾选，砍掉的却是方案开头（目标与验收）——
 * 实现中恰恰是开头在指导干活。
 */
export function pickSessionManualParts(manual: string): SessionManualParts {
  const items = parseChecklist(manual);
  const unchecked = items.filter((item) => !item.done).map((item) => item.label);
  const plan = pickSectionBody(manual, ['方案']);
  return {
    plan,
    unchecked,
    checkedCount: items.filter((item) => item.done).length,
    totalItems: items.length,
    hasPlan: parseHasPlan(manual),
  };
}
