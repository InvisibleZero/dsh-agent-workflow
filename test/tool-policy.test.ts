import { describe, expect, it } from 'vitest';
import { BASE_TOOLS, type ToolCatalogEntry } from '../src/schema/tool-catalog';
import {
  decideToolCall,
  deriveAliasParameters,
  mergeArgs,
  mergeCatalog,
  renderCatalogText,
  summarizeArgs,
  validateAliasInput,
} from '../src/engine/tool-policy';

const VERIFY_REPORT = BASE_TOOLS.find((entry) => entry.name === 'workflow_verify_report')!;
const MANUAL = BASE_TOOLS.find((entry) => entry.name === 'workflow_manual')!;
const FIXED = { target: 'project', action: 'append_entry', section: '决策记录' };

function aliasEntry(overrides: Partial<ToolCatalogEntry> = {}): ToolCatalogEntry {
  return {
    name: 'note_decision',
    summary: '记一条决策',
    description: '记一条决策',
    base_tool: 'workflow_manual',
    fixed_args: { ...FIXED },
    parameters: deriveAliasParameters(MANUAL.parameters, FIXED),
    allowed_states: ['discussing', 'implementing', 'verifying', 'completed'],
    side_effect: 'write',
    alias: true,
    version: 1,
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

  it('覆盖固定参数：别名调用里又传了 target', () => {
    const decision = decideToolCall({ state: 'discussing', entry: aliasEntry(), args: { target: 'session', content: 'x', tags: ['决策'] } });
    expect(decision.allow).toBe(false);
    if (!decision.allow) {
      expect(decision.code).toBe('arguments-override');
      expect(decision.message).toContain('target');
    }
  });

  it('合法调用：别名只补剩余字段', () => {
    const decision = decideToolCall({ state: 'discussing', entry: aliasEntry(), args: { content: '决定 A', tags: ['决策'] } });
    expect(decision.allow).toBe(true);
  });
});

describe('deriveAliasParameters / mergeArgs', () => {
  it('固定键从 properties 与 required 里一起消失', () => {
    const derived = deriveAliasParameters(MANUAL.parameters, FIXED);
    expect(Object.keys(derived.properties)).not.toContain('target');
    expect(Object.keys(derived.properties)).not.toContain('action');
    expect(Object.keys(derived.properties)).not.toContain('section');
    expect(derived.required ?? []).toEqual(['target', 'action'].filter((key) => !(key in FIXED)));
    expect(Object.keys(derived.properties)).toEqual(expect.arrayContaining(['content', 'tags']));
  });

  it('固定值优先：调用参数里同名的键不会覆盖它', () => {
    expect(mergeArgs(FIXED, { content: 'x', target: 'session' })).toMatchObject({ target: 'project', content: 'x' });
  });
});

describe('validateAliasInput：四关校验', () => {
  const existing = BASE_TOOLS.map((entry) => entry.name);

  it('名字必须是 3~41 位小写字母/数字/下划线', () => {
    for (const name of ['x', 'Note', '带中文', 'a-b']) {
      const result = validateAliasInput({ name, description: 'x', baseTool: 'workflow_manual', fixedArgs: {}, allowedStates: null, sampleArgs: { target: 'session', action: 'read' }, existingNames: existing });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('name-invalid');
    }
  });

  it('重名被拒（基础工具名也不能占用）', () => {
    const result = validateAliasInput({ name: 'workflow_manual', description: 'x', baseTool: 'workflow_manual', fixedArgs: {}, allowedStates: null, sampleArgs: { target: 'session', action: 'read' }, existingNames: existing });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('name-duplicate');
  });

  it('别名不能挂别名（禁止链式）', () => {
    const result = validateAliasInput({ name: 'note_decision', description: 'x', baseTool: 'note_decision', fixedArgs: {}, allowedStates: null, sampleArgs: {}, existingNames: existing });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('base-tool-invalid');
  });

  it('固定参数必须是基础工具的参数', () => {
    const result = validateAliasInput({ name: 'note_decision', description: 'x', baseTool: 'workflow_manual', fixedArgs: { nope: 1 }, allowedStates: null, sampleArgs: { target: 'session', action: 'read' }, existingNames: existing });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fixed-args-invalid');
  });

  it('阶段不能放宽：报备只在验收中，别名不能声明讨论中可用', () => {
    const result = validateAliasInput({ name: 'early_report', description: 'x', baseTool: 'workflow_verify_report', fixedArgs: {}, allowedStates: ['discussing'], sampleArgs: { item: '1', result: 'pass', summary: 'x', anchors: [{ file: 'a.md' }] }, existingNames: existing });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('states-invalid');
  });

  it('样例参数必须满足基础工具的 schema', () => {
    const result = validateAliasInput({ name: 'note_decision', description: 'x', baseTool: 'workflow_manual', fixedArgs: { target: 'project' }, allowedStates: null, sampleArgs: { action: 'bogus' }, existingNames: existing });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('sample-args-invalid');
  });

  it('全过：返回去掉固定键后的参数与继承的阶段', () => {
    const result = validateAliasInput({ name: 'note_decision', description: '记一条决策', baseTool: 'workflow_manual', fixedArgs: { ...FIXED }, allowedStates: null, sampleArgs: { content: '决定 A', tags: ['决策'] }, existingNames: existing });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.allowedStates).toEqual(MANUAL.allowed_states);
      expect(Object.keys(result.parameters.properties)).not.toContain('target');
    }
  });
});

describe('mergeCatalog / renderCatalogText / summarizeArgs', () => {
  it('目录合并：别名挂到基础工具上，脏别名丢弃', () => {
    const alias = {
      tool_id: 't1',
      name: 'note_decision',
      description: '记一条决策',
      base_tool: 'workflow_manual',
      fixed_args: { ...FIXED },
      allowed_states: ['discussing' as const],
      created_at: '2026-11-13T00:00:00.000Z',
      version: 1,
    };
    const orphan = { ...alias, tool_id: 't2', name: 'orphan', base_tool: 'missing_tool' };
    const catalog = mergeCatalog(BASE_TOOLS, [alias, orphan]);
    expect(catalog.map((entry) => entry.name)).toContain('note_decision');
    expect(catalog.map((entry) => entry.name)).not.toContain('orphan');
    const merged = catalog.find((entry) => entry.name === 'note_decision')!;
    expect(merged.alias).toBe(true);
    expect(merged.side_effect).toBe('write');
    expect(merged.allowed_states).toEqual(['discussing']);
  });

  it('注入文本：包含基础工具、必填参数与别名', () => {
    const alias = {
      tool_id: 't1',
      name: 'note_decision',
      description: '记一条决策',
      base_tool: 'workflow_manual',
      fixed_args: { ...FIXED },
      allowed_states: ['discussing' as const],
      created_at: '2026-11-13T00:00:00.000Z',
      version: 1,
    };
    const text = renderCatalogText(mergeCatalog(BASE_TOOLS, [alias]));
    expect(text).toContain('workflow_advance');
    expect(text).toContain('必填：to');
    expect(text).toContain('note_decision');
    expect(text).toContain('别名');
  });

  it('参数摘要截断', () => {
    const text = summarizeArgs({ content: 'x'.repeat(500) }, 40);
    expect(text.length).toBeLessThanOrEqual(41);
    expect(text.endsWith('…')).toBe(true);
  });
});
