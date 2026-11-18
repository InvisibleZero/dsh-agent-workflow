import { describe, expect, it } from 'vitest';
import { checkTestEvidence } from '../src/engine/checkers/contract';

describe('checkTestEvidence：测试结果判定（含 exitcode fail-closed）', () => {
  it('全过 + exitcode 0：通过', () => {
    const result = checkTestEvidence({ numTotalTests: 3, numFailedTests: 0, exitcode: 0 }, 'contract.json', 'cmd');
    expect(result.ok).toBe(true);
  });

  it('有失败：不合格', () => {
    const result = checkTestEvidence({ numTotalTests: 3, numFailedTests: 1 }, 'contract.json', 'cmd');
    expect(result.ok).toBe(false);
  });

  it('exitcode 非 0 但 failed=0：fail-closed 判不合格', () => {
    const result = checkTestEvidence({ numTotalTests: 3, numFailedTests: 0, exitcode: 1 }, 'contract.json', 'cmd');
    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => String(finding.problem).includes('退出码'))).toBe(true);
  });

  it('0 用例：不合格（空跑不算验证）', () => {
    const result = checkTestEvidence({ numTotalTests: 0, numFailedTests: 0 }, 'contract.json', 'cmd');
    expect(result.ok).toBe(false);
  });

  it('缺 numTotalTests / numFailedTests：格式不认识', () => {
    const result = checkTestEvidence({ summary: { total: 1 } }, 'contract.json', 'cmd');
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.problem).toContain('格式不认识');
  });
});
