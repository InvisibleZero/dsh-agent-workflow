import { describe, expect, it } from 'vitest';
import { instrumentationChecker } from '../src/engine/checkers/instrumentation';

describe('埋点检查器：不支持的栈 vs 缺计划', () => {
  it('非 js/python 栈 → unsupported，不判成「没配计划」', () => {
    const result = instrumentationChecker.check(null, { stack: 'go' });
    expect(result.unsupported).toContain('只支持 js / python');
    expect(result.findings).toHaveLength(0);
  });

  it('python 栈 → 走计划校验（缺计划 → config_missing）', () => {
    const result = instrumentationChecker.check(null, { stack: 'python' });
    expect(result.unsupported).toBeUndefined();
    expect(result.stats.config_missing).toBe(1);
    expect(result.note).toContain('埋点计划');
  });

  it('缺计划时 note 里带出计划格式（模型不用猜怎么写）', () => {
    const result = instrumentationChecker.check(null, { stack: 'python' });
    expect(result.note).toContain('tree_version');
    expect(result.note).toContain('nodes');
    expect(result.note).toContain('根 id 固定 none');
  });
});
