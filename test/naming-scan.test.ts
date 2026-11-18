import { describe, expect, it } from 'vitest';
import { lineIsNew } from '../scripts/naming-scan.mjs';

describe('naming-scan：按行判断 new / existing', () => {
  it('文件在改动集且行在范围内 → true', () => {
    const ranges = new Map([['a.ts', [[10, 15]]]]);
    expect(lineIsNew(ranges, 'a.ts', 12)).toBe(true);
    expect(lineIsNew(ranges, 'a.ts', 10)).toBe(true);
    expect(lineIsNew(ranges, 'a.ts', 15)).toBe(true);
  });

  it('文件在改动集但行不在范围 → false', () => {
    const ranges = new Map([['a.ts', [[10, 15]]]]);
    expect(lineIsNew(ranges, 'a.ts', 9)).toBe(false);
    expect(lineIsNew(ranges, 'a.ts', 16)).toBe(false);
  });

  it('文件不在改动集 → false', () => {
    const ranges = new Map([['a.ts', [[10, 15]]]]);
    expect(lineIsNew(ranges, 'b.ts', 1)).toBe(false);
  });

  it('拿不到 git（ranges=null）→ null（不标 new/existing）', () => {
    expect(lineIsNew(null, 'a.ts', 1)).toBeNull();
  });
});
