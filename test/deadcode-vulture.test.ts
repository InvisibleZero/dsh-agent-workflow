import { describe, expect, it } from 'vitest';
import { deadcodeChecker } from '../src/engine/checkers/deadcode';
import { normalizeVulture } from '../src/engine/checkers/normalize';

describe('死代码：vulture 产物（Python 口径，一条行一条 finding）', () => {
  it('一条 vulture 行 → 一条 finding，用 vulture 原文', () => {
    const raw = "panel.py:35: unused import 'zlib' (90% confidence)";
    const result = deadcodeChecker.check(normalizeVulture(raw));
    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.location).toBe('panel.py:35');
    expect(result.findings[0]?.problem).toContain("unused import 'zlib'");
  });

  it('knip 形状（无 message）仍走 files/exports 逻辑', () => {
    const result = deadcodeChecker.check({ issues: [{ file: 'x.js', files: [{ name: 'x.js' }], exports: [] }] });
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.problem).toContain('文件没有被任何模块引用');
  });
});
