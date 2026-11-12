import { describe, expect, it } from 'vitest';
import {
  TAG_TABLE_MAX,
  dedupeTags,
  findEntryLineIndexes,
  normalizeTag,
  parseEntryLine,
  parseTagTable,
  renderEntryLine,
  renderTagTable,
  rewriteEntryTag,
} from '../src/engine/manual-tags';

describe('标签归一化', () => {
  it('去空白、英文小写、全角转半角', () => {
    expect(normalizeTag('  门禁  ')).toBe('门禁');
    expect(normalizeTag('Gate')).toBe('gate');
    expect(normalizeTag('ＧＡＴＥ')).toBe('gate');
    expect(normalizeTag('状 态 机')).toBe('状态机');
  });

  it('非法标签一律返回 null：空串、超长、含方括号/竖线、非字符串', () => {
    expect(normalizeTag('')).toBeNull();
    expect(normalizeTag('   ')).toBeNull();
    expect(normalizeTag('一'.repeat(13))).toBeNull();
    expect(normalizeTag('a[b')).toBeNull();
    expect(normalizeTag('a｜b')).toBeNull();
    expect(normalizeTag('a|b')).toBeNull();
    expect(normalizeTag(123)).toBeNull();
    // 12 个字是上限，正好可以
    expect(normalizeTag('一'.repeat(12))).toBe('一'.repeat(12));
  });

  it('去重保序', () => {
    expect(dedupeTags(['b', 'a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });
});

describe('标签表解析与渲染', () => {
  it('一行一个，`- ` 可有可无，脏行跳过、重复合并', () => {
    const body = ['- 门禁', '注入', '- Gate', '', '- gate', '坏｜标签'].join('\n');
    expect(parseTagTable(body)).toEqual(['门禁', '注入', 'gate']);
  });

  it('渲染成一行一个 `- 标签`，空表渲染成空串', () => {
    expect(renderTagTable(['门禁', 'gate'])).toBe('- 门禁\n- gate');
    expect(renderTagTable([])).toBe('');
  });

  it('上限常量是 30', () => {
    expect(TAG_TABLE_MAX).toBe(30);
  });
});

describe('条目行解析与渲染', () => {
  it('`- [a｜b] 正文` 往返一致', () => {
    const line = renderEntryLine(['门禁', '状态'], '现象：…；根因：…');
    expect(line).toBe('- [门禁｜状态] 现象：…；根因：…');
    expect(parseEntryLine(line)).toEqual({ tags: ['门禁', '状态'], text: '现象：…；根因：…' });
  });

  it('历史条目（没有标签）解析成 null，不算条目行', () => {
    expect(parseEntryLine('- 2026-11-12 旧条目')).toBeNull();
    expect(parseEntryLine('普通文字')).toBeNull();
  });

  it('标签重复时合并', () => {
    expect(parseEntryLine('- [a｜a｜b] 正文')?.tags).toEqual(['a', 'b']);
  });
});

describe('级联改名', () => {
  it('把一条命中的标签换掉，其他标签保留', () => {
    const line = '- [写门禁｜状态] 正文';
    expect(rewriteEntryTag(line, '写门禁', '门禁')).toBe('- [门禁｜状态] 正文');
  });

  it('目标标签已存在时合并，不重复', () => {
    const line = '- [写门禁｜门禁] 正文';
    expect(rewriteEntryTag(line, '写门禁', '门禁')).toBe('- [门禁] 正文');
  });

  it('没命中的条目原样返回（含历史条目）', () => {
    expect(rewriteEntryTag('- [注入] 正文', '门禁', '门禁2')).toBe('- [注入] 正文');
    expect(rewriteEntryTag('- 旧条目', '门禁', '门禁2')).toBe('- 旧条目');
  });
});

describe('按正文找条目', () => {
  const body = [
    '- [门禁] 状态表永不回填',
    '- 历史条目没有标签',
    '- [注入] 会话手册取尾部',
    '- [门禁] 状态表永不回填',
  ].join('\n');

  it('有标签和没标签的条目都能按正文命中', () => {
    expect(findEntryLineIndexes(body, '历史条目没有标签')).toEqual([1]);
    expect(findEntryLineIndexes(body, '会话手册取尾部')).toEqual([2]);
  });

  it('重复条目返回多个下标（由调用方报错，不猜）', () => {
    expect(findEntryLineIndexes(body, '状态表永不回填')).toEqual([0, 3]);
    expect(findEntryLineIndexes(body, '不存在的条目')).toEqual([]);
  });
});
