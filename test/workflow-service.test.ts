import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowService } from '../src/service/workflow-service';
import { JsonStorageAdapter } from '../src/adapter/json-storage';
import { DEFAULT_SETTINGS } from '../src/schema/workflow';
import type { WorkflowSnapshot } from '../src/schema/workflow';
import type { AgentNode } from '../src/schema/node';
import type { NodeState } from '../src/schema/node-state';
import type { WorkflowRuntimePort, WorkflowUiPort, WorkflowStoragePort } from '../src/adapter/port';
import type { TraceLog } from '../src/schema/trace';
import type { WorkflowFault } from '../src/schema/fault';

function node(id: string, parentId: string | null, state: NodeState, depth: number): AgentNode {
  return {
    node_id: id,
    parent_id: parentId,
    node_type: 'task',
    current_state: state,
    child_ids: [],
    context_payload: null,
    flags: [],
    depth,
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

describe('workflow-service：持久化往返', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-workflow-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('增节点 + 流转后落盘，重载重建树一致', async () => {
    const storage = new JsonStorageAdapter(tmpDir);
    const root = node('root', null, 'not_started', 0);
    const svc1 = new WorkflowService(snapshotOf([root]), storage, noopRuntime, agreeUi);

    await svc1.addNode('root', node('a', 'root', 'not_started', 1));
    await svc1.requestTransition('a', 'discussing');   // auto（首次对话）
    await svc1.requestTransition('a', 'implementing'); // gated，agreeUi 自动同意

    const loaded = await storage.load('ws1');
    expect(loaded).not.toBeNull();

    const svc2 = new WorkflowService(loaded!, storage, noopRuntime, agreeUi);
    expect(svc2.nodes.length).toBe(svc1.nodes.length);

    const byId = (arr: AgentNode[]) => new Map(arr.map((n) => [n.node_id, n]));
    const m2 = byId(svc2.nodes);
    expect(m2.get('a')?.current_state).toBe('implementing');
    expect(m2.get('a')?.parent_id).toBe('root');
    expect(m2.get('root')?.child_ids).toContain('a');
  });

  it('用户取消流转时，节点状态不变', async () => {
    const storage = new JsonStorageAdapter(tmpDir);
    const root = node('root', null, 'discussing', 0);
    const denyUi: WorkflowUiPort = { confirmTransition: async () => false, pushNodeState: () => {} };
    const svc = new WorkflowService(snapshotOf([root]), storage, noopRuntime, denyUi);

    await svc.requestTransition('root', 'implementing'); // 用户取消

    expect(svc.nodes.find((n) => n.node_id === 'root')?.current_state).toBe('discussing');
  });

  it('removeNode 删除节点及其子孙并落盘', async () => {
    const storage = new JsonStorageAdapter(tmpDir);
    const root = node('root', null, 'not_started', 0);
    const a = node('a', 'root', 'not_started', 1);
    const a1 = node('a1', 'a', 'not_started', 2);
    const svc = new WorkflowService(snapshotOf([root, a, a1]), storage, noopRuntime, agreeUi);

    await svc.removeNode('a');

    const loaded = await storage.load('ws1');
    const ids = loaded?.nodes.map((n) => n.node_id);
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('a1');
    expect(ids).toContain('root');
    expect(loaded?.nodes.find((n) => n.node_id === 'root')?.child_ids).not.toContain('a');
  });
});

describe('workflow-service：断点快照往返', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-workflow-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('saveCheckpoint → loadCheckpoint 一致', async () => {
    const storage = new JsonStorageAdapter(tmpDir);
    await storage.saveCheckpoint('n1', { foo: 'bar', step: 3 });
    const ck = await storage.loadCheckpoint('n1');
    expect(ck).toEqual({ foo: 'bar', step: 3 });
  });

  it('不存在的快照返回 null', async () => {
    const storage = new JsonStorageAdapter(tmpDir);
    expect(await storage.loadCheckpoint('missing')).toBeNull();
  });
});

