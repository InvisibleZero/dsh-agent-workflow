import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowService } from '../src/service/workflow-service';
import { JsonStorageAdapter } from '../src/adapter/json-storage';
import { DEFAULT_SETTINGS } from '../src/schema/workflow';
import type { WorkflowSnapshot } from '../src/schema/workflow';
import type { AgentNode } from '../src/schema/node';
import type { WorkflowRuntimePort, WorkflowUiPort } from '../src/adapter/port';
import type { WorkflowFault } from '../src/schema/fault';

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

function snapshotOf(nodes: AgentNode[]): WorkflowSnapshot {
  return { version: 1, workspace_id: 'ws1', title: 't', settings: DEFAULT_SETTINGS, nodes };
}

const noopRuntime: WorkflowRuntimePort = {
  resume: async () => {},
  stop: async () => {},
  injectInput: async () => {},
  emit: () => {},
};
const agreeUi: WorkflowUiPort = {
  confirmTransition: async () => true,
  pushNodeState: () => {},
};

describe('故障隔离：reportFault 路由与阻塞', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-workflow-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('system+可重试 → retry，不阻塞', async () => {
    const storage = new JsonStorageAdapter(tmpDir);
    const svc = new WorkflowService(snapshotOf([node('n', 'discussing')]), storage, noopRuntime, agreeUi);
    const fault: WorkflowFault = { kind: 'system', message: 'timeout', retryable: true };

    expect(await svc.reportFault('n', fault)).toBe('retry');
    expect(svc.nodes.find((n) => n.node_id === 'n')?.flags).toEqual([]);
  });

  it('ai_semantic → human_in_the_loop，标记 blocked', async () => {
    const storage = new JsonStorageAdapter(tmpDir);
    const svc = new WorkflowService(snapshotOf([node('n', 'discussing')]), storage, noopRuntime, agreeUi);
    const fault: WorkflowFault = { kind: 'ai_semantic', message: 'json broken', retryable: false };

    expect(await svc.reportFault('n', fault)).toBe('human_in_the_loop');
    expect(svc.nodes.find((n) => n.node_id === 'n')?.flags).toContain('blocked');
  });

  it('blocked 节点不能流转', async () => {
    const storage = new JsonStorageAdapter(tmpDir);
    const svc = new WorkflowService(snapshotOf([node('n', 'discussing')]), storage, noopRuntime, agreeUi);
    await svc.reportFault('n', { kind: 'ai_semantic', message: 'x', retryable: false });

    await expect(svc.requestTransition('n', 'implementing')).rejects.toThrow(/阻塞/);
  });

  it('resolveBlock 解除后恢复流转', async () => {
    const storage = new JsonStorageAdapter(tmpDir);
    const svc = new WorkflowService(snapshotOf([node('n', 'discussing')]), storage, noopRuntime, agreeUi);
    await svc.reportFault('n', { kind: 'ai_semantic', message: 'x', retryable: false });
    await svc.resolveBlock('n');

    await svc.requestTransition('n', 'implementing');
    expect(svc.nodes.find((n) => n.node_id === 'n')?.current_state).toBe('implementing');
  });
});
