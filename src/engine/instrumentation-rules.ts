/**
 * 埋点计划的结构规则（领域层，纯函数）。
 *
 * 两条规则：
 *   - validateInstrumentation：把一份 tree + 节点 KV 判成 ok / findings。只判结构，
 *     不判「排查路径全不全、字段够不够」——那是 AI 的判断（协助型分工）。
 *   - diffNodes：拿扫描到的已有埋点和计划里的节点比，分出「回填即可」与「需要新埋」。
 *
 * 不碰 DOM、不读写全局、不碰文件：证据 JSON 由接口层读进来再喂这里。
 */
import type { CheckResult, CheckerFinding } from './checkers/types';
import {
  instrumentationKey,
  type ExistingInstrumentation,
  type InstrumentationInstrument,
  type InstrumentationPlan,
  type InstrumentationTreeNode,
} from '../schema/instrumentation';

/** 结构上限：深 / 每节点子节点 / 单棵总节点 / 节点 KV 总条数。默认值，可整体传入覆盖。 */
export interface InstrumentationLimits {
  maxDepth: number;
  maxChildren: number;
  maxTreeNodes: number;
  maxKvNodes: number;
}

export const INSTRUMENTATION_LIMITS: InstrumentationLimits = {
  maxDepth: 4,
  maxChildren: 5,
  maxTreeNodes: 50,
  maxKvNodes: 200,
};

