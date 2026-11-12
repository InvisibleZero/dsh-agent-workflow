import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { registerWorkflowTools } from '../src/host/workflow-tools';
import { ToolAliasStore } from '../src/host/tool-alias-store';

const SESSION = 'session-back-test';
const EXEC = { agent: { session: { id: SESSION } } } as any;

/** 最小运行环境：装网关，记下"请求推进"的入参；五个基础工具经 workflow_tool_call 调用。 */
function makeToolRuntime(repository: WorkflowRepository) {
  const tools: any[] = [];
  const requests: Array<{ sessionId: string; to: string; reason?: string }> = [];
  const logger = { info: () => {}, warn: () => {} };
  const ctx = {
    logger,
    inject: (_names: string[], callback: (scoped: any) => unknown) => callback({
      effect: (factory: () => unknown) => factory(),
      tools: {
        register: (definition: any) => { tools.push(definition); return () => {}; },
        guard: () => () => {},
      },
    }),
  };
  registerWorkflowTools(ctx as any, {
    repository,
    aliasStore: new ToolAliasStore(join(tmpdir(), 'wf-back-alias-unused')),
    recordToolEvent: () => {},
    stateContext: { refreshNow: async () => '' },
    isPresetSession: () => true,
    getState: (sessionId: string) => (sessionId === SESSION ? 'completed' : undefined),
    refreshState: async () => {},
    setState: () => {},
    logger,
    requestAdvance: (input) => requests.push(input),
    pendingAdvanceOf: () => null,
    clearPendingAdvance: () => {},
  } as any);
  const gateway = tools.find((tool) => tool.name === 'workflow_tool_call');
  return {
    advance: (args: any) => gateway.execute({ name: 'workflow_advance', args }, EXEC),
    requests,
  };
}

describe('状态迁移：已完结可以退回验收中 / 讨论中', () => {
  let dir: string;
  let workDir: string;
  let repo: WorkflowRepository;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-back-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-back-work-'));
    repo = new WorkflowRepository(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  async function seedAt(state: string) {
    const node = await repo.ensureNode({ sessionId: SESSION, workingDirectory: workDir });
    if (state !== 'discussing') {
      await repo.transitionNode({ id: node.workflowId, nodeId: node.nodeId, to: state });
    }
    return node;
  }

  it('已完结 → 验收中：允许，且不要求清单勾完', async () => {
    await seedAt('completed');
    const { advance, requests } = makeToolRuntime(repo);
    // 模板里的实施顺序是 4 条未勾选；退回验收中不该被"没勾完"挡住。
    const value = await advance({ to: 'verifying', reason: '验收漏了边界情况' });
    expect(value.value.requested).toBe('verifying');
    expect(requests[0]).toMatchObject({ sessionId: SESSION, to: 'verifying', reason: '验收漏了边界情况' });
  });

  it('已完结 → 讨论中：允许', async () => {
    await seedAt('completed');
    const { advance, requests } = makeToolRuntime(repo);
    const value = await advance({ to: 'discussing', reason: '方案方向要重定' });
    expect(value.value.requested).toBe('discussing');
    expect(requests[0]?.to).toBe('discussing');
  });

  it('正向 实现中 → 验收中：清单没勾完仍被拒', async () => {
    await seedAt('implementing');
    const { advance } = makeToolRuntime(repo);
    await expect(advance({ to: 'verifying' })).rejects.toThrow(/没勾完/);
  });

  it('返工不带 reason 被拒', async () => {
    await seedAt('completed');
    const { advance } = makeToolRuntime(repo);
    await expect(advance({ to: 'verifying' })).rejects.toThrow(/返工需要 reason/);
  });
});
