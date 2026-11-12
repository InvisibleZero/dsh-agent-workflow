import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSessionState, readStateChangedDetail, replaceSessionStates, setSessionState, subscribeSessionStates } from '../src/client/session-state-store';

describe('侧栏会话状态表（纯内存，不依赖 DOM）', () => {
  beforeEach(() => {
    replaceSessionStates({});
  });

  it('全量替换后能按会话读回，空值被忽略', () => {
    replaceSessionStates({ 's-1': 'discussing', 's-2': 'completed', 's-3': '' });
    expect(getSessionState('s-1')).toBe('discussing');
    expect(getSessionState('s-2')).toBe('completed');
    expect(getSessionState('s-3')).toBeNull();
    expect(getSessionState('')).toBeNull();
  });

  it('改一条只影响目标会话，且订阅者只收到一次通知', () => {
    replaceSessionStates({ 's-1': 'discussing', 's-2': 'implementing' });
    const listener = vi.fn();
    const unsubscribe = subscribeSessionStates(listener);

    expect(setSessionState('s-1', 'verifying')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSessionState('s-1')).toBe('verifying');
    expect(getSessionState('s-2')).toBe('implementing');

    unsubscribe();
    setSessionState('s-2', 'completed');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('状态没变时不通知；非法输入不写入也不通知', () => {
    replaceSessionStates({ 's-1': 'discussing' });
    const listener = vi.fn();
    subscribeSessionStates(listener);

    expect(setSessionState('s-1', 'discussing')).toBe(false);
    expect(setSessionState('', 'implementing')).toBe(false);
    expect(setSessionState('s-2', '')).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('全量替换会移除已消失的会话，内容一致时不通知', () => {
    replaceSessionStates({ 's-1': 'discussing' });
    const listener = vi.fn();
    subscribeSessionStates(listener);

    replaceSessionStates({ 's-1': 'discussing' });
    expect(listener).not.toHaveBeenCalled();

    replaceSessionStates({ 's-2': 'completed' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSessionState('s-1')).toBeNull();
    expect(getSessionState('s-2')).toBe('completed');
  });

  it('单个订阅者抛错不影响其他订阅者', () => {
    replaceSessionStates({ 's-1': 'discussing' });
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    subscribeSessionStates(bad);
    subscribeSessionStates(good);

    setSessionState('s-1', 'implementing');
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('事件 detail 能解析；旧格式（无 detail）返回 null', () => {
    const custom = new CustomEvent('dsh-workflow-state-changed', {
      detail: { sessionId: 's-1', state: 'verifying' },
    });
    expect(readStateChangedDetail(custom)).toEqual({ sessionId: 's-1', state: 'verifying' });

    expect(readStateChangedDetail(new Event('dsh-workflow-state-changed'))).toBeNull();
    const empty = new CustomEvent('dsh-workflow-state-changed', { detail: { sessionId: 's-1' } });
    expect(readStateChangedDetail(empty)).toBeNull();
  });
});
