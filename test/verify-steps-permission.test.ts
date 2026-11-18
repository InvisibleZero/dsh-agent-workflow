import { describe, expect, it } from 'vitest';
import { VERIFY_CHECKS } from '../src/schema/verify-checks';

describe('验收步骤的「默认允许改文件」', () => {
  it('只有第 5 项（命名与边界审查）是只读，其余步骤允许改文件', () => {
    const readOnly = VERIFY_CHECKS.filter((check) => check.modifies_files === false).map((check) => check.name);
    expect(readOnly).toEqual(['命名与边界审查']);
  });

  it('八项都显式声明了 modifies_files（不留默认歧义）', () => {
    for (const check of VERIFY_CHECKS) {
      expect(typeof check.modifies_files).toBe('boolean');
    }
  });
});
