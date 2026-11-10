import { describe, it, expect } from 'vitest';
import { TreeStore } from '../src/engine/tree-store';
import type { AgentNode } from '../src/schema/node';
import type { NodeState } from '../src/schema/node-state';

function node(id: string, parentId: string | null, depth: number, maxDepth = 5): AgentNode {
  return {
    node_id: id,
    parent_id: parentId,
    node_type: 'task',
    current_state: 'not_started' as NodeState,
    child_ids: [],
    context_payload: null,
    flags: [],
    depth,
    max_depth: maxDepth,
    step_count: 0,
    max_steps: 200,
  };
}

describe('tree-store', () => {
  it('增删查与父子关系', () => {
    const t = new TreeStore();
    t.addRoot(node('root', null, 0));
    expect(t.addChild('root', node('a', 'root', 1)).ok).toBe(true);
    expect(t.addChild('root', node('b', 'root', 1)).ok).toBe(true);
    expect(t.addChild('a', node('a1', 'a', 2)).ok).toBe(true);
    expect(t.childrenOf('root').map((c) => c.node_id).sort()).toEqual(['a', 'b']);
    expect(t.getNode('a1')?.parent_id).toBe('a');
  });

  it('重复 id 被拒', () => {
    const t = new TreeStore();
    t.addRoot(node('root', null, 0));
    t.addChild('root', node('a', 'root', 1));
    expect(t.addChild('root', node('a', 'root', 1)).ok).toBe(false);
  });

  it('max_depth 熔断：超过深度拒绝建子节点', () => {
    const t = new TreeStore();
    t.addRoot(node('root', null, 0, 2));
    t.addChild('root', node('a', 'root', 1, 2));
    const r = t.addChild('a', node('a1', 'a', 2, 2)); // depth=2 >= max_depth=2
    expect(r.ok).toBe(false);
  });

  it('descendantsOf 收集全部子孙', () => {
    const t = new TreeStore();
    t.addRoot(node('root', null, 0));
    t.addChild('root', node('a', 'root', 1));
    t.addChild('root', node('b', 'root', 1));
    t.addChild('a', node('a1', 'a', 2));
    t.addChild('a1', node('a1x', 'a1', 3));
    expect(t.descendantsOf('root').sort()).toEqual(['a', 'a1', 'a1x', 'b']);
  });

  it('remove 连带删除子孙并从父摘除', () => {
    const t = new TreeStore();
    t.addRoot(node('root', null, 0));
    t.addChild('root', node('a', 'root', 1));
    t.addChild('a', node('a1', 'a', 2));
    expect(t.remove('a').ok).toBe(true);
    expect(t.getNode('a')).toBeUndefined();
    expect(t.getNode('a1')).toBeUndefined();
    expect(t.childrenOf('root')).toEqual([]);
  });
});