/** 回填对比结果：planned 是全量 key，alreadyPresent 是已有埋点可回填的，toInsert 要新埋。 */
export interface InstrumentationDiff {
  planned: string[];
  alreadyPresent: string[];
  toInsert: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInstrument(value: unknown): value is InstrumentationInstrument {
  if (!isRecord(value)) return false;
  return typeof value.function === 'string' && value.function !== ''
    && typeof value.event === 'string' && value.event !== ''
    && typeof value.tree_version === 'number' && Number.isInteger(value.tree_version) && value.tree_version >= 1
    && (value.kind === 'path' || value.kind === 'field');
}

/** 防御性形状检查：异常深的嵌套直接判坏，不爆栈。 */
function isTreeNode(value: unknown, depth = 0): value is InstrumentationTreeNode {
  if (depth > 100) return false;
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && value.id !== ''
    && typeof value.label === 'string'
    && (value.instrument === undefined || isInstrument(value.instrument))
    && Array.isArray(value.children)
    && value.children.every((child) => isTreeNode(child, depth + 1));
}

function sameInstrument(a: InstrumentationInstrument, b: InstrumentationInstrument): boolean {
  return a.function === b.function && a.event === b.event
    && a.kind === b.kind && a.tree_version === b.tree_version;
}

/**
 * 判一份埋点计划。
 *
 * 检查项（全部确定性，对应方案里的结构校验）：
 *   1. 根 id 必须是 none；根不带埋点；bug 标签（根的直接子节点）不带埋点。
 *   2. 深度 ≤ maxDepth、每节点子节点 ≤ maxChildren、单棵总节点 ≤ maxTreeNodes。
 *   3. 路径节点（深度 ≥ 2）必须带埋点信息。
 *   4. 节点 KV 条数 ≤ maxKvNodes。
 *   5. 去重：树里同一 key（函数名+事件名）只能出现一次。
 *   6. KV 与树：树的每个埋点必须能在 KV 里找到且一致；KV 里的 path 节点必须挂在树上
 *      （field 白盒节点允许只在 KV）。
 *   7. 版本一致：所有节点 tree_version == 计划 tree_version。
 */
export function validateInstrumentation(
  raw: unknown,
  limits: InstrumentationLimits = INSTRUMENTATION_LIMITS,
): CheckResult {
  const findings: CheckerFinding[] = [];
  const stats: Record<string, number> = {};

  const root = isRecord(raw) ? raw.root : undefined;
  const nodes = isRecord(raw) ? raw.nodes : undefined;
  const planVersion = isRecord(raw) ? raw.tree_version : undefined;

  // 没建埋点计划（缺文件 / 缺 tree_version / 缺 root）：这不是「结构不合格」，是「这一层还没做」。
  // 返回 config_missing + note，避免验收时把它误判成「配置错了」。
  const hasPlan = typeof planVersion === 'number' && Number.isInteger(planVersion) && planVersion >= 1 && isTreeNode(root);
  if (!hasPlan) {
    return {
      ok: false,
      findings: [],
      stats: { config_missing: 1 },
      note: '缺埋点计划（.workflow/evidence/instrumentation.json 的 tree_version + tree.root）：这一层还没做，不算结构不合格；先按格式写 tree + 节点 KV 再跑',
    };
  }
  if (!isRecord(nodes)) {
    return {
      ok: false,
      findings: [],
      stats: { config_missing: 1 },
      note: '缺节点 KV（nodes）：埋点计划不完整，先补齐再跑',
    };
  }
  const expectedVersion = typeof planVersion === 'number' ? planVersion : root.instrument?.tree_version ?? 1;

  if (root.id !== 'none') {
    findings.push({ location: `root:${root.id}`, problem: '根节点 id 必须是 none' });
  }
  if (root.instrument !== undefined) {
    findings.push({ location: `root:${root.id}`, problem: '根节点只是标题，不该带埋点信息' });
  }

  let total = 0;
  let maxDepth = 0;
  let duplicates = 0;
  const treeKeys = new Set<string>();
  const reachableKeys = new Set<string>();

  const walk = (node: InstrumentationTreeNode, depth: number): void => {
    total += 1;
    if (depth > maxDepth) maxDepth = depth;
    if (node.children.length > limits.maxChildren) {
      findings.push({ location: node.id, problem: `子节点 ${node.children.length} 个，超过上限 ${limits.maxChildren}` });
    }
    if (depth >= 2 && node.instrument === undefined) {
      findings.push({ location: node.id, problem: '路径节点缺埋点信息（函数名 / 事件名）' });
    } else if (depth === 1 && node.instrument !== undefined) {
      findings.push({ location: node.id, problem: 'bug 标签节点只是标题，不该带埋点信息' });
    }
    if (node.instrument !== undefined) {
      const key = instrumentationKey(node.instrument.function, node.instrument.event);
      reachableKeys.add(key);
      if (treeKeys.has(key)) {
        duplicates += 1;
        findings.push({ location: node.id, problem: `重复埋点：同一落点 ${key} 在树上出现了多次` });
      } else {
        treeKeys.add(key);
      }
      const kv = nodes[key];
      if (!isInstrument(kv)) {
        findings.push({ location: node.id, problem: `KV 缺节点 ${key}（树上的埋点必须进 KV）` });
      } else if (!sameInstrument(node.instrument, kv)) {
        findings.push({ location: node.id, problem: `KV 与树节点不一致：${key}` });
      }
      if (node.instrument.tree_version !== expectedVersion) {
        findings.push({ location: node.id, problem: `版本不一致：节点是 v${node.instrument.tree_version}，计划是 v${expectedVersion}` });
      }
    }
    for (const child of node.children) walk(child, depth + 1);
  };
  walk(root, 0);

  if (maxDepth > limits.maxDepth) {
    findings.push({ location: 'tree', problem: `树深 ${maxDepth} 超过上限 ${limits.maxDepth}` });
  }
  if (total > limits.maxTreeNodes) {
    findings.push({ location: 'tree', problem: `树节点 ${total} 个，超过上限 ${limits.maxTreeNodes}` });
  }

  const kvKeys = Object.keys(nodes);
  if (kvKeys.length > limits.maxKvNodes) {
    findings.push({ location: 'instrumentation.json', problem: `节点 KV ${kvKeys.length} 条，超过上限 ${limits.maxKvNodes}` });
  }
  let orphans = 0;
  for (const key of kvKeys) {
    const kv = nodes[key];
    if (!isInstrument(kv)) {
      findings.push({ location: key, problem: 'KV 里的节点形状不合法' });
      continue;
    }
    if (kv.kind === 'path' && !reachableKeys.has(key)) {
      orphans += 1;
      findings.push({ location: key, problem: '孤儿节点：黑盒路径节点在 KV 里，但树上找不到它' });
    }
    if (kv.tree_version !== expectedVersion) {
      findings.push({ location: key, problem: `版本不一致：KV 节点是 v${kv.tree_version}，计划是 v${expectedVersion}` });
    }
  }

  return {
    ok: findings.length === 0,
    findings,
    stats: {
      tree_nodes: total,
      max_depth: maxDepth,
      kv_nodes: kvKeys.length,
      duplicates,
      orphans,
    },
  };
}

/**
 * 回填对比：已有埋点（扫描产物）vs 计划节点。
 *
 * 扫描靠 grep，只能稳定拿到事件名（logEvent message 的稳定前缀）与位置，拿不到所在函数名，
 * 所以这里按「事件名」匹配——这是 grep 方案的已知精度损失（方案里「已知可优化」一节记过）。
 * 同一事件名在别处埋过，就当作已存在、回填即可，不重复埋。
 */
export function diffNodes(
  existing: ExistingInstrumentation[],
  plan: InstrumentationPlan,
): InstrumentationDiff {
  const existingEvents = new Set(existing.map((item) => item.event).filter((event) => event !== ''));
  const planned = Object.keys(plan.nodes);
  const alreadyPresent: string[] = [];
  const toInsert: string[] = [];
  for (const key of planned) {
    const planNode = plan.nodes[key];
    if (planNode !== undefined && existingEvents.has(planNode.event)) alreadyPresent.push(key);
    else toInsert.push(key);
  }
  return { planned, alreadyPresent, toInsert };
}