describe('workflow-service：L4 服务契约', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-workflow-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('getChildContext 返回父节点上下文的精简摘要', () => {
    const storage = new JsonStorageAdapter(tmpDir);
    const parent = { ...node('root', null, 'not_started', 0), context_payload: { goal: '实现登录功能' } };
    const child = node('a', 'root', 'not_started', 1);
    const svc = new WorkflowService(snapshotOf([parent, child]), storage, noopRuntime, agreeUi);

    expect(svc.getChildContext('a')).toContain('实现登录功能');
  });

  it('根节点 getChildContext 返回空串', () => {
    const storage = new JsonStorageAdapter(tmpDir);
    const svc = new WorkflowService(snapshotOf([node('root', null, 'not_started', 0)]), storage, noopRuntime, agreeUi);

    expect(svc.getChildContext('root')).toBe('');
  });

  it('dispatchTool 分发 add_node 与 list_nodes', async () => {
    const storage = new JsonStorageAdapter(tmpDir);
    const root = node('root', null, 'not_started', 0);
    const svc = new WorkflowService(snapshotOf([root]), storage, noopRuntime, agreeUi);

    await svc.dispatchTool('workflow_add_node', { parent_id: 'root', node: node('a', 'root', 'not_started', 1) });
    const list = (await svc.dispatchTool('workflow_list_nodes', {})) as AgentNode[];

    expect(list.map((n) => n.node_id).sort()).toEqual(['a', 'root']);
  });

  it('进入带默认输入的状态时，注入该输入', async () => {
    const storage = new JsonStorageAdapter(tmpDir);
    let injected: string | null = null;
    const spyRuntime: WorkflowRuntimePort = {
      resume: async () => {},
      stop: async () => {},
      injectInput: async (text) => { injected = text; },
      emit: () => {},
    };
    const n = {
      ...node('n', null, 'implementing', 0),
      state_detail_overrides: { verifying: { operation_detail: '验收', enter_trigger: '开始验收' } },
    };
    const svc = new WorkflowService(snapshotOf([n]), storage, spyRuntime, agreeUi);

    await svc.requestTransition('n', 'verifying');

    expect(injected).toBe('开始验收');
  });
});

describe('workflow-service：埋点与断点快照', () => {
  it('流转时落 trace 和 checkpoint', async () => {
    const traces: TraceLog[] = [];
    const checkpoints: Array<{ nodeId: string; snapshot: unknown }> = [];
    const spyStorage: WorkflowStoragePort = {
      load: async () => null,
      save: async () => {},
      appendTrace: async (log) => { traces.push(log); },
      saveCheckpoint: async (nodeId, snapshot) => { checkpoints.push({ nodeId, snapshot }); },
      loadCheckpoint: async () => null,
    };
    const svc = new WorkflowService(snapshotOf([node('n', null, 'discussing', 0)]), spyStorage, noopRuntime, agreeUi);

    await svc.requestTransition('n', 'implementing');

    expect(traces).toHaveLength(1);
    expect(traces[0]?.action).toBe('transition');
    expect(traces[0]?.state_from).toBe('discussing');
    expect(traces[0]?.state_to).toBe('implementing');
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]?.nodeId).toBe('n');
  });

  it('报故障时落 fault trace', async () => {
    const traces: TraceLog[] = [];
    const spyStorage: WorkflowStoragePort = {
      load: async () => null,
      save: async () => {},
      appendTrace: async (log) => { traces.push(log); },
      saveCheckpoint: async () => {},
      loadCheckpoint: async () => null,
    };
    const svc = new WorkflowService(snapshotOf([node('n', null, 'discussing', 0)]), spyStorage, noopRuntime, agreeUi);
    const fault: WorkflowFault = { kind: 'ai_semantic', message: 'x', retryable: false };

    await svc.reportFault('n', fault);

    expect(traces).toHaveLength(1);
    expect(traces[0]?.action).toBe('fault');
    expect(traces[0]?.fault?.kind).toBe('ai_semantic');
  });
});
