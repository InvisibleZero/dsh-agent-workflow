import { describe, it, expect } from 'vitest';
import { effectiveDetail } from '../src/engine/state-machine';
import { DEFAULT_GLOBAL_OPERATION_DETAIL } from '../src/schema/workflow';
import type { AgentNode } from '../src/schema/node';
import type { NodeState } from '../src/schema/node-state';

function makeNode(state: NodeState): AgentNode {
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
    step_count: 0,
    max_steps: 200,
  };
}

describe('state-machine：有效操作细节 A+(B/C/D)', () => {
  it('活跃态读到 A + 对应专属细节', () => {
    const node = makeNode('verifying');
    const detail = effectiveDetail('verifying', node, DEFAULT_GLOBAL_OPERATION_DETAIL);
    expect(detail.full_detail).toContain(DEFAULT_GLOBAL_OPERATION_DETAIL.shared_detail);
    expect(detail.full_detail).toContain(DEFAULT_GLOBAL_OPERATION_DETAIL.verifying.operation_detail);
  });

  it('只取当前状态的专属细节，不串到别的态', () => {
    const node = makeNode('implementing');
    const detail = effectiveDetail('implementing', node, DEFAULT_GLOBAL_OPERATION_DETAIL);
    expect(detail.full_detail).toContain(DEFAULT_GLOBAL_OPERATION_DETAIL.implementing.operation_detail);
    expect(detail.full_detail).not.toContain(DEFAULT_GLOBAL_OPERATION_DETAIL.verifying.operation_detail);
  });

  it('子节点覆盖只作用于自己当前状态', () => {
    const node: AgentNode = {
      ...makeNode('implementing'),
      state_detail_overrides: {
        implementing: { operation_detail: '我的专属实现细节', enter_trigger: 'custom' },
      },
    };
    const detail = effectiveDetail('implementing', node, DEFAULT_GLOBAL_OPERATION_DETAIL);
    expect(detail.full_detail).toContain('我的专属实现细节');
    expect(detail.enter_trigger).toBe('custom');
  });

  it('终态无专属细节，只有公共 A', () => {
    const detail = effectiveDetail('completed', makeNode('verifying'), DEFAULT_GLOBAL_OPERATION_DETAIL);
    expect(detail.full_detail).toBe(DEFAULT_GLOBAL_OPERATION_DETAIL.shared_detail);
    expect(detail.enter_trigger).toBeNull();
  });
});
