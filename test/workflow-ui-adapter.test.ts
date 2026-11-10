import { describe, it, expect } from 'vitest';
import { WorkflowUiAdapter } from '../src/client/workflow-ui-adapter';
import { WorkflowUiStore } from '../src/client/ui-store';
import type { TransitionRequest } from '../src/engine/state-machine';
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

describe('WorkflowUiAdapter', () => {
  it('confirmTransition 委托给 confirm 回调', async () => {
    let called: TransitionRequest | null = null;
    const adapter = new WorkflowUiAdapter(new WorkflowUiStore(), async (req) => {
      called = req;
      return true;
    });
    const req: TransitionRequest = {
      node_id: 'n',
      from: 'discussing',
      to: 'implementing',
      kind: 'gated',
      full_detail: 'A',
      enter_trigger: null,
    };
    expect(await adapter.confirmTransition(req)).toBe(true);
    expect(called).toBe(req);
  });

  it('pushNodeState 更新 store', () => {
    const store = new WorkflowUiStore();
    store.setNodes([node('a', 'discussing')], 'a');
    const adapter = new WorkflowUiAdapter(store, async () => true);
    adapter.pushNodeState('a', 'implementing');
    expect(store.getState().nodes.find((n) => n.node_id === 'a')?.current_state).toBe('implementing');
  });
});
