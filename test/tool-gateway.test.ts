import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { registerWorkflowTools } from '../src/host/workflow-tools';

const SESSION = 'session-gateway-test';
const EXEC = { agent: { session: { id: SESSION } } };

/** 最小运行时：只注册工具，命令用假执行器（不真跑）。 */
function makeToolRuntime() {
  const tools: any[] = [];
  const logs: string[] = [];
  const ctx = {
    logger: { info: (m: string) => logs.push(m), warn: (m: string) => logs.push(m) },
    inject: (_names: string[], cb: (scoped: any) => any) => cb({
      effect: (f: () => any) => f(),
      tools: {
        register: (def: any) => { tools.push(def); return () => {}; },
        guard: () => () => {},
      },
    }),
  };
  return { ctx, tools };
}

describe('工具网关（删治理后）：只留 workflow_tool_call 薄网关', () => {
  let dir: string;
  let workDir: string;
  let repo: WorkflowRepository;
  let workflowId: string;
  let state: string;
  let tools: any[];
  let commands: string[];

  function mount() {
    const runtime = makeToolRuntime();
    commands = [];
    const deps = {
      repository: repo,
      stateContext: { refreshNow: async () => '' },
      isPresetSession: () => true,
      getState: () => state,
      refreshState: async () => {},
      setState: () => {},
      logger: runtime.ctx.logger,
      requestAdvance: () => {},
      pendingAdvanceOf: () => null,
      clearPendingAdvance: () => {},
      notify: () => {},
      runCommand: async (input: { command: string }) => {
        commands.push(input.command);
        return { ok: true, exit_code: 0, timed_out: false, ms: 1, tail: '' };
      },
    };
    registerWorkflowTools(runtime.ctx, deps as any);
    tools = runtime.tools;
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-gateway-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-gateway-work-'));
    await writeFile(join(workDir, 'package.json'), '{}', 'utf8');
    repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: workDir });
    workflowId = created.id;
    await repo.bindSession({ id: workflowId, nodeId: workflowId, sessionId: SESSION });
    state = 'verifying';
    const evidenceDir = join(workDir, '.workflow', 'evidence');
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(join(evidenceDir, 'deps.json'), JSON.stringify({ summary: { violations: [], totalCruised: 12 } }), 'utf8');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('只注册 workflow_tool_call 一个网关工具，不再有 workflow_tool_add', () => {
    mount();
    expect(tools.map((t) => t.name)).toContain('workflow_tool_call');
    expect(tools.map((t) => t.name)).not.toContain('workflow_tool_add');
  });

  it('目录外名字被拒（unknown-tool）', async () => {
    mount();
    const call = tools.find((t) => t.name === 'workflow_tool_call');
    await expect(call.execute({ name: 'nope', args: {} }, EXEC)).rejects.toThrow(/工具目录里没有/);
  });

  it('check_deps 经网关调用：探测 js 栈 → depcruise 命令 → 读证据判定通过', async () => {
    mount();
    const call = tools.find((t) => t.name === 'workflow_tool_call');
    const value = await call.execute({ name: 'check_deps', args: {} }, EXEC);
    expect(value.ok).toBe(true);
    expect(value.name).toBe('check_deps');
    expect(commands.some((c) => c.includes('depcruise'))).toBe(true);
  });

  it('非法 target（绝对路径）被拒', async () => {
    mount();
    const call = tools.find((t) => t.name === 'workflow_tool_call');
    await expect(call.execute({ name: 'check_deps', args: { target: '/etc/passwd' } }, EXEC)).rejects.toThrow(/绝对路径/);
  });
});
