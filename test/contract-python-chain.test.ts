import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { registerWorkflowTools } from '../src/host/workflow-tools';

const SESSION = 'session-py-chain-test';
const EXEC = { agent: { session: { id: SESSION } } };

function makeToolRuntime() {
  const tools: any[] = [];
  const ctx = {
    logger: { info: () => {}, warn: () => {} },
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

describe('垂直切片：Python 项目上 check_contract 全链路', () => {
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
      // 不真跑 pytest：测试只关心「执行后拿产物归一化判定」这条链路。
      runCommand: async (input: { command: string }) => {
        commands.push(input.command);
        return { ok: true, exit_code: 0, timed_out: false, ms: 1, tail: '' };
      },
      // 跳过真实工具探测 / 离线安装：测试不依赖本机 Python 装了 pytest。
      ensurePythonTools: () => true,
    };
    registerWorkflowTools(runtime.ctx, deps as any);
    tools = runtime.tools;
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-py-chain-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-py-chain-work-'));
    // 让 resolvePython 稳定命中（用真实存在的 node 路径当「Python」；命令本身被 mock，不真跑）。
    process.env.DSH_PYTHON = process.execPath;
    // Python 项目 marker：探测到 python 栈
    await writeFile(join(workDir, 'pyproject.toml'), '[project]\nname = "x"\n', 'utf8');
    repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: workDir });
    workflowId = created.id;
    await repo.bindSession({ id: workflowId, nodeId: workflowId, sessionId: SESSION });
    state = 'verifying';
    const evidenceDir = join(workDir, '.workflow', 'evidence');
    await mkdir(evidenceDir, { recursive: true });
    // pytest-json-report 产物（真实 pytest --json-report 的形状）
    await writeFile(join(evidenceDir, 'contract.json'), JSON.stringify({ summary: { total: 2, passed: 2, failed: 0, error: 0 } }), 'utf8');
  });

  afterEach(async () => {
    delete process.env.DSH_PYTHON;
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('探测 python → pytest 命令 → 读证据 → 归一化 → 判定通过', async () => {
    mount();
    const call = tools.find((t) => t.name === 'workflow_tool_call');
    const value = await call.execute({ name: 'check_contract', args: {} }, EXEC);
    expect(value.ok).toBe(true);
    // 探测到 pyproject.toml → python 栈 → 选的是 pytest 命令
    expect(commands.some((c) => c.includes('pytest'))).toBe(true);
    expect(commands.some((c) => c.includes('contract.json'))).toBe(true);
  });
});
