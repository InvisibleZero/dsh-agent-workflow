import { describe, it, expect } from 'vitest';
import { assertCanDescend, assertCanStep, CircuitBreakerError } from '../src/engine/circuit-breaker';
import type { AgentNode } from '../src/schema/node';

function makeNode(opts: { maxDepth?: number; stepCount?: number; maxSteps?: number } = {}): AgentNode {
  return {
    node_id: 'n',
    parent_id: null,
    node_type: 'task',
    current_state: 'discussing',
    child_ids: [],
    context_payload: null,
    flags: [],
    depth: 0,
    max_depth: opts.maxDepth ?? 5,
    step_count: opts.stepCount ?? 0,
    max_steps: opts.maxSteps ?? 10,
  };
}

describe('circuit-breaker：深度熔断', () => {
  it('childDepth < max_depth 放行', () => {
    expect(() => assertCanDescend(makeNode({ maxDepth: 5 }), 4)).not.toThrow();
  });

  it('childDepth == max_depth 触发熔断', () => {
    expect(() => assertCanDescend(makeNode({ maxDepth: 5 }), 5)).toThrow(CircuitBreakerError);
  });

  it('childDepth > max_depth 触发熔断', () => {
    expect(() => assertCanDescend(makeNode({ maxDepth: 5 }), 6)).toThrow(CircuitBreakerError);
  });

  it('熔断标识为 max_depth', () => {
    try {
      assertCanDescend(makeNode({ maxDepth: 5 }), 5);
    } catch (e) {
      expect((e as CircuitBreakerError).breaker).toBe('max_depth');
    }
  });
});

describe('circuit-breaker：步数熔断', () => {
  it('step_count < max_steps 放行', () => {
    expect(() => assertCanStep(makeNode({ stepCount: 5, maxSteps: 10 }))).not.toThrow();
  });

  it('step_count == max_steps 触发熔断', () => {
    expect(() => assertCanStep(makeNode({ stepCount: 10, maxSteps: 10 }))).toThrow(CircuitBreakerError);
  });

  it('熔断标识为 max_steps', () => {
    try {
      assertCanStep(makeNode({ stepCount: 10, maxSteps: 10 }));
    } catch (e) {
      expect((e as CircuitBreakerError).breaker).toBe('max_steps');
    }
  });
});
