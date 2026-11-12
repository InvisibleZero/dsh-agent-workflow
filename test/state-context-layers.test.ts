import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { registerWorkflowStateContext } from '../src/host/workflow-state-context';
import { PROMPT_LAYER_SPECS } from '../src/engine/prompt-layers';
import { DEFAULT_HARD_RULES } from '../src/schema/hard-rules';

/** 假宿主：只需要 logger / on / inject 三样，够把注册路径跑通。 */
function makeRuntime() {
  const logs: string[] = [];
  const warns: string[] = [];
  const handlers = new Map<string, any>();
  const globalContexts: any[] = [];
  const ctx = {
    logger: {
      info: (message: string) => logs.push(message),
      warn: (message: string) => warns.push(message),
    },
    on: (event: string, handler: any) => { handlers.set(event, handler); },
    inject: (_names: string[], callback: (scoped: any) => any) => {
      const scoped = {
        effect: (factory: () => any) => factory(),
        systemPrompt: {
          context: (spec: any) => { globalContexts.push(spec); return () => {}; },
        },
      };
      callback(scoped);
    },
  };
  return { ctx, logs, warns, handlers, globalContexts };
}

describe('分层注入（与真机同一条注册/求值路径）', () => {
  let dir: string;
  let workDir: string;
  let repo: WorkflowRepository;
  let workflowId: string;
  const sessionId = 'session-layers-test';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-layers-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-layers-work-'));
    repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: workDir });
    workflowId = created.id;
    await repo.bindSession({ id: workflowId, nodeId: workflowId, sessionId });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  /** 起上下文、模拟 agent/created，返回作用域里注册的 8 个槽位。 */
  async function mount() {
    const runtime = makeRuntime();
    const api = registerWorkflowStateContext(runtime.ctx, repo, () => true);
    const scopedSpecs: any[] = [];
    const agentScope = {
      systemPrompt: {
        context: (spec: any) => { scopedSpecs.push(spec); return () => {}; },
      },
    };
    runtime.handlers.get('agent/created').call(agentScope, { agent: { session: { id: sessionId } } });
    return { runtime, api, scopedSpecs };
  }

  it('八层各注册一个槽位，名字与顺序跟 PROMPT_LAYER_SPECS 对齐', async () => {
    const { scopedSpecs } = await mount();
    expect(scopedSpecs.map((spec) => spec.name)).toEqual(PROMPT_LAYER_SPECS.map((item) => `workflow:${item.name}`));
    expect(scopedSpecs.map((spec) => spec.order)).toEqual(PROMPT_LAYER_SPECS.map((item) => item.order));
  });

  it('硬规则层全文在场；会话手册只给方案 + 未勾项（已勾项不重复注入）', async () => {
    await repo.replaceManualSection({
      workflowId, nodeId: workflowId, section: '方案',
      content: '### 目标与验收\n目标：把注入改成分层。\n\n### 数据层\n三档上限。',
    });
    await repo.replaceManualSection({
      workflowId, nodeId: workflowId, section: '实施顺序',
      content: '- [ ] 数据层 —— 完成标准：单测过\n- [ ] 领域层 —— 完成标准：单测过',
    });
    await repo.setChecklistItem({
      workflowId, nodeId: workflowId, label: '领域层 —— 完成标准：单测过', done: true, evidence: '跑了 12 项全过',
    });

    const { api, scopedSpecs } = await mount();
    await api.refreshNow(sessionId);
    const textOf = (name: string) => scopedSpecs.find((spec) => spec.name === `workflow:${name}`).text();

    expect(textOf('hard-rules')).toContain(DEFAULT_HARD_RULES.discussing);
    expect(textOf('shared-detail')).toContain('结论先行');
    expect(textOf('state-detail')).toContain('本阶段只讨论');

    const sessionManual = textOf('session-manual');
    expect(sessionManual).toContain('目标：把注入改成分层');
    expect(sessionManual).toContain('数据层 —— 完成标准：单测过');
    expect(sessionManual).toContain('未勾 1 条 / 共 2 条');
    expect(sessionManual).not.toContain('跑了 12 项全过');
  });

  it('约束 / 红线常驻注入；其他三节只给一句「去文件里查」的引导', async () => {
    await repo.replaceManualSection({ workflowId, nodeId: null, section: '约束', content: '不许改 dist 产物后不回写 src。' });
    await repo.replaceManualSection({ workflowId, nodeId: null, section: '决策记录', content: '决策：选多槽位而不是加大预算。' });

    const { api, scopedSpecs } = await mount();
    await api.refreshNow(sessionId);
    const textOf = (name: string) => scopedSpecs.find((spec) => spec.name === `workflow:${name}`).text();

    expect(textOf('constraints')).toContain('不许改 dist 产物后不回写 src');
    expect(textOf('constraints')).not.toContain('决策：选多槽位');
    expect(textOf('manual-cue')).toContain('项目手册');
    expect(textOf('manual-cue')).toContain('项目总览 / 决策记录 / 坑与防线');
    expect(textOf('manual-cue')).not.toContain('决策：选多槽位');
  });

  it('约束超 300 字（手改文件绕过闸门）：注入侧截断并记 warn，不静默骗人', async () => {
    const oversized = '禁'.repeat(400);
    const manualPath = join(workDir, '.workflow', '项目手册.md');
    await writeFile(manualPath, `# 项目手册\n\n## 约束 / 红线\n${oversized}\n`, 'utf8');

    const { api, runtime, scopedSpecs } = await mount();
    await api.refreshNow(sessionId);
    const constraints = scopedSpecs.find((spec) => spec.name === 'workflow:constraints').text();

    expect(constraints).toContain('已截断，全文见项目手册文件');
    expect(constraints.length).toBeLessThan(oversized.length);
    expect(runtime.warns.some((line) => line.includes('constraints clipped'))).toBe(true);
  });

  it('会话手册写满接近上限时，硬规则层仍然完整（不会被挤掉）', async () => {
    // 方案 1200 字 + 清单约 600 字 ≈ 1900 字，逼近整本 2000 字上限。
    await repo.replaceManualSection({ workflowId, nodeId: workflowId, section: '方案', content: '方'.repeat(1200) });
    const longItems = Array.from({ length: 8 }, (_, index) => `- [ ] 第 ${index + 1} 层 —— 完成标准：${'标'.repeat(50)}`).join('\n');
    await repo.replaceManualSection({ workflowId, nodeId: workflowId, section: '实施顺序', content: longItems });

    const { api, scopedSpecs } = await mount();
    const joined = await api.refreshNow(sessionId);

    expect(joined).toContain(DEFAULT_HARD_RULES.discussing);
    expect(scopedSpecs.find((spec) => spec.name === 'workflow:hard-rules').text()).toContain('（收尾）讨论阶段不写手册也不会卡住');
    // 总量受 8000 字节预算约束，但不该以丢掉硬层为代价。
    expect(Buffer.byteLength(joined, 'utf8')).toBeLessThanOrEqual(8000);
  });

  it('标签表为空时不注入这一层；有标签时注入且 ≤600 字节', async () => {
    const { api, scopedSpecs } = await mount();
    await api.refreshNow(sessionId);
    const tagsSpec = scopedSpecs.find((spec) => spec.name === 'workflow:manual-tags');
    expect(tagsSpec).toBeDefined();
    expect(tagsSpec.text()).toBe('');

    await repo.appendProjectEntry({ workflowId, section: '坑与防线', tags: ['门禁', '注入'], content: '条目' });
    await api.refreshNow(sessionId);
    const text = tagsSpec.text();
    expect(text).toContain('标签表');
    expect(text).toContain('门禁 / 注入');
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(600);
  });

  it('标签表超 600 字节时截断并记 warn（模型只看到半个词表必须留痕）', async () => {
    const manyTags = Array.from({ length: 30 }, (_, index) => `${'甲乙丙丁戊'.repeat(2)}${String(index).padStart(2, '0')}`);
    await repo.appendProjectEntry({ workflowId, section: '坑与防线', tags: manyTags, content: '一次登记 30 个长标签' });

    const { api, runtime, scopedSpecs } = await mount();
    await api.refreshNow(sessionId);
    const text = scopedSpecs.find((spec) => spec.name === 'workflow:manual-tags').text();
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(600 + 32);
    expect(text).toContain('已截断');
    expect(runtime.warns.some((line) => line.includes('tag layer truncated'))).toBe(true);
  });

  it('汇总埋点带 budget 与 headroom：能看出离满载还有多少', async () => {
    const { api, runtime } = await mount();
    await api.refreshNow(sessionId);
    const summary = runtime.logs.find((line) => line.includes('state-context ok'));
    expect(summary).toContain('budget=8000');
    expect(summary).toMatch(/headroom=\d+/);
    expect(summary).toContain('dropped=0');
  });
});
