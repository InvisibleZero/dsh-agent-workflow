import { describe, it, expect } from 'vitest';
import { WorkflowUiStore } from '../src/client/ui-store';
import type { AgentNode } from '../src/schema/node';

function node(id: string, state: AgentNode['current_state']): AgentNode {
  return {
    node_id: id,
    parent_id: null,
    node_type: 'task',
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

describe('WorkflowUiStore', () => {
  it('setNodes 通知订阅者', () => {
    const store = new WorkflowUiStore();
    const seen: Array<string | null> = [];
    store.subscribe((s) => seen.push(s.rootId));
    store.setNodes([node('root', 'not_started')], 'root');
    expect(seen).toEqual(['root']);
  });

  it('setNodeState 更新指定节点状态', () => {
    const store = new WorkflowUiStore();
    store.setNodes([node('a', 'discussing')], 'a');
    store.setNodeState('a', 'implementing');
    expect(store.getState().nodes.find((n) => n.node_id === 'a')?.current_state).toBe('implementing');
  });

  it('subscribe 返回取消函数', () => {
    const store = new WorkflowUiStore();
    let count = 0;
    const off = store.subscribe(() => {
      count += 1;
    });
    off();
    store.setNodes([], null);
    expect(count).toBe(0);
  });
});
