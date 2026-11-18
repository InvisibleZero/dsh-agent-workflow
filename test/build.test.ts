import { describe, expect, it } from 'vitest';
import { buildChecker } from '../src/engine/checkers/build';

describe('build 检查器：按技术栈分流', () => {
  it('非 JS 栈（skipped）：通过 + 说明，不判失败', () => {
    const result = buildChecker.check({ stack: 'python', skipped: true, reason: '本栈没有 build 步骤（Python 无构建产物）' });
    expect(result.ok).toBe(true);
    expect(result.stats.skipped).toBe(1);
    expect(result.note).toContain('build 步骤');
  });

  it('JS 栈 build/smoke 都 0：通过', () => {
    const result = buildChecker.check({ build_exit: 0, smoke_exit: 0, bytes: 100 });
    expect(result.ok).toBe(true);
  });

  it('JS 栈 build 非 0：不合格', () => {
    const result = buildChecker.check({ build_exit: 1, smoke_exit: 0, bytes: 0 });
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.problem).toContain('build 失败');
  });

  it('JS 栈 smoke 非 0：不合格', () => {
    const result = buildChecker.check({ build_exit: 0, smoke_exit: 1, bytes: 0 });
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.problem).toContain('smoke 失败');
  });

  it('缺 build_exit：格式不认识', () => {
    const result = buildChecker.check({});
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.problem).toContain('格式不认识');
  });
});
