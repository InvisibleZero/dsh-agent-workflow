import { describe, expect, it } from 'vitest';
import { diffNodes, validateInstrumentation } from '../src/engine/instrumentation-rules';
import type { InstrumentationPlan } from '../src/schema/instrumentation';

type AnyNode = InstrumentationPlan['root'];

function node(kind: 'path' | 'field', fn: string, event: string, version = 1) {
  return { function: fn, event, tree_version: version, kind };
}

function pathNode(id: string, label: string, fn: string, event: string, children: AnyNode[] = []): AnyNode {
  return { id, label, instrument: node('path', fn, event), children };
}

/** 合法样例：根 none → bug → 路径 → 子路径（全是埋点），KV 与树一致。 */
function makePlan(): InstrumentationPlan {
  return {
    tree_version: 1,
    root: {
      id: 'none',
      label: 'none',
      children: [{
        id: 'bug-1',
        label: '验收没使用工具',
        children: [
          pathNode('path-1', '门禁没起作用', 'invokeVerifyReport', 'gate check', [
            pathNode('path-2', '提示没到位', 'buildVerifyPrompt', 'verify prompt'),
          ]),
        ],
      }],
    },
    nodes: {
      'invokeVerifyReport::gate check': node('path', 'invokeVerifyReport', 'gate check'),
      'buildVerifyPrompt::verify prompt': node('path', 'buildVerifyPrompt', 'verify prompt'),
    },
  };
}

describe('领域层：validateInstrumentation 合法样例', () => {
  it('结构合法的计划判通过，stats 给出计数', () => {
    const result = validateInstrumentation(makePlan());
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.stats).toMatchObject({ tree_nodes: 4, max_depth: 3, kv_nodes: 2, duplicates: 0, orphans: 0 });
  });

  it('空树（只有根 none）也判通过：没东西要埋是合法结果', () => {
    const plan: InstrumentationPlan = { tree_version: 1, root: { id: 'none', label: 'none', children: [] }, nodes: {} };
    expect(validateInstrumentation(plan).ok).toBe(true);
  });
});

