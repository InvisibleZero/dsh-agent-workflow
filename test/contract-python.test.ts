import { describe, expect, it } from 'vitest';
import { contractChecker } from '../src/engine/checkers/contract';

/** 直接取检查器挂的 Python 归一化函数（真实链路里由 invokeChecker 按栈调用）。 */
const normalizePython = contractChecker.normalizers?.python as (raw: string) => unknown;

describe('契约测试：Python 归一化（pytest-json-report → 判据 JSON）', () => {
  it('pytest 全过：summary.total / failed → numTotalTests / numFailedTests', () => {
    const raw = JSON.stringify({ summary: { total: 3, passed: 3, failed: 0, error: 0 } });
    expect(normalizePython(raw)).toEqual({ numTotalTests: 3, numFailedTests: 0 });
    const result = contractChecker.check(normalizePython(raw));
    expect(result.ok).toBe(true);
  });

  it('pytest 有失败：failed 计入 numFailedTests，判不合格', () => {
    const raw = JSON.stringify({ summary: { total: 3, passed: 2, failed: 1, error: 0 } });
    expect(normalizePython(raw)).toEqual({ numTotalTests: 3, numFailedTests: 1 });
    const result = contractChecker.check(normalizePython(raw));
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.problem).toContain('1 个用例失败');
  });

  it('pytest setup/teardown 错也算失败（failed + error）', () => {
    const raw = JSON.stringify({ summary: { total: 2, passed: 1, failed: 0, error: 1 } });
    expect(normalizePython(raw)).toEqual({ numTotalTests: 2, numFailedTests: 1 });
  });

  it('pytest 空跑：total=0 → 判据报「没有任何用例」', () => {
    const raw = JSON.stringify({ summary: { total: 0, passed: 0, failed: 0, error: 0 } });
    const result = contractChecker.check(normalizePython(raw));
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.problem).toContain('没有任何用例');
  });

  it('产物形状不认识（缺 summary）：归一化给 0/0，判据报空跑而不是误判通过', () => {
    const raw = JSON.stringify({ tests: [] });
    expect(normalizePython(raw)).toEqual({ numTotalTests: 0, numFailedTests: 0 });
    expect(contractChecker.check(normalizePython(raw)).ok).toBe(false);
  });
});
