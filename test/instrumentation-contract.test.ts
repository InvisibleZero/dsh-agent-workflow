import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { registerWorkflowTools } from '../src/host/workflow-tools';
import { ToolRegistryStore } from '../src/host/tool-registry';
import { recordToolEvent } from '../src/host/tool-ledger';
import { findChecker } from '../src/engine/checkers';
import { EXTENSION_TOOLS } from '../src/schema/tool-catalog';

const SESSION = 'session-instrumentation-contract';

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
    registryStore: new ToolRegistryStore(join(tmpdir(), 'wf-instr-contract-registry-unused')),
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

describe('接口层：check_instrumentation 工具与检查器', () => {
  it('工具目录里有 check_instrumentation：指向 instrumentation、验收中可用、effect=exec', () => {
    const tool = EXTENSION_TOOLS.find((entry) => entry.name === 'check_instrumentation');
    expect(tool?.run).toEqual({ kind: 'checker', checker: 'instrumentation' });
    expect(tool?.allowed_states).toEqual(['verifying']);
    expect(tool?.effect).toBe('exec');
  });

  it('检查器 instrumentation 已登记：跑插件脚本、证据是 instrumentation.json', () => {
    const checker = findChecker('instrumentation');
    expect(checker?.evidence).toBe('instrumentation.json');
    expect(checker?.script).toBe('instrument-apply.mjs');
    expect(checker?.autoRun).toBe(true);
    expect(checker?.check(null).ok).toBe(false);
  });
});

describe('接口层：第 6 项「至少跑一次扫描」门禁', () => {
  let dir: string;
  let workDir: string;
  let repo: WorkflowRepository;
  let stateRef: { value: string | undefined };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-instr-gate-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-instr-gate-work-'));
    repo = new WorkflowRepository(dir);
    stateRef = { value: 'verifying' };
    await writeFile(join(workDir, 'evidence.md'), 'x\n', 'utf8');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  async function seedVerifying() {
    const node = await repo.ensureNode({ sessionId: SESSION, workingDirectory: workDir });
    await repo.transitionNode({ id: node.workflowId, nodeId: node.nodeId, to: 'verifying' });
    return node;
  }

  it('没跑过扫描直接报第 6 项 pass：被拒（至少跑一次门禁）', async () => {
    await seedVerifying();
    const { tool } = makeRuntime(repo, stateRef);
    await expect(tool('workflow_verify_report').execute({
      item: '6', result: 'pass', summary: '埋点到位', anchors: [{ file: 'evidence.md' }],
    }, exec)).rejects.toThrow(/至少要跑过一次/);
  });

  it('跑过一次扫描（哪怕 ok=false）就放行：结果仍由 AI 判，不卡 ok', async () => {
    const node = await seedVerifying();
    await repo.recordCheckerRun({
      workflowId: node.workflowId, nodeId: node.nodeId,
      checkerId: 'instrumentation', ok: false, findings: 3, exit_code: 0,
    });
    const { tool } = makeRuntime(repo, stateRef);
    const value = await tool('workflow_verify_report').execute({
      item: '6', result: 'pass', summary: '扫过，AI 判断埋点到位', anchors: [{ file: 'evidence.md' }],
    }, exec);
    expect(value.value.item).toMatchObject({ id: 6, mark: 'pass' });
  });

  it('第 6 项报 deferred 不受「至少跑一次」限制（不是 pass）', async () => {
    await seedVerifying();
    const { tool } = makeRuntime(repo, stateRef);
    const value = await tool('workflow_verify_report').execute({
      item: '6', result: 'deferred', summary: '结构有孤儿，本轮不修',
      anchors: [{ file: 'evidence.md' }],
      findings: [{ location: 'a', problem: 'b', why_not_fixed: 'c', impact: 'd' }],
    }, exec);
    expect(value.value.item).toMatchObject({ id: 6, mark: 'deferred' });
  });
});
