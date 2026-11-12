import { describe, expect, it } from 'vitest';
import { createWorkflowStream, parseWorkflowStreamFrame } from '../src/client/workflow-stream';

/**
 * 推送通道的契约：
 * - 只开一条连接，多个订阅者共用；
 * - 坏帧忽略（不能因为一条脏数据把通道关掉）；
 * - 最后一个订阅者退订就关连接；
 * - 拿不到 EventSource 时降级成「没连上」，由调用方退回轮询。
 */

function makeSource() {
  const source = {
    onmessage: null as ((message: { data: string }) => void) | null,
    onopen: null as (() => void) | null,
    onerror: null as (() => void) | null,
    closed: false,
    close() {
      this.closed = true;
    },
  };
  return source;
}

describe('parseWorkflowStreamFrame', () => {
  it('解析合法帧，state 缺省为 null', () => {
    expect(parseWorkflowStreamFrame('{"sessionId":"s-1","reason":"state","state":"implementing"}')).toEqual({
      sessionId: 's-1',
      reason: 'state',
      state: 'implementing',
    });
    expect(parseWorkflowStreamFrame('{"sessionId":"s-1","reason":"released"}')).toEqual({
      sessionId: 's-1',
      reason: 'released',
      state: null,
    });
  });

  it('坏帧返回 null：非 JSON、缺 sessionId、空串', () => {
    expect(parseWorkflowStreamFrame('not json')).toBeNull();
    expect(parseWorkflowStreamFrame('{"reason":"state"}')).toBeNull();
    expect(parseWorkflowStreamFrame('{"sessionId":""}')).toBeNull();
    expect(parseWorkflowStreamFrame('')).toBeNull();
  });
});

describe('createWorkflowStream', () => {
  it('首个订阅者打开连接，所有订阅者都能收到同一帧；连接状态变化会回报', () => {
    const source = makeSource();
    let opened = 0;
    const statuses: boolean[] = [];
    const stream = createWorkflowStream(
      () => {
        opened += 1;
        return source;
      },
      (open) => statuses.push(open),
    );

    const first: any[] = [];
    const second: any[] = [];
    const unsubscribeFirst = stream.subscribe((event) => first.push(event));
    const unsubscribeSecond = stream.subscribe((event) => second.push(event));

    expect(opened).toBe(1);

    source.onopen?.();
    source.onmessage?.({ data: '{"sessionId":"s-1","reason":"state","state":"verifying"}' });
    expect(first).toEqual([{ sessionId: 's-1', reason: 'state', state: 'verifying' }]);
    expect(second).toHaveLength(1);

    // 断线 / 重连都要回报，排查「界面没更新」时靠它区分「没收到推送」。
    source.onerror?.();
    source.onopen?.();
    expect(statuses).toEqual([true, false, true]);

    unsubscribeFirst();
    unsubscribeSecond();
    expect(source.closed).toBe(true);
  });

  it('坏帧不分发；单个订阅者抛错不影响其他订阅者', () => {
    const source = makeSource();
    const stream = createWorkflowStream(() => source);
    const seen: string[] = [];
    stream.subscribe(() => {
      throw new Error('boom');
    });
    const unsubscribe = stream.subscribe((event) => seen.push(event.reason));

    source.onmessage?.({ data: 'garbage' });
    expect(seen).toEqual([]);

    source.onmessage?.({ data: '{"sessionId":"s-2","reason":"created"}' });
    expect(seen).toEqual(['created']);

    unsubscribe();
  });

  it('拿不到连接（浏览器没有 EventSource）时不抛，也不假装有连接', () => {
    const statuses: boolean[] = [];
    const stream = createWorkflowStream(() => null, (open) => statuses.push(open));
    const unsubscribe = stream.subscribe(() => {});
    expect(statuses).toEqual([]);
    unsubscribe();
  });
});
