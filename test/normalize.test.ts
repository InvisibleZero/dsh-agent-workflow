import { describe, expect, it } from 'vitest';
import {
  normalizeGoBuild,
  normalizeGoTestJson,
  normalizeImportLinter,
  normalizePytestReport,
  normalizeStaticcheck,
  normalizeVulture,
} from '../src/engine/checkers/normalize';

describe('归一化：工具原生输出 → 判据统一 JSON', () => {
  it('pytest-json-report → 测试结果', () => {
    const raw = JSON.stringify({ summary: { total: 3, failed: 1, error: 0 } });
    expect(normalizePytestReport(raw)).toEqual({ numTotalTests: 3, numFailedTests: 1 });
  });

  it('pytest 的 error 也算失败', () => {
    const raw = JSON.stringify({ summary: { total: 2, failed: 0, error: 1 } });
    expect(normalizePytestReport(raw)).toEqual({ numTotalTests: 2, numFailedTests: 1 });
  });

  it('go test -json（JSONL）→ 测试结果，每个用例只计一次', () => {
    const raw = [
      JSON.stringify({ Action: 'run', Test: 'TestA' }),
      JSON.stringify({ Action: 'pass', Test: 'TestA' }),
      JSON.stringify({ Action: 'run', Test: 'TestB' }),
      JSON.stringify({ Action: 'fail', Test: 'TestB' }),
      JSON.stringify({ Action: 'pass' }), // 包级事件，不计
    ].join('\n');
    expect(normalizeGoTestJson(raw)).toEqual({ numTotalTests: 2, numFailedTests: 1 });
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

  it('go build 文本（import cycle 多行）→ 违规列表', () => {
    const raw = 'package main\n\timports cycle/a\n\timports cycle/b\n\timports cycle/a: import cycle not allowed\n';
    expect(normalizeGoBuild(raw)).toEqual({
      summary: {
        violations: [
          { from: 'cycle/a', to: 'cycle/b', rule: { name: 'import-cycle', severity: 'error' } },
          { from: 'cycle/b', to: 'cycle/a', rule: { name: 'import-cycle', severity: 'error' } },
        ],
      },
    });
  });

  it('go build 没有循环 → 无违规', () => {
    expect(normalizeGoBuild('package main\n')).toEqual({ summary: { violations: [] } });
  });

  it('staticcheck 文本 → 未使用列表', () => {
    const raw = 'src/a.go:10:2: U1000: unused function Foo\nsrc/b.go:5:1: U1000: unused type Bar';
    const result = normalizeStaticcheck(raw) as { issues: Array<{ file: string }> };
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]?.file).toBe('src/a.go');
  });

  it('坏输入不抛、给空结果（绝不误判通过）', () => {
    expect(normalizePytestReport('not json')).toEqual({ numTotalTests: 0, numFailedTests: 0 });
    expect(normalizeGoTestJson('not json\n')).toEqual({ numTotalTests: 0, numFailedTests: 0 });
    expect(normalizeImportLinter('not json')).toEqual({ summary: { violations: [] } });
    expect(normalizeVulture('')).toEqual({ issues: [] });
    expect(normalizeGoBuild('')).toEqual({ summary: { violations: [] } });
    expect(normalizeStaticcheck('')).toEqual({ issues: [] });
  });
});
