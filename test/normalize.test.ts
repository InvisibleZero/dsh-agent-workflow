import { describe, expect, it } from 'vitest';
import {
  normalizeImportLinter,
  normalizePytestReport,
  normalizeVulture,
} from '../src/engine/checkers/normalize';

describe('归一化：工具原生输出 → 判据统一 JSON', () => {
  it('pytest-json-report → 测试结果', () => {
    const raw = JSON.stringify({ summary: { total: 3, failed: 1, error: 0 } });
    expect(normalizePytestReport(raw)).toEqual({ numTotalTests: 3, numFailedTests: 1, exitcode: 0 });
  });

  it('pytest 的 error 也算失败', () => {
    const raw = JSON.stringify({ summary: { total: 2, failed: 0, error: 1 } });
    expect(normalizePytestReport(raw)).toEqual({ numTotalTests: 2, numFailedTests: 1, exitcode: 0 });
  });

  it('pytest 的 exitcode 一并带上（供 fail-closed 交叉校验）', () => {
    const raw = JSON.stringify({ summary: { total: 1, failed: 0, error: 0 }, exitcode: 2 });
    expect(normalizePytestReport(raw)).toEqual({ numTotalTests: 1, numFailedTests: 0, exitcode: 2 });
  });

  it('import-linter 文本报告（Broken contracts 段）→ 违规列表', () => {
    const raw = [
      '=============',
      'Import Linter',
      '=============',
      '',
      '---------',
      'Contracts',
      '---------',
      '',
      'Analyzed 3 files, 1 dependencies.',
      '---------------------------------',
      '',
      'no-a-to-b BROKEN',
      '',
      'Contracts: 0 kept, 1 broken.',
      '',
      '----------------',
      'Broken contracts',
      '----------------',
      '',
      'no-a-to-b',
      '---------',
      '',
      'demo_pkg.a is not allowed to import demo_pkg.b:',
      '',
      '-   demo_pkg.a -> demo_pkg.b (l.1)',
      '',
    ].join('\n');
    expect(normalizeImportLinter(raw)).toEqual({
      summary: { violations: [{ from: 'demo_pkg.a', to: 'demo_pkg.b', rule: { name: 'no-a-to-b', severity: 'error' } }] },
    });
  });

  it('vulture 文本 → 未使用列表', () => {
    const raw = "src/app.py:12: unused function 'foo' (60% confidence)\nsrc/b.py:3: unused import 'os' (90% confidence)";
    const result = normalizeVulture(raw) as { issues: Array<{ file: string }> };
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]?.file).toBe('src/app.py');
  });

  it('坏输入不抛、给空结果（绝不误判通过）', () => {
    expect(normalizePytestReport('not json')).toEqual({ numTotalTests: 0, numFailedTests: 0, exitcode: 0 });
    expect(normalizeImportLinter('not json')).toEqual({ summary: { violations: [] } });
    expect(normalizeVulture('')).toEqual({ issues: [] });
  });
});
