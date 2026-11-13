import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { registerWorkflowTools } from '../src/host/workflow-tools';
import { ToolRegistryStore } from '../src/host/tool-registry';
import { clearToolEvents, recentToolEvents, recordToolEvent } from '../src/host/tool-ledger';

/**
 * 网关契约：模型只能经 workflow_tool_call 使用、经 workflow_tool_add 登记扩展工具。
 * 覆盖「调用四类拒绝 + 登记四类拒绝 + 审批三态 + 检查器三态（通过 / 不合格 / 缺证据）」。
 */
function makeToolRuntime() {
  const logs: string[] = [];
  const tools: any[] = [];
  let guard: ((exec: any) => string | undefined) | undefined;
  const ctx = {
    logger: {
      info: (message: string) => logs.push(message),
      warn: (message: string) => logs.push(message),
    },
    inject: (_names: string[], callback: (scoped: any) => any) => callback({
      effect: (factory: () => any) => factory(),
      tools: {
        register: (definition: any) => { tools.push(definition); return () => {}; },
        guard: (fn: (exec: any) => string | undefined) => { guard = fn; return () => {}; },
      },
    }),
  };
  return { ctx, logs, tools, guardOf: () => guard };
}

const SESSION = 'session-gateway-test';
const EXEC = { agent: { session: { id: SESSION } } };

/** 登记一个扩展工具：指向内置的依赖检查器。 */
const DEPS_TOOL = {
  name: 'check_deps_extra',
  description: '跑依赖检查。读 depcruise 产物，报环与跨层引用。',
  run: { kind: 'checker', checker: 'deps' },
  effect: 'read-state',
  allowed_states: ['verifying'],
  sample_args: {},
};

