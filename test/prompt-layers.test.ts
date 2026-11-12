import { describe, expect, it } from 'vitest';
import { assemblePromptLayers, pickSessionManualParts } from '../src/engine/prompt-layers';

/** ASCII 文本：1 字 = 1 字节，方便把预算算清楚。 */
const ascii = (bytes: number): string => 'a'.repeat(bytes);

const HARD_TOTAL = 400; // header + hard-rules + shared-detail + state-detail + session-manual 的合计

/** 造一组八层输入：硬层合计 400 字节，软层按给定大小。 */
function layers(soft: { addition?: number; constraints?: number; cue?: number }): Array<{ name: string; text: string }> {
  return [
    { name: 'header', text: ascii(100) },
    { name: 'hard-rules', text: ascii(100) },
    { name: 'shared-detail', text: ascii(100) },
    { name: 'state-detail', text: ascii(50) },
    { name: 'session-manual', text: ascii(50) },
    { name: 'node-addition', text: soft.addition === undefined ? '' : ascii(soft.addition) },
    { name: 'constraints', text: soft.constraints === undefined ? '' : ascii(soft.constraints) },
    { name: 'manual-cue', text: soft.cue === undefined ? '' : ascii(soft.cue) },
  ];
}

describe('分层装配：按重要度丢段，不截尾', () => {
  it('刚好装下：一层都不丢', () => {
    const result = assemblePromptLayers(layers({ addition: 100, constraints: 100, cue: 100 }), HARD_TOTAL + 300);
    expect(result.dropped).toEqual([]);
    expect(result.keptBytes).toBe(HARD_TOTAL + 300);
    expect(result.layers.every((layer) => layer.dropped === false)).toBe(true);
  });

  it('超一点：只丢最不重要的那层（节点附加）', () => {
    const result = assemblePromptLayers(layers({ addition: 100, constraints: 100, cue: 100 }), HARD_TOTAL + 200);
    expect(result.dropped.map((item) => item.name)).toEqual(['node-addition']);
    expect(result.layers.find((layer) => layer.name === 'node-addition')?.text).toBe('');
    expect(result.truncated).toBe(true);
  });

  it('超很多：先丢节点附加和引导，约束 / 红线与硬层留着', () => {
    const result = assemblePromptLayers(layers({ addition: 100, constraints: 100, cue: 100 }), HARD_TOTAL + 100);
    expect(result.dropped.map((item) => item.name).sort()).toEqual(['manual-cue', 'node-addition']);
    expect(result.layers.find((layer) => layer.name === 'constraints')?.text).toBe(ascii(100));
  });

  it('硬层合计超预算：直接报错，不静默丢硬规则', () => {
    expect(() => assemblePromptLayers(layers({}), HARD_TOTAL - 1)).toThrow(/硬层合计 400 字节，超过总预算 399 字节/);
  });

  it('空手册 / 全空层：什么也不丢，总量为 0', () => {
    const result = assemblePromptLayers([], 8000);
    expect(result.layers).toEqual([]);
    expect(result.keptBytes).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('未知层名不会偷偷注入，记成 unknown-layer', () => {
    const result = assemblePromptLayers([{ name: 'surprise', text: ascii(10) }], 8000);
    expect(result.dropped).toEqual([{ name: 'surprise', bytes: 10, reason: 'unknown-layer' }]);
    expect(result.layers).toEqual([]);
  });
});

describe('会话手册按小节取用（不再取尾部 2000 字）', () => {
  const manual = [
    '# 会话手册',
    '',
    '## 方案（自底向上）',
    '### 1. 目标与验收',
    '把注入改成分层。',
    '',
    '### 2. 数据层',
    '三档上限。',
    '',
    '## 实施顺序',
    '- [ ] 数据层 —— 完成标准：单测过',
    '- [x] 领域层 —— 完成标准：单测过 ｜ 自检：跑 node test.mjs，12 项全过',
    '- [ ] 接口层 —— 完成标准：契约测试通过',
    '',
  ].join('\n');

  it('方案取全文、清单只给未勾项，已勾项只记账数', () => {
    const parts = pickSessionManualParts(manual);
    expect(parts.plan).toContain('### 1. 目标与验收');
    expect(parts.plan).toContain('### 2. 数据层');
    expect(parts.unchecked).toEqual(['数据层 —— 完成标准：单测过', '接口层 —— 完成标准：契约测试通过']);
    expect(parts.checkedCount).toBe(1);
    expect(parts.totalItems).toBe(3);
    expect(parts.hasPlan).toBe(true);
  });

  it('空手册：没有方案、没有清单', () => {
    const parts = pickSessionManualParts('');
    expect(parts.plan).toBe('');
    expect(parts.unchecked).toEqual([]);
    expect(parts.totalItems).toBe(0);
    expect(parts.hasPlan).toBe(false);
  });

  it('只有证据行没有正文时，方案仍算空', () => {
    const evidenceOnly = ['## 方案', '<!-- 注释 -->', '', '## 实施顺序', '- [x] x ｜ 自检：y'].join('\n');
    expect(pickSessionManualParts(evidenceOnly).hasPlan).toBe(false);
  });
});
