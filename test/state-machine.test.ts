import { describe, it, expect } from 'vitest';
import {
  canTransition,
  requestTransition,
  applyTransition,
  effectiveDetail,
} from '../src/engine/state-machine';
import { DEFAULT_GLOBAL_OPERATION_DETAIL } from '../src/schema/workflow';
import type { AgentNode } from '../src/schema/node';
import type { NodeState } from '../src/schema/node-state';

function makeNode(state: NodeState, stepCount = 0): AgentNode {
  return {
    node_id: 'n1',
    parent_id: null,
    node_type: 'feature',
    current_state: state,
    child_ids: [],
    context_payload: null,
    flags: [],
    depth: 0,
    max_depth: 8,
    step_count: stepCount,
    max_steps: 200,
  };
}

describe('state-machine：合法转移', () => {
  it('前进链合法', () => {
    expect(canTransition('not_started', 'discussing')).toBe(true);
    expect(canTransition('discussing', 'implementing')).toBe(true);
    expect(canTransition('implementing', 'verifying')).toBe(true);
    expect(canTransition('verifying', 'completed')).toBe(true);
  });

  it('返工合法', () => {
    expect(canTransition('implementing', 'discussing')).toBe(true);
    expect(canTransition('verifying', 'discussing')).toBe(true);
  });

  it('非法迁移被拒', () => {
    expect(canTransition('not_started', 'implementing')).toBe(false);
    expect(canTransition('discussing', 'completed')).toBe(false);
    expect(canTransition('completed', 'discussing')).toBe(false);
  });
});

describe('state-machine：流转行为', () => {
  it('applyTransition 更新状态并递增步数', () => {
    const n = makeNode('discussing', 3);
    const r = applyTransition(n, 'implementing');
    expect(r.current_state).toBe('implementing');
    expect(r.step_count).toBe(4);
  });

  it('首次对话是 auto 流转', () => {
    const req = requestTransition(makeNode('not_started'), 'discussing', DEFAULT_GLOBAL_OPERATION_DETAIL);
    expect(req.kind).toBe('auto');
  });

  it('进入验收中为 gated，且默认无触发输入', () => {
    const req = requestTransition(makeNode('implementing'), 'verifying', DEFAULT_GLOBAL_OPERATION_DETAIL);
    expect(req.kind).toBe('gated');
    expect(req.enter_trigger).toBeNull();
  });

  it('步数熔断：达到 max_steps 拒绝流转', () => {
    const n = makeNode('discussing', 200); // max_steps = 200
    expect(() => requestTransition(n, 'implementing', DEFAULT_GLOBAL_OPERATION_DETAIL)).toThrow(/max_steps|步数/);
  });
});

describe('state-machine：有效操作细节 A+(B/C/D)', () => {
  it('活跃态读到 A + 对应专属细节', () => {
    const n = makeNode('verifying');
    const d = effectiveDetail('verifying', n, DEFAULT_GLOBAL_OPERATION_DETAIL);
    expect(d.full_detail).toContain(DEFAULT_GLOBAL_OPERATION_DETAIL.shared_detail);
    expect(d.full_detail).toContain(DEFAULT_GLOBAL_OPERATION_DETAIL.verifying.operation_detail);
  });

  it('子节点覆盖只作用于自己当前状态', () => {
    const n: AgentNode = {
      ...makeNode('implementing'),
      state_detail_overrides: {
        implementing: { operation_detail: '我的专属实现细节', enter_trigger: 'custom' },
      },
    };
    const d = effectiveDetail('implementing', n, DEFAULT_GLOBAL_OPERATION_DETAIL);
    expect(d.full_detail).toContain('我的专属实现细节');
    expect(d.enter_trigger).toBe('custom');
  });

  it('终态无专属细节，只有公共 A', () => {
    const d = effectiveDetail('completed', makeNode('verifying'), DEFAULT_GLOBAL_OPERATION_DETAIL);
    expect(d.full_detail).toBe(DEFAULT_GLOBAL_OPERATION_DETAIL.shared_detail);
    expect(d.enter_trigger).toBeNull();
  });
});