describe('领域层：validateInstrumentation 各类违规', () => {
  it('根 id 不是 none、根带埋点都报', () => {
    const plan = makePlan();
    plan.root.id = 'root';
    plan.root.instrument = node('path', 'x', 'y');
    const problems = validateInstrumentation(plan).findings.map((item) => item.problem).join('\n');
    expect(problems).toContain('根节点 id 必须是 none');
    expect(problems).toContain('根节点只是标题');
  });

  it('bug 标签带埋点报', () => {
    const plan = makePlan();
    plan.root.children[0]!.instrument = node('path', 'x', 'y');
    const problems = validateInstrumentation(plan).findings.map((item) => item.problem).join('\n');
    expect(problems).toContain('bug 标签节点只是标题');
  });

  it('路径节点缺埋点信息报', () => {
    const plan = makePlan();
    delete plan.root.children[0]!.children[0]!.instrument;
    const problems = validateInstrumentation(plan).findings.map((item) => item.problem).join('\n');
    expect(problems).toContain('路径节点缺埋点信息');
  });

  it('深度超上限报', () => {
    const plan = makePlan();
    // 当前 max_depth=3，挂到 5 层
    let tail = plan.root.children[0]!.children[0]!;
    for (let i = 0; i < 3; i += 1) {
      const child = pathNode(`deep-${i}`, `深${i}`, 'f', `e-${i}`);
      tail.children.push(child);
      tail = child;
      plan.nodes[`f::e-${i}`] = node('path', 'f', `e-${i}`);
    }
    const problems = validateInstrumentation(plan).findings.map((item) => item.problem).join('\n');
    expect(problems).toContain('超过上限 4');
  });

  it('子节点超上限报', () => {
    const plan = makePlan();
    const bug = plan.root.children[0]!;
    for (let i = 0; i < 5; i += 1) {
      const child = pathNode(`wide-${i}`, `宽${i}`, 'f', `w-${i}`);
      bug.children.push(child);
      plan.nodes[`f::w-${i}`] = node('path', 'f', `w-${i}`);
    }
    const problems = validateInstrumentation(plan).findings.map((item) => item.problem).join('\n');
    expect(problems).toContain('超过上限 5');
  });

  it('重复埋点（同一 key 出现两次）报', () => {
    const plan = makePlan();
    plan.root.children[0]!.children.push(pathNode('dup', '重复', 'invokeVerifyReport', 'gate check'));
    const problems = validateInstrumentation(plan).findings.map((item) => item.problem).join('\n');
    expect(problems).toContain('重复埋点');
  });

  it('树上的埋点不在 KV 里报', () => {
    const plan = makePlan();
    delete plan.nodes['invokeVerifyReport::gate check'];
    const problems = validateInstrumentation(plan).findings.map((item) => item.problem).join('\n');
    expect(problems).toContain('KV 缺节点');
  });

  it('黑盒 path 节点只在 KV、不在树上：报孤儿', () => {
    const plan = makePlan();
    plan.nodes['lonely::orphan event'] = node('path', 'lonely', 'orphan event');
    const problems = validateInstrumentation(plan).findings.map((item) => item.problem).join('\n');
    expect(problems).toContain('孤儿节点');
  });

  it('白盒 field 节点只在 KV、不在树上：不算孤儿', () => {
    const plan = makePlan();
    plan.nodes['whites::field event'] = node('field', 'whites', 'field event');
    expect(validateInstrumentation(plan).ok).toBe(true);
  });

  it('版本不一致报', () => {
    const plan = makePlan();
    plan.tree_version = 2;
    const problems = validateInstrumentation(plan).findings.map((item) => item.problem).join('\n');
    expect(problems).toContain('版本不一致');
  });

  it('证据不是计划形状时判坏，不抛错', () => {
    expect(validateInstrumentation(null).ok).toBe(false);
    expect(validateInstrumentation({}).ok).toBe(false);
    expect(validateInstrumentation('nope').ok).toBe(false);
  });
});

describe('领域层：diffNodes 回填对比', () => {
  it('已有事件算回填、没有的算要新埋', () => {
    const plan = makePlan();
    const diff = diffNodes([{ event: 'gate check', location: 'src/a.ts:10' }], plan);
    expect(diff.planned.sort()).toEqual(['buildVerifyPrompt::verify prompt', 'invokeVerifyReport::gate check']);
    expect(diff.alreadyPresent).toEqual(['invokeVerifyReport::gate check']);
    expect(diff.toInsert).toEqual(['buildVerifyPrompt::verify prompt']);
  });

  it('扫描为空时全部要新埋', () => {
    const diff = diffNodes([], makePlan());
    expect(diff.alreadyPresent).toEqual([]);
    expect(diff.toInsert).toHaveLength(2);
  });

  it('事件名为空不参与匹配', () => {
    const plan = makePlan();
    const diff = diffNodes([{ event: '', location: 'x' }], plan);
    expect(diff.alreadyPresent).toEqual([]);
  });
});

describe('领域层：缺计划（config_missing）与结构不合格要分开', () => {
  it('缺计划（null / 空对象 / 字符串）：config_missing，findings 为空', () => {
    for (const raw of [null, {}, 'nope']) {
      const result = validateInstrumentation(raw);
      expect(result.ok).toBe(false);
      expect(result.findings).toHaveLength(0);
      expect(result.stats.config_missing).toBe(1);
      expect(result.note).toContain('埋点计划');
    }
  });

  it('有计划但根 id 不是 none：有 findings，不是 config_missing', () => {
    const plan = makePlan();
    plan.root.id = 'root';
    const result = validateInstrumentation(plan);
    expect(result.ok).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.stats.config_missing ?? 0).toBe(0);
  });
});
