import { describe, it, expect } from 'vitest';
import { InMemoryRuntimeAdapter } from '../src/adapter/in-memory-runtime';
import { DshRuntimeAdapter, type DshRuntimeCapabilities } from '../src/adapter/dsh-runtime';
import type { WorkflowEvent } from '../src/adapter/port';

describe('InMemoryRuntimeAdapter', () => {
  it('resume / stop / injectInput / emit 分别记录', async () => {
    const rt = new InMemoryRuntimeAdapter();

    await rt.resume('n1', { step: 3 });
    await rt.stop('n1');
    await rt.injectInput('full check');
    const ev: WorkflowEvent = { type: 'node_state_changed', node_id: 'n1', from: 'discussing', to: 'implementing' };
    rt.emit(ev);

    expect(rt.resumed).toEqual([{ nodeId: 'n1', checkpoint: { step: 3 } }]);
    expect(rt.stopped).toEqual(['n1']);
    expect(rt.injectedInputs).toEqual(['full check']);
    expect(rt.events).toEqual([ev]);
  });
});

describe('DshRuntimeAdapter：薄层映射', () => {
  it('把 WorkflowRuntimePort 调用转发到 DshRuntimeCapabilities', async () => {
    const calls: string[] = [];
    const caps: DshRuntimeCapabilities = {
      cancelTask: async (taskId) => { calls.push(`cancel:${taskId}`); },
      resumeTask: async (taskId, snapshot) => { calls.push(`resume:${taskId}:${JSON.stringify(snapshot)}`); },
      sendInput: async (text) => { calls.push(`input:${text}`); },
      publishEvent: (event) => { calls.push(`event:${event.type}`); },
    };
    const adapter = new DshRuntimeAdapter(caps);

    await adapter.resume('n1', { x: 1 });
    await adapter.stop('n1');
    await adapter.injectInput('hello');
    adapter.emit({ type: 'node_removed', node_id: 'n1' });

    expect(calls).toEqual(['resume:n1:{"x":1}', 'cancel:n1', 'input:hello', 'event:node_removed']);
  });
});
