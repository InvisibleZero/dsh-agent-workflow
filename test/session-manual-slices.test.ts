import { describe, expect, it } from 'vitest';
import { pickSessionManualParts } from '../src/engine/prompt-layers';
import {
  accumulateContracts,
  composePerLayerPlan,
  extractContract,
  parseSummary,
  pickCurrentLayer,
  pickPerLayerPlan,
  pickPerLayerPlanFromManual,
  splitPlanSections,
} from '../src/engine/session-manual-slices';

const manual = [
  '# 会话手册',
  '',
  '## 方案（自底向上）',
  '### 1. 目标与验收',
  '【总】做 X。',
  '【分】1、做 A。',
  '',
  '### 2. 垂直切片',
  '切一条链路。',
  '层间契约：只暴露「按层注入」最小闭环。',
  '',
  '### 3. 数据层',
  'ManualLimits 改。',
  '层间契约：只暴露 load/saveManualLimits。',
  '',
  '### 4. 领域层',
  '纯函数。',
  '层间契约：只暴露 pickCurrentLayer。',
  '',
  '### 5. 接口层',
  '门禁。',
  '层间契约：只做事件→action 映射。',
  '',
  '### 6. 表现层',
  'UI。',
  '层间契约：只消费只读状态。',
  '',
  '## 实施顺序',
  '- [x] 垂直切片 —— 完成标准：端到端跑通 ｜ 自检：跑通',
  '- [ ] 数据层 —— 完成标准：能读写、迁移可跑',
  '- [ ] 领域层 —— 完成标准：逻辑独立可测',
  '- [ ] 接口层 —— 完成标准：契约测试通过',
  '- [ ] 表现层 —— 完成标准：build + smoke 通过',
  '',
].join('\n');

const planBody = '### 1. 目标与验收\n【总】做 X。\n\n### 2. 垂直切片\n切链路。\n层间契约：只暴露最小闭环。\n\n### 3. 数据层\n改配置。\n层间契约：只暴露 load。';
const items = [
  { label: '垂直切片 —— 完成标准：端到端跑通', done: true },
  { label: '数据层 —— 完成标准：能读写', done: false },
  { label: '领域层 —— 完成标准：逻辑独立可测', done: false },
];

describe('垂直切片：按层注入的最小闭环', () => {
  it('splitPlanSections 把方案正文切成 6 节', () => {
    const sections = splitPlanSections('### 1. 目标与验收\nA\n### 2. 垂直切片\nB\n### 3. 数据层\nC');
    expect(sections.map((section) => section.title)).toEqual(['目标与验收', '垂直切片', '数据层']);
    expect(sections[1]?.body).toBe('B');
  });

  it('extractContract 抽「层间契约」正文、不带前缀', () => {
    expect(extractContract('切链路。\n层间契约：只暴露最小闭环。')).toBe('只暴露最小闭环。');
    expect(extractContract('没有契约')).toBe('');
  });

  it('pickPerLayerPlan：目标 + 当前层（第一个未勾）+ 已完成层契约', () => {
    const plan = pickPerLayerPlan(planBody, items);
    expect(plan.goal).toContain('【总】做 X。');
    expect(plan.currentTitle).toBe('数据层');
    expect(plan.currentBody).toContain('改配置。');
    expect(plan.contracts).toEqual([{ label: '垂直切片', contract: '只暴露最小闭环。' }]);
  });

  it('composePerLayerPlan：只含目标 + 当前层 + 契约，不含未勾且非当前的层', () => {
    const text = composePerLayerPlan(pickPerLayerPlan(planBody, items));
    expect(text).toContain('### 1. 目标与验收');
    expect(text).toContain('### 当前层：数据层');
    expect(text).toContain('已完成层契约：');
    expect(text).toContain('- 垂直切片：只暴露最小闭环。');
    expect(text).not.toContain('领域层');
    expect(text).not.toContain('### 2. 垂直切片');
  });

  it('pickPerLayerPlanFromManual + pickSessionManualParts 端到端接通', () => {
    const parts = pickSessionManualParts(manual);
    expect(parts.plan).toContain('### 1. 目标与验收');
    expect(parts.plan).toContain('### 当前层：数据层');
    expect(parts.plan).toContain('- 垂直切片：只暴露「按层注入」最小闭环。');
    // 未勾且非当前的层不注入
    expect(parts.plan).not.toContain('### 4. 领域层');
    expect(parts.plan).not.toContain('### 6. 表现层');
    expect(parts.unchecked.length).toBe(4);
    expect(parts.checkedCount).toBe(1);
  });

  it('全部勾完：没有当前层，只留目标 + 全部契约', () => {
    const allDone = items.map((item) => ({ ...item, done: true }));
    const text = composePerLayerPlan(pickPerLayerPlan(planBody, allDone));
    expect(text).not.toContain('当前层');
    expect(text).toContain('已完成层契约');
  });
});

describe('领域层：pickCurrentLayer / accumulateContracts / parseSummary', () => {
  const sections = splitPlanSections(planBody);

  it('pickCurrentLayer：第一个未勾层；全勾完返回 undefined', () => {
    expect(pickCurrentLayer(sections, items)?.title).toBe('数据层');
    const allDone = items.map((item) => ({ ...item, done: true }));
    expect(pickCurrentLayer(sections, allDone)).toBeUndefined();
  });

  it('accumulateContracts：只收已完成层的契约', () => {
    expect(accumulateContracts(sections, items)).toEqual([
      { label: '垂直切片', contract: '只暴露最小闭环。' },
    ]);
  });

  it('parseSummary：总分解析（【总】+ 编号分项）', () => {
    const goal = '【总】做 X。\n【分】\n1、做 A。\n2、做 B。\n3、不做 C。';
    const parsed = parseSummary(goal);
    expect(parsed.summary).toBe('做 X。');
    expect(parsed.items).toEqual(['做 A。', '做 B。', '不做 C。']);
  });

  it('parseSummary：裸文本兜底成总述、编号行照样拆分项', () => {
    const parsed = parseSummary('一段没有【总】的老文本。\n1、第一条。\n2、第二条。');
    expect(parsed.summary).toBe('一段没有【总】的老文本。');
    expect(parsed.items).toEqual(['第一条。', '第二条。']);
  });
});
