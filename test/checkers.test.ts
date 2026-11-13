import { describe, expect, it } from 'vitest';
import { CHECKER_IDS, CHECKERS, findChecker } from '../src/engine/checkers';
import { boundaryChecker } from '../src/engine/checkers/boundary';
import { contractChecker } from '../src/engine/checkers/contract';
import { deadcodeChecker } from '../src/engine/checkers/deadcode';
import { depsChecker } from '../src/engine/checkers/deps';
import { regressionChecker } from '../src/engine/checkers/regression';

describe('检查器注册表', () => {
  it('5 个检查器都在，id 不重复', () => {
    expect(CHECKER_IDS.sort()).toEqual(['boundary', 'contract', 'deadcode', 'deps', 'regression']);
    expect(new Set(CHECKER_IDS).size).toBe(CHECKERS.length);
  });

  it('findChecker 按 id 找到，找不到返回 undefined', () => {
    expect(findChecker('deps')?.name).toBe('依赖检查');
    expect(findChecker('nope')).toBeUndefined();
  });
});

describe('契约测试 / 边界测试：测试结果证据', () => {
  it('用例全过：ok', () => {
    const result = contractChecker.check({ numTotalTests: 12, numFailedTests: 0, success: true });
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.stats.total).toBe(12);
  });

  it('0 个用例不算过：空跑要报出来', () => {
    const result = contractChecker.check({ numTotalTests: 0, numFailedTests: 0 });
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.problem).toContain('没有任何用例');
  });

  it('有用例失败：列出失败用例名', () => {
    const result = contractChecker.check({
      numTotalTests: 3,
      numFailedTests: 1,
      testResults: [{ assertionResults: [{ status: 'failed', fullName: 'state machine > 推进' }] }],
    });
    expect(result.ok).toBe(false);
    expect(result.findings.map((item) => item.location)).toContain('state machine > 推进');
  });

  it('失败数给了但没给用例名：仍要报', () => {
    const result = contractChecker.check({ numTotalTests: 3, numFailedTests: 2 });
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.problem).toContain('2 个用例失败');
  });

  it('缺产物：提示缺哪个文件、用什么命令', () => {
    const result = contractChecker.check(null);
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.problem).toContain('contract.json');
    expect(result.findings[0]?.problem).toContain('vitest');
  });

  it('边界测试用独立证据文件，缺产物提示的是 boundary.json', () => {
    const result = boundaryChecker.check(null);
    expect(result.findings[0]?.problem).toContain('boundary.json');
  });
});

describe('依赖检查：dependency-cruiser 产物', () => {
  it('没有违规：ok', () => {
    const result = depsChecker.check({ summary: { violations: [], totalCruised: 40 } });
    expect(result.ok).toBe(true);
    expect(result.stats.modules).toBe(40);
  });

  it('error 级违规：列出来源与规则', () => {
    const result = depsChecker.check({
      summary: {
        violations: [{
          from: 'src/client/a.ts',
          to: 'src/host/b.ts',
          rule: { name: 'client-must-not-touch-host', severity: 'error' },
        }],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.location).toBe('src/client/a.ts → src/host/b.ts');
    expect(result.findings[0]?.problem).toContain('client-must-not-touch-host');
  });

  it('warn 级违规不算不合格', () => {
    const result = depsChecker.check({
      summary: { violations: [{ from: 'a', to: 'b', rule: { name: 'soft', severity: 'warn' } }] },
    });
    expect(result.ok).toBe(true);
  });

  it('缺产物：提示 depcruise 命令', () => {
    const result = depsChecker.check(null);
    expect(result.findings[0]?.problem).toContain('depcruise');
  });
});

describe('死代码扫描：knip 产物', () => {
  it('没有未使用项：ok', () => {
    const result = deadcodeChecker.check({ issues: [] });
    expect(result.ok).toBe(true);
  });

  it('未使用文件与导出都报（knip 6：文件在 issues[].files[]）', () => {
    const result = deadcodeChecker.check({
      issues: [
        { file: 'scripts/x.mjs', files: [{ name: 'scripts/x.mjs' }], exports: [] },
        { file: 'src/a.ts', files: [], exports: [{ name: 'unused_fn' }] },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.findings.map((item) => item.location)).toEqual(['scripts/x.mjs', 'src/a.ts → unused_fn']);
  });

  it('缺产物：提示 knip 命令', () => {
    const result = deadcodeChecker.check(null);
    expect(result.findings[0]?.problem).toContain('knip');
  });
});

describe('证据格式不认识时：报错，不能当合格', () => {
  it('空对象：四个检查器全部判不合格', () => {
    expect(contractChecker.check({}).ok).toBe(false);
    expect(depsChecker.check({}).ok).toBe(false);
    expect(deadcodeChecker.check({}).ok).toBe(false);
    expect(regressionChecker.check({}).ok).toBe(false);
  });
});

describe('回归与压测', () => {
  it('全过：ok，耗时进 stats', () => {
    const result = regressionChecker.check({ total: 17, failed: 0, durationMs: 1234 });
    expect(result.ok).toBe(true);
    expect(result.stats).toMatchObject({ total: 17, failed: 0, durationMs: 1234 });
  });

  it('有失败：报出比例', () => {
    const result = regressionChecker.check({ total: 17, failed: 2 });
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.problem).toContain('2/17');
  });

  it('0 个用例：不算过', () => {
    const result = regressionChecker.check({ total: 0, failed: 0 });
    expect(result.ok).toBe(false);
  });

  it('缺产物：提示生成命令', () => {
    const result = regressionChecker.check(null);
    expect(result.findings[0]?.problem).toContain('regression.json');
  });
});
