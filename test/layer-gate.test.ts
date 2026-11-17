import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { registerWorkflowTools } from '../src/host/workflow-tools';
import { ToolRegistryStore } from '../src/host/tool-registry';
import { recordToolEvent } from '../src/host/tool-ledger';
import { EXTENSION_TOOLS, LAYER_GATES } from '../src/schema/tool-catalog';

const SESSION = 'session-layer-gate';

function makeRuntime(repository: WorkflowRepository, stateRef: { value: string | undefined }) {
  const tools = new Map<string, any>();
  const logger = { info: () => {}, warn: () => {} };
  const ctx = {
    logger,
    inject: (_names: string[], callback: (scoped: any) => unknown) => callback({
      effect: (factory: () => unknown) => factory(),
      tools: {
        register: (definition: any) => { tools.set(definition.name, definition); return () => {}; },
        guard: () => () => {},
      },
    }),
  };
  registerWorkflowTools(ctx as any, {
    repository,
    registryStore: new ToolRegistryStore(join(tmpdir(), 'wf-layer-gate-registry-unused')),
    recordToolEvent,
    stateContext: { refreshNow: async () => '' },
    isPresetSession: () => true,
    getState: () => stateRef.value,
    refreshState: async () => {},
    setState: () => {},
    logger,
    requestAdvance: () => {},
    pendingAdvanceOf: () => null,
    clearPendingAdvance: () => {},
  } as any);
  const gateway = tools.get('workflow_tool_call');
  return {
    tool: (name: string) => ({
      execute: (args: any, execArg: any) => gateway.execute({ name, args }, execArg),
    }),
  };
}

const exec = { agent: { session: { id: SESSION } } } as any;

describe('接口层：LAYER_GATES 小验收映射', () => {
  it('垂直切片→deps、接口层→contract、表现层→build 强制；数据/领域层轻', () => {
    expect(LAYER_GATES['垂直切片']).toEqual({ checker: 'deps', require_run: true });
    expect(LAYER_GATES['数据层']).toEqual({ checker: '', require_run: false });
    expect(LAYER_GATES['领域层']).toEqual({ checker: '', require_run: false });
    expect(LAYER_GATES['接口层']).toEqual({ checker: 'contract', require_run: true });
    expect(LAYER_GATES['表现层']).toEqual({ checker: 'build', require_run: true });
  });

  it('check_build 在目录里：指向 build、实现中+验收中可用、effect=exec', () => {
    const tool = EXTENSION_TOOLS.find((entry) => entry.name === 'check_build');
    expect(tool?.run).toEqual({ kind: 'checker', checker: 'build' });
    expect(tool?.allowed_states).toEqual(['implementing', 'verifying']);
    expect(tool?.effect).toBe('exec');
  });
});

describe('接口层：workflow_check 小验收门禁', () => {
  let dir: string;
  let workDir: string;
  let repo: WorkflowRepository;
  let stateRef: { value: string | undefined };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-layer-gate-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-layer-gate-work-'));
    repo = new WorkflowRepository(dir);
    stateRef = { value: 'implementing' };
    await writeFile(join(workDir, 'evidence.md'), 'x\n', 'utf8');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  async function seedImplementing() {
    const node = await repo.ensureNode({ sessionId: SESSION, workingDirectory: workDir });
    await repo.transitionNode({ id: node.workflowId, nodeId: node.nodeId, to: 'implementing' });
    return node;
  }

  it('接口层（require_run）没跑 check_contract 就勾：被拒', async () => {
    await seedImplementing();
    const { tool } = makeRuntime(repo, stateRef);
    await expect(tool('workflow_check').execute({
      item: '接口层 —— 完成标准：契约测试通过', done: true, evidence: '契约测试过了',
    }, exec)).rejects.toThrow(/先真跑过 check_contract/);
  });

  it('接口层跑过 check_contract 后勾：放行', async () => {
    const node = await seedImplementing();
    await repo.recordCheckerRun({
      workflowId: node.workflowId, nodeId: node.nodeId, checkerId: 'contract', ok: true, findings: 0, exit_code: 0,
    });
    const { tool } = makeRuntime(repo, stateRef);
    const value = await tool('workflow_check').execute({
      item: '接口层 —— 完成标准：契约测试通过', done: true, evidence: '契约测试过了',
    }, exec);
    expect(value.value.items.some((item: any) => item.label === '接口层 —— 完成标准：契约测试通过' && item.done)).toBe(true);
  });

  it('数据层（轻）不跑任何检查器也能勾', async () => {
    await seedImplementing();
    const { tool } = makeRuntime(repo, stateRef);
    const value = await tool('workflow_check').execute({
      item: '数据层 —— 完成标准：能读写、迁移可跑', done: true, evidence: '能读写',
    }, exec);
    expect(value.value.items.some((item: any) => item.label === '数据层 —— 完成标准：能读写、迁移可跑' && item.done)).toBe(true);
  });
});
