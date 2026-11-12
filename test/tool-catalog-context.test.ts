import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { registerWorkflowStateContext } from '../src/host/workflow-state-context';

/**
 * 工具目录这一层：内容由宿主半现算（基础 5 条 + 别名），注入走 systemPrompt.context。
 * 读目录失败不能把整轮注入拖垮——目录缺了也要继续，但要留 warn。
 */
function makeRuntime() {
  const logs: string[] = [];
  const warns: string[] = [];
  const handlers = new Map<string, any>();
  const ctx = {
    logger: {
      info: (message: string) => logs.push(message),
      warn: (message: string) => warns.push(message),
    },
    on: (event: string, handler: any) => { handlers.set(event, handler); },
    inject: (_names: string[], callback: (scoped: any) => any) => callback({
      effect: (factory: () => any) => factory(),
      systemPrompt: { context: () => () => {} },
    }),
  };
  return { ctx, logs, warns, handlers };
}

describe('工具目录注入层', () => {
  let dir: string;
  let workDir: string;
  let repo: WorkflowRepository;
  const sessionId = 'session-catalog-test';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-catalog-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-catalog-work-'));
    repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: workDir });
    await repo.bindSession({ id: created.id, nodeId: created.id, sessionId });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  async function mount(catalogTextOf?: (workflowId: string) => Promise<string>) {
    const runtime = makeRuntime();
    const api = registerWorkflowStateContext(runtime.ctx, repo, () => true, { catalogTextOf });
    const scopedSpecs: any[] = [];
    const agentScope = { systemPrompt: { context: (spec: any) => { scopedSpecs.push(spec); return () => {}; } } };
    runtime.handlers.get('agent/created').call(agentScope, { agent: { session: { id: sessionId } } });
    await api.refreshNow(sessionId);
    return { runtime, scopedSpecs };
  }

  it('目录文本原样挂进 tool-catalog 层', async () => {
    const { scopedSpecs } = await mount(async () => '【工具目录】\n- workflow_advance（必填：to）');
    const spec = scopedSpecs.find((item) => item.name === 'workflow:tool-catalog');
    expect(spec).toBeDefined();
    expect(spec.text()).toContain('workflow_advance');
    expect(spec.text()).toContain('【工具目录】');
  });

  it('没有 provider 时这一层为空（不占预算）', async () => {
    const { scopedSpecs } = await mount(undefined);
    const spec = scopedSpecs.find((item) => item.name === 'workflow:tool-catalog');
    expect(spec).toBeDefined();
    expect(spec.text()).toBe('');
  });

  it('provider 抛错：注入照常完成，目录层为空并留 warn', async () => {
    const { runtime, scopedSpecs } = await mount(async () => { throw new Error('alias store boom'); });
    const spec = scopedSpecs.find((item) => item.name === 'workflow:tool-catalog');
    expect(spec.text()).toBe('');
    // 其余层不受影响。
    expect(scopedSpecs.find((item) => item.name === 'workflow:header').text()).toContain('当前状态');
    expect(runtime.warns.some((line) => line.includes('tool catalog failed'))).toBe(true);
  });
});