describe('工具网关：调用、登记与审批', () => {
  let dir: string;
  let workDir: string;
  let evidenceFile: string;
  let repo: WorkflowRepository;
  let workflowId: string;
  let state: string;
  let runtime: ReturnType<typeof makeToolRuntime>;
  let tools: any[];
  /** 每次审批的 reason：断言「审批里能看到用哪个检查器」。 */
  let approvals: string[];
  /** 假执行器收到的命令：断言 target 有没有被拼进去。 */
  let commands: string[];
  let approvalOutcome: string;

  function mount() {
    runtime = makeToolRuntime();
    const store = new ToolRegistryStore(dir);
    commands = [];
    const deps = {
      repository: repo,
      registryStore: store,
      recordToolEvent,
      stateContext: { refreshNow: async () => '' },
      isPresetSession: () => true,
      getState: () => state,
      refreshState: async () => {},
      setState: () => {},
      logger: { info: (message: string) => runtime.logs.push(message), warn: (message: string) => runtime.logs.push(message) },
      requestAdvance: () => {},
      pendingAdvanceOf: () => null,
      clearPendingAdvance: () => {},
      notify: () => {},
      // 检查命令不真跑：测试只关心「执行后拿产物判定」这条链路。
      runCommand: async (input: { command: string }) => {
        commands.push(input.command);
        return { ok: true, exit_code: 0, timed_out: false, ms: 1, tail: '' };
      },
      requestApproval: async (input: { reason: string }) => {
        approvals.push(input.reason);
        return approvalOutcome;
      },
    };
    registerWorkflowTools(runtime.ctx, deps);
    tools = runtime.tools;
    return {
      call: tools.find((tool) => tool.name === 'workflow_tool_call'),
      add: tools.find((tool) => tool.name === 'workflow_tool_add'),
    };
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-gateway-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-gateway-work-'));
    repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: workDir });
    workflowId = created.id;
    await repo.bindSession({ id: workflowId, nodeId: workflowId, sessionId: SESSION });
    state = 'discussing';
    approvals = [];
    approvalOutcome = 'allowed-once';
    clearToolEvents();
    const evidenceDir = join(workDir, '.workflow', 'evidence');
    await mkdir(evidenceDir, { recursive: true });
    evidenceFile = join(evidenceDir, 'deps.json');
    await writeFile(evidenceFile, JSON.stringify({ summary: { violations: [], totalCruised: 12 } }), 'utf8');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('只注册两个网关工具，不再原生注册五个基础工具', () => {
    mount();
    expect(tools.map((tool) => tool.name).sort()).toEqual(['workflow_tool_add', 'workflow_tool_call']);
  });

  it('目录外名字：拒绝并记账 unknown-tool', async () => {
    const { call } = mount();
    await expect(call.execute({ name: 'nope', args: {} }, EXEC)).rejects.toThrow(/工具目录里没有「nope」/);
    const entry = recentToolEvents().find((item) => item.code === 'unknown-tool');
    expect(entry?.decision).toBe('deny');
    expect(entry?.name).toBe('nope');
  });

  it('阶段不符：讨论中调用验收报备被拒', async () => {
    const { call } = mount();
    await expect(call.execute({
      name: 'workflow_verify_report',
      args: { item: '1', result: 'pass', summary: 'x', anchors: [{ file: 'a.md' }] },
    }, EXEC)).rejects.toThrow(/不允许调用/);
    expect(recentToolEvents().some((item) => item.code === 'stage-denied')).toBe(true);
  });

  it('参数不符：基础工具的 action 不在枚举里', async () => {
    const { call } = mount();
    await expect(call.execute({ name: 'workflow_manual', args: { target: 'project', action: 'bogus' } }, EXEC))
      .rejects.toThrow(/参数不符/);
    expect(recentToolEvents().some((item) => item.code === 'arguments-invalid')).toBe(true);
  });

  it('登记：审批通过后可用，调用检查器通过，审计留下 checker / ok / findings', async () => {
    const { call, add } = mount();
    const added = await add.execute(DEPS_TOOL, EXEC);
    expect(added.ok).toBe(true);
    expect(added.entry).toMatchObject({ name: 'check_deps_extra', run: 'checker:deps', version: 1 });
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toContain('checker:deps');

    state = 'verifying';
    const called = await call.execute({ name: 'check_deps_extra', args: {} }, EXEC);
    expect(called.run).toBe('checker:deps');
    expect(called.value.ok).toBe(true);
    expect(called.value.findings).toEqual([]);
    expect(called.value.stats.modules).toBe(12);

    const allowCall = recentToolEvents().find((item) => item.kind === 'call' && item.name === 'check_deps_extra' && item.decision === 'allow');
    expect(allowCall?.checker).toBe('deps');
    expect(allowCall?.ok).toBe(true);
    expect(allowCall?.findings).toBe(0);
  });

  it('检查器报不合格：ok=false 并列出 findings，不抛错', async () => {
    await writeFile(evidenceFile, JSON.stringify({
      summary: {
        violations: [{
          from: 'src/client/a.ts',
          to: 'src/host/b.ts',
          rule: { name: 'client-must-not-touch-host', severity: 'error' },
        }],
      },
    }), 'utf8');
    const { call, add } = mount();
    await add.execute(DEPS_TOOL, EXEC);

    state = 'verifying';
    const called = await call.execute({ name: 'check_deps_extra', args: {} }, EXEC);
    expect(called.value.ok).toBe(false);
    expect(called.value.findings).toHaveLength(1);
    expect(called.value.findings[0].problem).toContain('client-must-not-touch-host');
  });

  it('缺证据文件：ok=false，findings 里给出生成命令', async () => {
    await rm(evidenceFile);
    const { call, add } = mount();
    await add.execute(DEPS_TOOL, EXEC);

    state = 'verifying';
    const called = await call.execute({ name: 'check_deps_extra', args: {} }, EXEC);
    expect(called.value.ok).toBe(false);
    expect(called.value.findings[0].problem).toContain('depcruise');
  });

  it('证据文件坏 JSON：判不合格，不当成通过', async () => {
    await writeFile(evidenceFile, '{ broken', 'utf8');
    const { call, add } = mount();
    await add.execute(DEPS_TOOL, EXEC);

    state = 'verifying';
    const called = await call.execute({ name: 'check_deps_extra', args: {} }, EXEC);
    expect(called.value.ok).toBe(false);
    expect(called.value.findings[0].problem).toContain('解析失败');
  });

  it('审批拒绝：不写入，记 approval-denied', async () => {
    approvalOutcome = 'rejected';
    const { add } = mount();
    await expect(add.execute(DEPS_TOOL, EXEC)).rejects.toThrow(/没有通过审批（rejected）/);
    const denied = recentToolEvents().find((item) => item.code === 'approval-denied');
    expect(denied?.decision).toBe('deny');
    expect(denied?.approval).toBe('rejected');
  });

  it('审批不可用：按拒绝处理（fail-closed），不写入', async () => {
    approvalOutcome = 'unavailable';
    const { add } = mount();
    await expect(add.execute(DEPS_TOOL, EXEC)).rejects.toThrow(/没有可用的审批人/);
    expect(recentToolEvents().some((item) => item.code === 'approval-denied')).toBe(true);
  });

  it('update：重新审批、version 递增、整条替换', async () => {
    const { add } = mount();
    await add.execute(DEPS_TOOL, EXEC);
    approvals = [];
    const updated = await add.execute({
      ...DEPS_TOOL,
      mode: 'update',
      description: '跑依赖检查（改过描述）。',
    }, EXEC);
    expect(updated.entry.version).toBe(2);
    expect(approvals).toHaveLength(1);
  });

  it('update 一个不存在的工具：拒绝，不调审批', async () => {
    const { add } = mount();
    await expect(add.execute({ ...DEPS_TOOL, mode: 'update' }, EXEC)).rejects.toThrow(/没有叫「check_deps_extra」/);
    expect(approvals).toHaveLength(0);
  });

  it('登记被拒：重名 / 验收中 / 指向不存在的检查器', async () => {
    const { add } = mount();
    await add.execute(DEPS_TOOL, EXEC);
    await expect(add.execute(DEPS_TOOL, EXEC)).rejects.toThrow(/已经有叫「check_deps_extra」/);

    state = 'verifying';
    await expect(add.execute({ ...DEPS_TOOL, name: 'late_check' }, EXEC)).rejects.toThrow(/不能登记工具/);

    state = 'discussing';
    await expect(add.execute({
      ...DEPS_TOOL,
      name: 'bad_check',
      run: { kind: 'checker', checker: 'nope' },
    }, EXEC)).rejects.toThrow(/没有叫「nope」的检查器/);
  });

  it('target 覆盖默认路径：命令里拼的就是传进去的目标', async () => {
    const { call, add } = mount();
    await add.execute(DEPS_TOOL, EXEC);
    state = 'verifying';

    await call.execute({ name: 'check_deps_extra', args: {} }, EXEC);
    expect(commands.at(-1)).toContain('depcruise src');

    await call.execute({ name: 'check_deps_extra', args: { target: 'test/unit' } }, EXEC);
    expect(commands.at(-1)).toContain('depcruise test/unit');
  });

  it('非法 target 被拒：绝对路径 / .. / shell 元字符都不行', async () => {
    const { call, add } = mount();
    await add.execute(DEPS_TOOL, EXEC);
    state = 'verifying';

    for (const target of ['../etc', '/abs/path', 'a;rm -rf', 'a b', 'a|b']) {
      await expect(call.execute({ name: 'check_deps_extra', args: { target } }, EXEC))
        .rejects.toThrow(/target/);
    }
    expect(commands).toEqual([]);
  });

  it('压测检查器：必须传 target，URL 会进命令', async () => {
    const regressionTool = {
      name: 'check_regression_extra',
      description: '跑压测。目标地址由调用方给。',
      run: { kind: 'checker', checker: 'regression' },
      effect: 'exec',
      allowed_states: ['verifying'],
      sample_args: {},
    };
    const { call, add } = mount();
    await add.execute(regressionTool, EXEC);
    state = 'verifying';

    await expect(call.execute({ name: 'check_regression_extra', args: {} }, EXEC))
      .rejects.toThrow(/需要目标地址/);

    await call.execute({ name: 'check_regression_extra', args: { target: 'http://127.0.0.1:3000' } }, EXEC);
    expect(commands.at(-1)).toContain('autocannon http://127.0.0.1:3000');
  });

  it('登记表损坏：扩展工具不可用（unknown-tool），基础工具照常', async () => {
    const { call, add } = mount();
    await add.execute(DEPS_TOOL, EXEC);
    await writeFile(join(dir, 'tool-registry.json'), '{ broken', 'utf8');

    state = 'verifying';
    await expect(call.execute({ name: 'check_deps_extra', args: {} }, EXEC))
      .rejects.toThrow(/工具目录里没有「check_deps_extra」/);

    const read = await call.execute({ name: 'workflow_manual', args: { target: 'session', action: 'read' } }, EXEC);
    expect(read.ok).toBe(true);
    expect(runtime.logs.some((line) => line.includes('tool registry corrupt'))).toBe(true);
  });
});
