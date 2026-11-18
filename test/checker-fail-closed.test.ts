import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { registerWorkflowTools } from '../src/host/workflow-tools';

const SESSION = 'session-fail-closed-test';
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

describe('门禁 fail-closed：找不到项目 / 命令失败都不能假绿', () => {
  let dir: string;
  let workDir: string;
  let repo: WorkflowRepository;
  let tools: any[];
  let runResult: any;

  function mount() {
    const runtime = makeToolRuntime();
    const deps = {
      repository: repo,
      stateContext: { refreshNow: async () => '' },
      isPresetSession: () => true,
      getState: () => 'verifying',
      refreshState: async () => {},
      setState: () => {},
      logger: runtime.ctx.logger,
      requestAdvance: () => {},
      pendingAdvanceOf: () => null,
      clearPendingAdvance: () => {},
      notify: () => {},
      runCommand: async () => runResult,
      // 跳过真实工具探测 / 离线安装：测试不依赖本机 Python 装了 pytest / lint-imports。
      ensurePythonTools: () => true,
    };
    registerWorkflowTools(runtime.ctx, deps as any);
    tools = runtime.tools;
  }

  async function call(toolName: string, args: any) {
    const call = tools.find((t) => t.name === 'workflow_tool_call');
    // workflow_tool_call 返回 { ok, name, run, value }，检查器结论在 value 里。
    return call.execute({ name: toolName, args }, EXEC);
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-fail-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-fail-work-'));
    repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: workDir });
    await repo.bindSession({ id: created.id, nodeId: created.id, sessionId: SESSION });
    runResult = { ok: true, exit_code: 0, timed_out: false, ms: 1, tail: '' };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('找不到项目根：不跑命令，返回候选（空工作区 → 候选为空）', async () => {
    mount();
    // 空目录：没有 pyproject.toml / package.json，上层也没有 → 找不到项目
    const result = await call('check_deps', {});
    expect(result.value.ok).toBe(false);
    expect(result.value.project_candidates).toEqual([]);
    expect(result.value.findings.some((f: any) => String(f.problem).includes('找不到项目根'))).toBe(true);
  });

  it('显式 stack 覆盖自动探测：pyproject + stack:js → 走 depcruise', async () => {
    mount();
    await writeFile(join(workDir, 'pyproject.toml'), '[project]\nname="x"\n', 'utf8');
    const evidenceDir = join(workDir, '.workflow', 'evidence');
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(join(evidenceDir, 'deps.json'), JSON.stringify({ summary: { violations: [] } }), 'utf8');
    runResult = { ok: true, exit_code: 0, timed_out: false, ms: 1, tail: '' };
    const result = await call('check_deps', { stack: 'js' });
    expect(result.value.ok).toBe(true);
    expect(result.value.command).toContain('depcruise');
  });

  it('命令失败 + 证据为空：不能判「零违规」假绿', async () => {
    mount();
    await writeFile(join(workDir, 'package.json'), '{}', 'utf8');
    const evidenceDir = join(workDir, '.workflow', 'evidence');
    await mkdir(evidenceDir, { recursive: true });
    // 空证据：check() 会读成「零违规」
    await writeFile(join(evidenceDir, 'deps.json'), JSON.stringify({ summary: { violations: [] } }), 'utf8');
    // 命令失败（exit 1）
    runResult = { ok: false, exit_code: 1, timed_out: false, ms: 1, tail: '' };
    const result = await call('check_deps', {});
    expect(result.value.ok).toBe(false);
    expect(result.value.findings.some((f: any) => String(f.problem).includes('命令失败'))).toBe(true);
  });

  it('命令成功 + 零违规：正常通过（不能误伤）', async () => {
    mount();
    await writeFile(join(workDir, 'package.json'), '{}', 'utf8');
    const evidenceDir = join(workDir, '.workflow', 'evidence');
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(join(evidenceDir, 'deps.json'), JSON.stringify({ summary: { violations: [] } }), 'utf8');
    runResult = { ok: true, exit_code: 0, timed_out: false, ms: 1, tail: '' };
    const result = await call('check_deps', {});
    expect(result.value.ok).toBe(true);
  });

  it('python 项目缺 [tool.importlinter]：明确报缺配置，不跑命令', async () => {
    mount();
    await writeFile(join(workDir, 'pyproject.toml'), '[project]\nname="x"\n', 'utf8');
    const result = await call('check_deps', {});
    expect(result.value.ok).toBe(false);
    expect(result.value.findings.some((f: any) => String(f.problem).includes('[tool.importlinter]'))).toBe(true);
  });

  it('python 项目有 [tool.importlinter]：正常跑命令', async () => {
    mount();
    await writeFile(
      join(workDir, 'pyproject.toml'),
      '[project]\nname="x"\n\n[tool.importlinter]\nroot_packages = ["x"]\n',
      'utf8',
    );
    const evidenceDir = join(workDir, '.workflow', 'evidence');
    await mkdir(evidenceDir, { recursive: true });
    // import-linter 文本报告，没有 Broken contracts 段 → 零违规
    await writeFile(
      join(evidenceDir, 'deps.json'),
      '=============\nImport Linter\n=============\n\n---------\nContracts\n---------\n\nAnalyzed 1 files, 0 dependencies.\n\nContracts: 1 kept, 0 broken.\n',
      'utf8',
    );
    runResult = { ok: true, exit_code: 0, timed_out: false, ms: 1, tail: '' };
    const result = await call('check_deps', {});
    expect(result.value.ok).toBe(true);
  });

  it('多项目：范围落到两个项目 → 都跑、按项目分开合并', async () => {
    mount();
    const py = join(workDir, 'pyproj');
    const js = join(workDir, 'jsproj');
    await mkdir(join(py, '.workflow', 'evidence'), { recursive: true });
    await mkdir(join(js, '.workflow', 'evidence'), { recursive: true });
    await writeFile(join(py, 'pyproject.toml'), '[project]\nname="x"\n\n[tool.importlinter]\nroot_packages = ["x"]\n', 'utf8');
    await writeFile(join(js, 'package.json'), '{}', 'utf8');
    await writeFile(join(py, '.workflow', 'evidence', 'deps.json'), 'Import Linter\n\nContracts: 1 kept, 0 broken.\n', 'utf8');
    await writeFile(join(js, '.workflow', 'evidence', 'deps.json'), JSON.stringify({ summary: { violations: [] } }), 'utf8');

    const found = await repo.findBySession(SESSION);
    await repo.extendSessionScope({
      workflowId: found!.workflowId,
      nodeId: found!.nodeId,
      paths: ['pyproj', 'jsproj'],
      reason: '测试多项目',
    });

    runResult = { ok: true, exit_code: 0, timed_out: false, ms: 1, tail: '' };
    const result = await call('check_deps', {});
    expect(result.value.ok).toBe(true);
    expect(result.value.per_project).toHaveLength(2);
    expect(result.value.per_project.map((item: any) => item.stack).sort()).toEqual(['js', 'python']);
  });
});
