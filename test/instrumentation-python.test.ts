import { describe, expect, it } from 'vitest';
import { applyPlan, findFunctionAnchor } from '../scripts/instrument-apply.mjs';

describe('Python 埋点：函数锚点与插入', () => {
  it('findFunctionAnchor 认 def name(，插到 def 下一行、4 空格缩进、不加分号', () => {
    const files = {
      files: [{
        rel: 'panel.py',
        lang: 'python',
        text: 'def broadcast_start():\n    return 1\n',
        firstShape: { name: 'logger.info', args: ["'x'"], lang: 'python' },
      }],
    };
    const anchor = findFunctionAnchor(files, 'broadcast_start');
    expect(anchor?.file).toBe('panel.py');
    expect(anchor?.insertLine).toBe(1);
    expect(anchor?.indent).toBe('    ');
    expect(anchor?.semicolon).toBe('');
  });

  it('applyPlan 在 Python 函数体开头插 logger.info(\'...\')，不带分号', () => {
    const files = {
      files: [{
        rel: 'panel.py',
        lang: 'python',
        text: 'def broadcast_start():\n    return 1\n',
        firstShape: { name: 'logger.info', args: ["'x'"], lang: 'python' },
      }],
    };
    const plan = {
      tree_version: 1,
      root: {
        id: 'none', label: 'none', children: [{
          id: 'bug', label: 'bug', children: [{
            id: 'p', label: 'p',
            instrument: { function: 'broadcast_start', event: 'broadcast start', tree_version: 1, kind: 'path' },
            children: [],
          }],
        }],
      },
      nodes: { 'broadcast_start::broadcast start': { function: 'broadcast_start', event: 'broadcast start', tree_version: 1, kind: 'path' } },
    };
    const scan = { items: [], firstShape: null };
    const result = applyPlan(plan, scan, files);
    expect(result.inserted).toHaveLength(1);
    const text = files.files[0]!.text;
    expect(text).toContain("    logger.info('broadcast start')");
    expect(text).not.toContain("logger.info('broadcast start');");
  });
});
