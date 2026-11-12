import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { registerWorkflowTools } from '../src/host/workflow-tools';
import { ToolAliasStore } from '../src/host/tool-alias-store';
import { clearToolEvents, recentToolEvents, recordToolEvent } from '../src/host/tool-ledger';

/**
 * 网关契约：模型只能经 workflow_tool_call 使用、经 workflow_tool_add 申请。
 * 这里用真仓储 + 假 tools 服务，覆盖「五类拒绝 + 别名生效 + 两本账」。
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

const ALIAS_INPUT = {
  name: 'note_decision',
  description: '记一条决策（固定写入项目手册的决策记录）',
  base_tool: 'workflow_manual',
  fixed_args: { target: 'project', action: 'append_entry', section: '决策记录' },
  sample_args: { content: '决定 A', tags: ['决策'] },
};

describe('工具网关：调用与申请', () => {
  let dir: string;
  let workDir: string;
  let repo: WorkflowRepository;
  let workflowId: string;
  let state: string;
  let runtime: ReturnType<typeof makeToolRuntime>;
  let tools: any[];

  function mount() {
    runtime = makeToolRuntime();
    const store = new ToolAliasStore(dir);
    const deps = {
      repository: repo,
      aliasStore: store,
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
    clearToolEvents();
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

  it('参数不符：action 不在枚举里', async () => {
    const { call } = mount();
    await expect(call.execute({ name: 'workflow_manual', args: { target: 'project', action: 'bogus' } }, EXEC))
      .rejects.toThrow(/参数不符/);
    expect(recentToolEvents().some((item) => item.code === 'arguments-invalid')).toBe(true);
  });

  it('申请别名：四关通过即登记，调用后真写项目手册', async () => {
    const { call, add } = mount();
    const added = await add.execute(ALIAS_INPUT, EXEC);
    expect(added.ok).toBe(true);
    expect(added.entry).toMatchObject({ name: 'note_decision', base_tool: 'workflow_manual', version: 1 });

    const called = await call.execute({ name: 'note_decision', args: { content: '决定 A', tags: ['决策'] } }, EXEC);
    expect(called.base_tool).toBe('workflow_manual');
    expect(called.value.ok).toBe(true);

    const manual = await repo.readGlobalManual(workflowId);
    expect(manual).toContain('决定 A');

    const kinds = recentToolEvents().map((item) => `${item.kind}:${item.name}:${item.decision}`);
    expect(kinds).toContain('add:note_decision:allow');
    expect(kinds).toContain('call:note_decision:allow');
  });

  it('覆盖固定参数：别名调用里再传 target 被拒', async () => {
    const { call, add } = mount();
    await add.execute(ALIAS_INPUT, EXEC);
    await expect(call.execute({ name: 'note_decision', args: { target: 'session', content: 'x', tags: ['决策'] } }, EXEC))
      .rejects.toThrow(/固定参数/);
    expect(recentToolEvents().some((item) => item.code === 'arguments-override')).toBe(true);
  });

  it('申请被拒：重名 / 验收中登记 / 基础工具不存在', async () => {
    const { add } = mount();
    await add.execute(ALIAS_INPUT, EXEC);
    await expect(add.execute(ALIAS_INPUT, EXEC)).rejects.toThrow(/已经有叫「note_decision」/);

    state = 'verifying';
    await expect(add.execute({ ...ALIAS_INPUT, name: 'late_decision' }, EXEC)).rejects.toThrow(/不能新增工具/);

    state = 'discussing';
    await expect(add.execute({ ...ALIAS_INPUT, name: 'chain_tool', base_tool: 'note_decision' }, EXEC))
      .rejects.toThrow(/基础工具只能是/);
  });

  it('别名文件损坏：别名不可用（unknown-tool），基础工具照常', async () => {
    const { call, add } = mount();
    await add.execute(ALIAS_INPUT, EXEC);
    await writeFile(join(dir, 'tool-aliases.json'), '{ broken', 'utf8');

    await expect(call.execute({ name: 'note_decision', args: { content: 'x', tags: ['决策'] } }, EXEC))
      .rejects.toThrow(/工具目录里没有「note_decision」/);

    const read = await call.execute({ name: 'workflow_manual', args: { target: 'session', action: 'read' } }, EXEC);
    expect(read.ok).toBe(true);
    expect(runtime.logs.some((line) => line.includes('alias store corrupt'))).toBe(true);
  });
});
