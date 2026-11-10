import { describe, it, expect } from 'vitest';
import { deriveParentState, bubbleUp, type TreeReader } from '../src/engine/aggregation';
import type { AgentNode } from '../src/schema/node';
import type { NodeState } from '../src/schema/node-state';

function node(id: string, parentId: string | null, state: NodeState, childIds: string[] = []): AgentNode {
  return {
    node_id: id,
    parent_id: parentId,
    node_type: 'feature',
    current_state: state,
    child_ids: childIds,
    context_payload: null,
    flags: [],
    depth: 0,
    max_depth: 8,
    step_count: 0,
    max_steps: 200,
  };
}

describe('aggregation：deriveParentState', () => {
  it('manual 不自动推导', () => {
    expect(deriveParentState([node('c', 'p', 'completed')], 'manual')).toBeNull();
  });

  it('all_complete：全部完成才父态完结', () => {
    const done = [node('c1', 'p', 'completed'), node('c2', 'p', 'completed')];
    expect(deriveParentState(done, 'all_complete')).toBe('completed');
    const mixed = [node('c1', 'p', 'completed'), node('c2', 'p', 'implementing')];
    expect(deriveParentState(mixed, 'all_complete')).toBeNull();
  });

  it('any_active：父态反映子节点前沿', () => {
    const kids = [node('c1', 'p', 'implementing'), node('c2', 'p', 'discussing')];
    expect(deriveParentState(kids, 'any_active')).toBe('discussing');
  });
});

describe('aggregation：bubbleUp', () => {
  it('子变化向上逐层重算', () => {
    const nodes: AgentNode[] = [
      node('root', null, 'discussing', ['f']),
      node('f', 'root', 'discussing', ['t1', 't2']),
      node('t1', 'f', 'completed'),
      node('t2', 'f', 'completed'),
    ];
    const reader: TreeReader = {
      getNode: (id) => nodes.find((n) => n.node_id === id),
      childrenOf: (id) => nodes.filter((n) => n.parent_id === id),
    };
    const ups = bubbleUp(reader, 't2', 'all_complete');
    expect(ups).toContainEqual({ node_id: 'f', state: 'completed' });
  });
});
