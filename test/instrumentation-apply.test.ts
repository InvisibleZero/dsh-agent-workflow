import { describe, expect, it } from 'vitest';
import { applyPlan, buildCall, eventFromArgs, findCalls, splitArgs, stableEvent } from '../scripts/instrument-apply.mjs';

describe('接口层：埋点应用脚本的纯函数', () => {
  it('stableEvent 截到第一个 ( 或 : 之前', () => {
    expect(stableEvent('[workflow] verify report (session=x)')).toBe('[workflow] verify report');
    expect(stableEvent('[workflow] guard skipped (reason=unknown-state)')).toBe('[workflow] guard skipped');
    expect(stableEvent('plain event')).toBe('plain event');
  });

  it('findCalls 找到 logEvent( / clientLog(，切片拿到参数串', () => {
    const calls = findCalls("if (x) { logEvent(deps.logger, 'info', 'a(b)'); }\nclientLog('b');");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.name).toBe('logEvent');
    expect(calls[0]?.argsRaw).toBe("deps.logger, 'info', 'a(b)'");
    expect(calls[1]?.name).toBe('clientLog');
  });

  it('findCalls 跳过注释与字符串里的 logEvent( 字样（不被污染）', () => {
    const text = "// logEvent(comment);\n/* logEvent(block) */ const s = 'logEvent(x)'; const t = `logEvent(y)`;\nlogEvent(deps.logger, 'info', 'real');";
    const calls = findCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe('logEvent');
    expect(calls[0]?.argsRaw).toBe("deps.logger, 'info', 'real'");
  });

  it('eventFromArgs 取最后一个参数的消息位；splitArgs 拆参数', () => {
    const argsRaw = "deps.logger, 'info', '[workflow] verify report (session=x)'";
    expect(eventFromArgs(argsRaw)).toBe('[workflow] verify report');
    expect(eventFromArgs("'[workflow] guard skipped (reason=x)'")).toBe('[workflow] guard skipped');
    expect(splitArgs(argsRaw)).toEqual(['deps.logger', "'info'", "'[workflow] verify report (session=x)'"]);
  });

  it('buildCall 照抄形态，把新事件塞进消息位（最后一个字符串参数）', () => {
    expect(buildCall({ name: 'logEvent', args: ['deps.logger', "'info'", "'existing'"] }, 'new event'))
      .toBe("logEvent(deps.logger, 'info', 'new event')");
    expect(buildCall({ name: 'logEvent', args: ['deps.logger', "'existing'"] }, 'new event'))
      .toBe("logEvent(deps.logger, 'new event')");
    expect(buildCall({ name: 'clientLog', args: [] }, 'new event'))
      .toBe("clientLog('new event')");
  });
});

describe('接口层：applyPlan 插埋点（保守）', () => {
  const shape = { name: 'logEvent', args: ['deps.logger', "'info'", "'existing'"] };

  function planWith(functionName: string, event: string) {
    return {
      tree_version: 1,
      root: {
        id: 'none', label: 'none', children: [{
          id: 'bug', label: 'bug', children: [{
            id: 'p', label: 'p',
            instrument: { function: functionName, event, tree_version: 1, kind: 'path' },
            children: [],
          }],
        }],
      },
      nodes: { [`${functionName}::${event}`]: { function: functionName, event, tree_version: 1, kind: 'path' } },
    };
  }

  it('函数唯一时把调用插到函数体开头', () => {
    const files = {
      files: [{ rel: 'src/a.ts', text: 'export function trigger() {\n  const x = 1;\n}\n', firstShape: shape }],
    };
    const scan = { items: [], firstShape: shape };
    const result = applyPlan(planWith('trigger', 'new event'), scan, files);
    expect(result.inserted).toHaveLength(1);
    expect(files.files[0]!.text).toContain("logEvent(deps.logger, 'info', 'new event');");
  });

  it('已有同事件：回填，不重复插', () => {
    const files = {
      files: [{ rel: 'src/a.ts', text: 'export function trigger() {\n}\n', firstShape: shape }],
    };
    const scan = { items: [{ event: 'new event', location: 'src/b.ts:3' }], firstShape: shape };
    const result = applyPlan(planWith('trigger', 'new event'), scan, files);
    expect(result.inserted).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('找不到函数锚点：不猜，记 skipped', () => {
    const files = { files: [{ rel: 'src/a.ts', text: 'export function other() {\n}\n', firstShape: shape }] };
    const scan = { items: [], firstShape: shape };
    const result = applyPlan(planWith('missing_fn', 'new event'), scan, files);
    expect(result.inserted).toHaveLength(0);
    expect(result.skipped[0]?.reason).toContain('找不到唯一函数锚点');
  });

  it('没有可照抄的调用形态：不猜，记 skipped', () => {
    const files = { files: [{ rel: 'src/a.ts', text: 'export function trigger() {\n}\n', firstShape: null }] };
    const scan = { items: [], firstShape: null };
    const result = applyPlan(planWith('trigger', 'new event'), scan, files);
    expect(result.inserted).toHaveLength(0);
    expect(result.skipped[0]?.reason).toContain('没有可照抄');
  });
});
