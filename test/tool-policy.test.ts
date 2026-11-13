import { describe, expect, it } from 'vitest';
import { BASE_TOOLS, TOOL_KIND, type ToolEntry } from '../src/schema/tool-catalog';
import {
  TOOL_LIMIT_BY_KIND,
  countVisibleByKind,
  decideToolCall,
  mergeCatalog,
  renderCatalogText,
  summarizeArgs,
  summarizeDescription,
  validateToolRegistration,
  visibleTools,
} from '../src/engine/tool-policy';

const VERIFY_REPORT = BASE_TOOLS.find((entry) => entry.name === 'workflow_verify_report')!;
const MANUAL = BASE_TOOLS.find((entry) => entry.name === 'workflow_manual')!;

function extensionTool(overrides: Partial<ToolEntry> = {}): ToolEntry {
  return {
    name: 'check_deps_extra',
    description: '跑依赖检查。读 depcruise 产物。',
    kind: TOOL_KIND.extension,
    run: { kind: 'checker', checker: 'deps' },
    allowed_states: ['verifying'],
    effect: 'exec',
    parameters: { type: 'object', properties: {}, additionalProperties: true },
    version: 1,
    created_at: '2026-11-13T00:00:00.000Z',
    ...overrides,
  };
}

function registration(overrides: Record<string, unknown> = {}) {
  return {
    name: 'check_deps_extra',
    description: '跑依赖检查。读 depcruise 产物。',
    run: { kind: 'checker', checker: 'deps' },
    effect: 'exec',
    allowedStates: ['verifying'],
    parameters: MANUAL.parameters,
    parametersGiven: false,
    sampleArgs: {},
    existingNames: BASE_TOOLS.map((entry) => entry.name),
    verifyingCounts: { base: 0, extension: 0 },
    mode: 'create' as const,
    ...overrides,
  };
}

describe('decideToolCall：调用判定的唯一入口', () => {
  it('阶段不符：讨论中不能提交验收报备', () => {
    const decision = decideToolCall({ state: 'discussing', entry: VERIFY_REPORT, args: {} });
    expect(decision.allow).toBe(false);
    if (!decision.allow) {
      expect(decision.code).toBe('stage-denied');
      expect(decision.message).toContain('讨论中');
    }
  });

  it('缺必填参数：报备少了 result', () => {
    const decision = decideToolCall({ state: 'verifying', entry: VERIFY_REPORT, args: { item: '1' } });
    expect(decision.allow).toBe(false);
    if (!decision.allow) {
      expect(decision.code).toBe('arguments-invalid');
      expect(decision.message).toContain('result');
    }
  });

  it('枚举值不合法：result 只能是 pass / deferred', () => {
    const decision = decideToolCall({
      state: 'verifying',
      entry: VERIFY_REPORT,
      args: { item: '1', result: 'maybe', summary: 'x', anchors: [{ file: 'a.md' }] },
    });
    expect(decision.allow).toBe(false);
    if (!decision.allow) expect(decision.code).toBe('arguments-invalid');
  });

  it('扩展工具：宽松 schema，传空参数就过', () => {
    const decision = decideToolCall({ state: 'verifying', entry: extensionTool(), args: {} });
    expect(decision.allow).toBe(true);
  });

  it('扩展工具：阶段不符也拒', () => {
    const decision = decideToolCall({ state: 'discussing', entry: extensionTool(), args: {} });
    expect(decision.allow).toBe(false);
    if (!decision.allow) expect(decision.code).toBe('stage-denied');
  });
});

