import { describe, expect, it } from 'vitest';
import { VERIFY_CHECKS } from '../src/schema/verify-checks';

describe('验收步骤的「默认允许改什么」', () => {
  it('第 5 项只读，第 8 项只写文档，其余可改源码', () => {
    const readOnly = VERIFY_CHECKS.filter((check) => check.modifies === 'none').map((check) => check.name);
    const docsOnly = VERIFY_CHECKS.filter((check) => check.modifies === 'docs').map((check) => check.name);
    expect(readOnly).toEqual(['命名与边界审查']);
    expect(docsOnly).toEqual(['收尾']);
  });

  it('八项都显式声明了 modifies（不留默认歧义）', () => {
    for (const check of VERIFY_CHECKS) {
      expect(['none', 'docs', 'source']).toContain(check.modifies);
    }
  });
});
