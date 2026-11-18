import { describe, expect, it } from 'vitest';
import { namingChecker } from '../src/engine/checkers/naming';

describe('naming 检查器（第 5 项命名审查，协助型，只扫封杀词）', () => {
  it('封杀词命中 → 不合格，location 带 file:line', () => {
    const result = namingChecker.check({
      scanned: 3,
      violations: [{ word: 'data', file: 'src/a.ts', line: 7 }],
    });
    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({ location: 'src/a.ts:7' });
    expect(result.findings[0].problem).toContain('data');
  });

  it('干净证据 → 合格', () => {
    const result = namingChecker.check({ scanned: 5, violations: [] });
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('缺证据文件 → 不合格并提示命令', () => {
    const result = namingChecker.check(null);
    expect(result.ok).toBe(false);
    expect(result.findings[0].problem).toContain('naming-scan.mjs');
  });

  it('证据格式不认识 → 不合格', () => {
    const result = namingChecker.check({ scanned: 1 });
    expect(result.ok).toBe(false);
  });

  it('带 new 标记 → 前缀 [新增] / [存量]；没有则不加前缀', () => {
    const result = namingChecker.check({
      scanned: 3,
      violations: [
        { word: 'data', file: 'src/a.ts', line: 1, new: true },
        { word: 'info', file: 'src/b.ts', line: 2, new: false },
        { word: 'util', file: 'src/c.ts', line: 3 },
      ],
    });
    expect(result.findings[0]?.problem).toContain('[新增]');
    expect(result.findings[1]?.problem).toContain('[存量]');
    expect(result.findings[2]?.problem).not.toContain('[');
  });
});