describe('validateToolRegistration：登记校验（产物只能是扩展工具）', () => {
  it('名字必须是 3~41 位小写字母/数字/下划线', () => {
    for (const name of ['x', 'Note', '带中文', 'a-b']) {
      const result = validateToolRegistration(registration({ name }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('name-invalid');
    }
  });

  it('重名被拒（基础工具名不能被占用）', () => {
    const result = validateToolRegistration(registration({ name: 'workflow_manual' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('name-duplicate');
  });

  it('run.kind 只能是 checker：脚本型登记已彻底移除', () => {
    const result = validateToolRegistration(registration({ run: { kind: 'action', action: 'manual' } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('run-invalid');
  });

  it('checker 必须是注册表里的 id', () => {
    const result = validateToolRegistration(registration({ run: { kind: 'checker', checker: 'nope' } }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('run-invalid');
      expect(result.message).toContain('可用的是');
    }
  });

  it('合法 checker：原样写进条目', () => {
    const result = validateToolRegistration(registration({ run: { kind: 'checker', checker: 'deps' } }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entry.run).toEqual({ kind: 'checker', checker: 'deps' });
  });

  it('effect 只能是三档之一', () => {
    const result = validateToolRegistration(registration({ effect: 'danger' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('effect-invalid');
  });

  it('allowed_states 不能为空、不能有未知状态', () => {
    for (const allowedStates of [[], ['doing']]) {
      const result = validateToolRegistration(registration({ allowedStates }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('states-invalid');
    }
  });

  it('扩展工具可以不声明 parameters：缺省宽松 schema', () => {
    const result = validateToolRegistration(registration({ parametersGiven: false }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.parameters).toEqual({ type: 'object', properties: {}, additionalProperties: true });
      expect(result.entry.kind).toBe(TOOL_KIND.extension);
    }
  });

  it('声明了 parameters 就按它校验 sample_args', () => {
    const result = validateToolRegistration(registration({
      parametersGiven: true,
      sampleArgs: { need: 'x' },
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('sample-args-invalid');
  });

  it(`扩展工具配额 ${TOOL_LIMIT_BY_KIND.extension}：新增超了就拒`, () => {
    const result = validateToolRegistration(registration({
      verifyingCounts: { base: 0, extension: TOOL_LIMIT_BY_KIND.extension },
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('quota-exceeded');
  });

  it('两套配额独立：基础满了不影响扩展工具登记', () => {
    const result = validateToolRegistration(registration({
      verifyingCounts: { base: TOOL_LIMIT_BY_KIND.base, extension: 0 },
    }));
    expect(result.ok).toBe(true);
  });

  it('配额只卡新增：update 不增加条数，满了也能改', () => {
    const result = validateToolRegistration(registration({
      verifyingCounts: { base: 0, extension: TOOL_LIMIT_BY_KIND.extension },
      mode: 'update',
    }));
    expect(result.ok).toBe(true);
  });

  it('配额只管验收中：只挂讨论中的扩展工具不受限', () => {
    const result = validateToolRegistration(registration({
      allowedStates: ['discussing'],
      verifyingCounts: { base: 0, extension: TOOL_LIMIT_BY_KIND.extension },
    }));
    expect(result.ok).toBe(true);
  });
});

describe('mergeCatalog / visibleTools / countVisibleByKind', () => {
  it('目录合并：扩展工具接在基础工具之后；与基础工具重名的丢掉', () => {
    const fake = extensionTool();
    const clash = extensionTool({ name: 'workflow_manual' });
    const catalog = mergeCatalog(BASE_TOOLS, [fake, clash]);
    expect(catalog.map((entry) => entry.name)).toContain('check_deps_extra');
    expect(catalog.filter((entry) => entry.name === 'workflow_manual')).toHaveLength(1);
  });

  it('按状态过滤：验收中看不到只在讨论中可用的工具', () => {
    const onlyDiscussing = extensionTool({ name: 'draft_note', allowed_states: ['discussing'] });
    const catalog = mergeCatalog(BASE_TOOLS, [onlyDiscussing, extensionTool()]);
    const verifying = visibleTools(catalog, 'verifying').map((entry) => entry.name);
    expect(verifying).toContain('check_deps_extra');
    expect(verifying).not.toContain('draft_note');
    const discussing = visibleTools(catalog, 'discussing').map((entry) => entry.name);
    expect(discussing).not.toContain('workflow_check');
    expect(discussing).not.toContain('check_deps_extra');
  });

  it('按 kind 计数：两类各自独立', () => {
    const catalog = mergeCatalog(BASE_TOOLS, [
      extensionTool(),
      extensionTool({ name: 'check_naming' }),
    ]);
    const counts = countVisibleByKind(catalog, 'verifying');
    expect(counts.extension).toBe(2);
    // 验收中可见的基础工具：advance / manual / check / verify_report / verify_check
    expect(counts.base).toBe(5);
  });
});

describe('renderCatalogText', () => {
  it('注入文本：一张表，不标类别、不分段', () => {
    const catalog = mergeCatalog(BASE_TOOLS, [extensionTool()]);
    const text = renderCatalogText(catalog, 'verifying');
    expect(text).toContain('workflow_advance');
    expect(text).toContain('必填：to');
    expect(text).toContain('check_deps_extra');
    expect(text).not.toContain('[登记]');
    expect(text).not.toContain('别名');
  });

  it('按状态变化：讨论中看不到报备工具', () => {
    const text = renderCatalogText(BASE_TOOLS, 'discussing');
    expect(text).not.toContain('workflow_verify_report');
    expect(text).toContain('workflow_manual');
  });

  it('参数摘要截断', () => {
    const text = summarizeArgs({ content: 'x'.repeat(500) }, 40);
    expect(text.length).toBeLessThanOrEqual(41);
    expect(text.endsWith('…')).toBe(true);
  });

  it('描述只取第一句，超长加省略号', () => {
    expect(summarizeDescription('第一句。第二句。')).toBe('第一句。');
    const long = summarizeDescription('啊'.repeat(200));
    expect(Array.from(long).length).toBeLessThanOrEqual(91);
    expect(long.endsWith('…')).toBe(true);
  });
});
