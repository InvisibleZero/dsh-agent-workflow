import { describe, it, expect } from 'vitest';
import { routeFault } from '../src/engine/fault-router';
import type { WorkflowFault } from '../src/schema/fault';

describe('fault-router：异常分类路由', () => {
  it('系统异常且可重试 → retry', () => {
    const fault: WorkflowFault = { kind: 'system', message: 'network timeout', retryable: true };
    expect(routeFault(fault)).toBe('retry');
  });

  it('系统异常但不可重试 → human_in_the_loop', () => {
    const fault: WorkflowFault = { kind: 'system', message: 'fatal disk error', retryable: false };
    expect(routeFault(fault)).toBe('human_in_the_loop');
  });

  it('AI 语义异常 → human_in_the_loop（不可重试）', () => {
    const fault: WorkflowFault = { kind: 'ai_semantic', message: 'json broken', retryable: false };
    expect(routeFault(fault)).toBe('human_in_the_loop');
  });
});
