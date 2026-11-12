import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { registerWorkflowGuard, registerWorkflowTools } from '../src/host/workflow-tools';
import { ToolAliasStore } from '../src/host/tool-alias-store';
import { clearToolEvents, recordToolEvent } from '../src/host/tool-ledger';

/**
 * 工具侧的契约与埋点：
 * - 字数闸门拒写时，事件里必须有一条专门记录（能回答「为什么这一步没往下走」）；
 * - 门禁拿不到状态时默认拦住并留痕（不能静默放行）。
 *
 * 五个基础工具现在只能经网关调用；这里走 workflow_tool_call 的同一条执行路径。
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

function makeDeps(repository: WorkflowRepository, state: string | undefined, logs: string[]) {
  return {
    repository,
    aliasStore: new ToolAliasStore(join(tmpdir(), 'wf-alias-unused')),
    recordToolEvent,
    stateContext: { refreshNow: async () => '' },
    isPresetSession: () => true,
    getState: () => state,
    refreshState: async () => {},
    setState: () => {},
    logger: { info: (message: string) => logs.push(message), warn: (message: string) => logs.push(message) },
    requestAdvance: () => {},
    pendingAdvanceOf: () => null,
    clearPendingAdvance: () => {},
    notify: () => {},
  };
}

const SESSION = 'session-tool-test';
const EXEC = { agent: { session: { id: SESSION } } };

describe('workflow_manual 的字数闸门埋点（经网关）', () => {
  let dir: string;
  let workDir: string;
  let repo: WorkflowRepository;
  let workflowId: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-tool-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-tool-work-'));
    repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: workDir });
    workflowId = created.id;
    await repo.bindSession({ id: workflowId, nodeId: workflowId, sessionId: SESSION });
    clearToolEvents();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  function mount(state: string | undefined) {
    const runtime = makeToolRuntime();
    const deps = makeDeps(repo, state, runtime.logs);
    registerWorkflowGuard(runtime.ctx, deps);
    registerWorkflowTools(runtime.ctx, deps);
    const call = runtime.tools.find((tool) => tool.name === 'workflow_tool_call');
    const viaGateway = (name: string, args: any) => call.execute({ name, args }, EXEC);
    return { runtime, viaGateway };
  }

  it('301 字约束被拒，并单独记一条 manual gate rejected（带 target / section）', async () => {
    const { runtime, viaGateway } = mount('implementing');
    await expect(viaGateway('workflow_manual', {
      target: 'project', action: 'replace_section', section: '约束', content: 'x'.repeat(301),
    })).rejects.toThrow(/上限 300 字/);

    const gate = runtime.logs.find((line) => line.includes('manual gate rejected'));
    expect(gate).toBeDefined();
    expect(gate).toContain('target=project');
    expect(gate).toContain('section=约束');
  });

  it('300 字约束写入成功，记 bytes 与 chars（字数是可核对的）', async () => {
    const { runtime, viaGateway } = mount('implementing');
    const value = await viaGateway('workflow_manual', {
      target: 'project', action: 'replace_section', section: '约束', content: 'x'.repeat(300),
    });
    expect(value.value.ok).toBe(true);
    const written = runtime.logs.find((line) => line.includes('manual write'));
    expect(written).toContain('chars=300');
  });

  it('append_entry 不带 tags 被拒，并记一条 manual entry rejected', async () => {
    const { runtime, viaGateway } = mount('implementing');
    await expect(viaGateway('workflow_manual', {
      target: 'project', action: 'append_entry', section: '坑与防线', content: '没标签的条目',
    })).rejects.toThrow(/必须带至少一个标签/);

    const rejected = runtime.logs.find((line) => line.includes('manual entry rejected'));
    expect(rejected).toContain('action=append_entry');
    expect(rejected).toContain('section=坑与防线');
  });

  it('append_entry 带 tags 成功，返回登记后的标签表', async () => {
    const { viaGateway } = mount('implementing');
    const value = await viaGateway('workflow_manual', {
      target: 'project', action: 'append_entry', section: '坑与防线', tags: ['门禁'], content: '状态表永不回填',
    });
    expect(value.value.ok).toBe(true);
    expect(value.value.registered).toEqual(['门禁']);
    expect(value.value.entry).toBe('- [门禁] 状态表永不回填');
  });

  it('条目级写入只对项目手册开放', async () => {
    const { viaGateway } = mount('implementing');
    await expect(viaGateway('workflow_manual', {
      target: 'session', action: 'append_entry', section: '方案', tags: ['x'], content: 'y',
    })).rejects.toThrow(/只对项目手册/);
  });
});

describe('写操作门禁：未知状态默认拦截', () => {
  function mountGuard(state: string | undefined) {
    const runtime = makeToolRuntime();
    const deps = makeDeps(new WorkflowRepository(join(tmpdir(), 'wf-guard-unused')), state, runtime.logs);
    registerWorkflowGuard(runtime.ctx, deps);
    return runtime;
  }

  it('状态未知：拦住 write 并留 warn，而不是静默放行', () => {
    const runtime = mountGuard(undefined);
    const reason = runtime.guardOf()!({ agent: { session: { id: SESSION } }, name: 'write' });
    expect(reason).toContain('状态还没同步好');
    expect(runtime.logs.some((line) => line.includes('guard denied') && line.includes('state=unknown'))).toBe(true);
  });

  it('讨论中：拦住 write；实现中：放行', () => {
    const discussing = mountGuard('discussing');
    expect(discussing.guardOf()!({ agent: { session: { id: SESSION } }, name: 'write' })).toContain('讨论中');

    const implementing = mountGuard('implementing');
    expect(implementing.guardOf()!({ agent: { session: { id: SESSION } }, name: 'write' })).toBeUndefined();
  });

  it('只读工具不受门禁影响', () => {
    const runtime = mountGuard('discussing');
    expect(runtime.guardOf()!({ agent: { session: { id: SESSION } }, name: 'read' })).toBeUndefined();
  });
});
