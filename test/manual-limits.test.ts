import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MANUAL_LIMITS,
  assertSectionLimit,
  assertSessionManualTotal,
  countManualChars,
  sanitizeManualLimits,
  stripManualEvidence,
} from '../src/schema/manual-limits';

describe('手册字数上限（按字判，证据不计入）', () => {
  it('默认三档是 300 / 1200 / 2000', () => {
    expect(DEFAULT_MANUAL_LIMITS).toEqual({
      constraints_chars: 300,
      plan_chars: 1200,
      session_total_chars: 2000,
    });
  });

  it('约束：300 字放行、301 字拒绝，报错带「现在 / 上限 / 超了」三数', () => {
    const limits = { ...DEFAULT_MANUAL_LIMITS };
    expect(assertSectionLimit('约束', 'x'.repeat(300), limits)).toBe(300);
    expect(() => assertSectionLimit('约束', 'x'.repeat(301), limits))
      .toThrow(/现在 301 字，上限 300 字，超 1 字/);
  });

  it('方案：1200 字放行、1201 字拒绝', () => {
    const limits = { ...DEFAULT_MANUAL_LIMITS };
    expect(assertSectionLimit('方案', 'x'.repeat(1200), limits)).toBe(1200);
    expect(() => assertSectionLimit('方案', 'x'.repeat(1201), limits))
      .toThrow(/现在 1201 字，上限 1200 字，超 1 字/);
  });

  it('勾选证据（｜ 自检：…）不计入字数', () => {
    const limits = { ...DEFAULT_MANUAL_LIMITS };
    const withEvidence = `${'x'.repeat(300)} ｜ 自检：${'y'.repeat(500)}`;
    expect(countManualChars(withEvidence)).toBe(300 + 6 + 500);
    expect(stripManualEvidence(withEvidence)).toBe('x'.repeat(300));
    // 300 字方案 + 500 字证据：仍然放行
    expect(assertSectionLimit('方案', withEvidence, limits)).toBe(300);
  });

  it('没有独立上限的小节只返回字数，不抛错（总上限另算）', () => {
    const limits = { ...DEFAULT_MANUAL_LIMITS };
    expect(assertSectionLimit('坑与防线', 'x'.repeat(5000), limits)).toBe(5000);
  });

  it('会话手册整本：超 2000 字拒绝，证据同样不计入', () => {
    const limits = { ...DEFAULT_MANUAL_LIMITS };
    expect(assertSessionManualTotal('x'.repeat(2000), limits)).toBe(2000);
    expect(() => assertSessionManualTotal('x'.repeat(2001), limits))
      .toThrow(/现在 2001 字，上限 2000 字，超 1 字/);
    // 2000 字正文 + 1000 字证据：剥离后仍是 2000 字，放行
    expect(assertSessionManualTotal(`${'x'.repeat(2000)} ｜ 自检：${'y'.repeat(1000)}`, limits)).toBe(2000);
  });

  it('超限错误带 code=manual-limit，埋点靠它区分「被闸门拒」和「参数错」', () => {
    const limits = { ...DEFAULT_MANUAL_LIMITS };
    try {
      assertSectionLimit('约束', 'x'.repeat(301), limits);
      throw new Error('这里应该抛错');
    } catch (error: any) {
      expect(error.code).toBe('manual-limit');
      expect(error.name).toBe('ManualLimitError');
    }
  });

  it('中文按字算，不按 UTF-16 代码单元算', () => {
    expect(countManualChars('中文')).toBe(2);
    expect(countManualChars('🎯')).toBe(1);
  });

  it('sanitize 把脏值收成合法区间：缺省用默认、越界夹边、乱填回默认', () => {
    expect(sanitizeManualLimits(undefined)).toEqual(DEFAULT_MANUAL_LIMITS);
    expect(sanitizeManualLimits({ plan_chars: 5 }).plan_chars).toBe(20);
    expect(sanitizeManualLimits({ plan_chars: 999999 }).plan_chars).toBe(20000);
    expect(sanitizeManualLimits({ plan_chars: 'abc' }).plan_chars).toBe(DEFAULT_MANUAL_LIMITS.plan_chars);
    expect(sanitizeManualLimits({ plan_chars: 1500.4 }).plan_chars).toBe(1500);
  });
});
