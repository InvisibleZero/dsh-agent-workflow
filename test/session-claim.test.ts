import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureClaimedSessionNode, resolveSessionWorkingDirectory } from '../src/host/session-claim';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { recentEvents } from '../src/host/event-log';
import { apply } from '../src/host';

/**
 * 认领即建节点的契约：
 * - 宿主能解析出会话工作目录（服务优先、头部兜底），解析不出就降级不建；
 * - 建好后必须回填状态（门禁同步读它），失败只留痕不抛；
 * - 真正走 `apply()` 时，agent/created 一发生，节点就应当存在。
 */

/** 只提供本测试用到的两个服务；其余一律 undefined（插件其它分支会自动跳过）。 */
function makeCtx(input: {
  /** 传函数时每次读取都重新求值（可按会话给不同预设）：用来模拟「会话切回了标准模式」。 */
  preset: string | null | ((session?: any) => string | null);
  sessions?: Map<string, any>;
  /** 传了就接 webServer 注册：路由测试要拿到 makeHandler 产出的 handler。 */
  routes?: Map<string, (req: any, res: any) => any>;
}) {
  const handlers = new Map<string, Array<(...args: any[]) => any>>();
  const logs: Array<{ level: string; message: string }> = [];
  const presetNow = (session?: any) => (typeof input.preset === 'function' ? input.preset(session) : input.preset);
  const ctx = {
    logger: {
      info: () => {},
      warn: () => {},
    },
    get(name: string) {
      if (name === 'agentPresets') {
        return {
          composedPreset: () => presetNow(),
          presetForSession: (session: any) => presetNow(session),
        };
      }
      if (name === 'sessions') {
        return { get: (id: string) => input.sessions?.get(id) };
      }
      if (name === 'workingDirectory') {
        return { get: (session: any) => session?.header?.cwd };
      }
      return undefined;
    },
    on(event: string, handler: (...args: any[]) => any) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => {};
    },
    inject(names: string[], callback: (scoped: any) => any) {
      // 工具 / 系统提示那几条故意不回调；只有路由需要拿到 handler。
      if (input.routes === undefined || !names.includes('webServer')) return;
      callback({
        effect: (factory: () => any) => factory(),
        webServer: {
          register: (route: any) => {
            input.routes?.set(route.path, route.handler);
            return () => {};
          },
        },
      });
    },
    effect(factory: () => any) {
      return factory();
    },
    log: (level: 'info' | 'warn', message: string) => {
      logs.push({ level, message });
    },
  };
  return { ctx, handlers, logs };
}

describe('resolveSessionWorkingDirectory', () => {
  it('workingDirectory 服务的值优先于会话头部', () => {
    const session = { id: 'session-1', header: { cwd: 'C:/header' } };
    const ctx = {
      get(name: string) {
        if (name === 'sessions') return { get: () => session };
        if (name === 'workingDirectory') return { get: () => 'C:/live' };
        return undefined;
      },
    };
    expect(resolveSessionWorkingDirectory(ctx, 'session-1')).toBe('C:/live');
  });

  it('服务不可用时退回 session.header.cwd', () => {
    const session = { id: 'session-1', header: { cwd: 'C:/header' } };
    const ctx = {
      get(name: string) {
        if (name === 'sessions') return { get: () => session };
        if (name === 'workingDirectory') return { get: () => undefined };
        return undefined;
      },
    };
    expect(resolveSessionWorkingDirectory(ctx, 'session-1')).toBe('C:/header');
  });

  it('会话还没进 sessions 服务时返回空串（不抛）', () => {
    const { ctx } = makeCtx({ preset: 'workflow' });
    expect(resolveSessionWorkingDirectory(ctx, 'session-missing')).toBe('');
  });

  it('空 sessionId 直接返回空串', () => {
    const { ctx } = makeCtx({ preset: 'workflow' });
    expect(resolveSessionWorkingDirectory(ctx, '')).toBe('');
  });
});

describe('ensureClaimedSessionNode', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-claim-unit-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function makeDeps(input: {
    workingDirectory: string;
    repository: any;
    logs: Array<{ level: string; message: string }>;
    states: Map<string, string>;
  }) {
    return {
      repository: input.repository,
      resolveWorkingDirectory: () => input.workingDirectory,
      setState: (sessionId: string, state: string) => input.states.set(sessionId, state),
      log: (level: 'info' | 'warn', message: string) => input.logs.push({ level, message }),
    };
  }

  it('建好节点并把状态回填给门禁', async () => {
    const repository = new WorkflowRepository(dir);
    const logs: Array<{ level: string; message: string }> = [];
    const states = new Map<string, string>();

    const state = await ensureClaimedSessionNode(
      makeDeps({ workingDirectory: dir, repository, logs, states }),
      'session-unit-1',
      'test',
    );

    expect(state).toBe('discussing');
    expect(states.get('session-unit-1')).toBe('discussing');
    const found = await repository.findBySession('session-unit-1');
    expect(found?.nodeId).toBeTruthy();
    expect(logs.some((entry) => entry.message.includes('auto-claim ok') && entry.message.includes('trigger=test'))).toBe(true);
  });

  it('工作目录为空时不建节点，只留一条 warn', async () => {
    let called = 0;
    const repository = {
      ensureNode: async () => {
        called += 1;
        throw new Error('不该被调用');
      },
    };
    const logs: Array<{ level: string; message: string }> = [];
    const states = new Map<string, string>();

    const state = await ensureClaimedSessionNode(
      makeDeps({ workingDirectory: '', repository, logs, states }),
      'session-unit-2',
      'test',
    );

    expect(state).toBeNull();
    expect(called).toBe(0);
    expect(states.has('session-unit-2')).toBe(false);
    expect(logs.some((entry) => entry.level === 'warn' && entry.message.includes('reason=no-working-directory'))).toBe(true);
  });

  it('建节点抛错时吞掉异常、不回填状态，方便下一次重试', async () => {
    const repository = {
      ensureNode: async () => {
        throw new Error('磁盘写不进去');
      },
    };
    const logs: Array<{ level: string; message: string }> = [];
    const states = new Map<string, string>();

    await expect(ensureClaimedSessionNode(
      makeDeps({ workingDirectory: dir, repository, logs, states }),
      'session-unit-3',
      'test',
    )).resolves.toBeNull();

    expect(states.has('session-unit-3')).toBe(false);
    expect(logs.some((entry) => entry.level === 'warn' && entry.message.includes('auto-claim failed') && entry.message.includes('磁盘写不进去'))).toBe(true);
  });
});

describe('宿主：agent/created 之后节点必须已经存在', () => {
  let profileDir: string;
  let workDir: string;
  const previousProfileDir = process.env.DSH_PROFILE_DIR;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), 'wf-claim-host-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-claim-host-work-'));
    process.env.DSH_PROFILE_DIR = profileDir;
  });

  afterEach(async () => {
    if (previousProfileDir === undefined) delete process.env.DSH_PROFILE_DIR;
    else process.env.DSH_PROFILE_DIR = previousProfileDir;
    await rm(profileDir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('认领后按会话工作目录补出节点（不需要浏览器调 ensure-node）', async () => {
    const sessionId = 'session-host-claim';
    const sessions = new Map([[sessionId, { id: sessionId, header: { cwd: workDir } }]]);
    const { ctx, handlers } = makeCtx({ preset: 'workflow', sessions });

    apply(ctx);

    // 宿主把 Web 路由注册在 ctx.inject(['webServer']) 里，本测试故意不提供该服务；
    // 认领链路不依赖路由，agent/created 直接触发即可。
    const created = handlers.get('agent/created') ?? [];
    expect(created.length).toBeGreaterThan(0);
    for (const handler of created) handler({ agent: { session: { id: sessionId }, ctx: {} } });

    const repository = new WorkflowRepository(join(profileDir, 'dsh-agent-workflow'));
    let found = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      found = await repository.findBySession(sessionId);
      if (found !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(found).not.toBeNull();
    expect(found?.current_state).toBe('discussing');
  });

  it('非工作流预设的会话不建节点', async () => {
    const sessionId = 'session-default-preset';
    const sessions = new Map([[sessionId, { id: sessionId, header: { cwd: workDir } }]]);
    const { ctx, handlers } = makeCtx({ preset: 'default', sessions });

    apply(ctx);
    for (const handler of handlers.get('agent/created') ?? []) {
      handler({ agent: { session: { id: sessionId }, ctx: {} } });
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    const repository = new WorkflowRepository(join(profileDir, 'dsh-agent-workflow'));
    expect(await repository.findBySession(sessionId)).toBeNull();
  });

  it('/node-by-session：已认领但没节点时补建再回读（自愈），并留下 auto-claim 埋点', async () => {
    const sessionId = 'session-self-heal';
    const sessions = new Map([[sessionId, { id: sessionId, header: { cwd: workDir } }]]);
    const routes = new Map<string, (req: any, res: any) => any>();
    const { ctx } = makeCtx({ preset: 'workflow', sessions, routes });

    apply(ctx);
    const handler = routes.get('/dsh-agent-workflow/node-by-session');
    expect(handler).toBeDefined();

    const repository = new WorkflowRepository(join(profileDir, 'dsh-agent-workflow'));
    expect(await repository.findBySession(sessionId)).toBeNull();

    const res = makeResponse();
    await handler!({
      method: 'GET',
      url: `/dsh-agent-workflow/node-by-session?sessionId=${sessionId}`,
      headers: { host: '127.0.0.1:58765' },
    }, res);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.node?.current_state).toBe('discussing');

    const healed = await repository.findBySession(sessionId);
    expect(healed).not.toBeNull();
    expect(healed?.current_state).toBe('discussing');

    // 埋点要能回答「这条节点是谁补的」：重试排查时第一跳就靠它。
    const events = recentEvents(500).map((event) => event.message);
    expect(events.some((message) => message.includes('auto-claim ok')
      && message.includes(`session=${sessionId}`)
      && message.includes('trigger=node-by-session'))).toBe(true);
  });

  it('/node-by-session：把「有没有对话过」带给客户端（空会话要轮询）', async () => {
    const emptyId = 'session-empty';
    const talkedId = 'session-talked';
    const sessions = new Map([
      [emptyId, { id: emptyId, header: { cwd: workDir } }],
      [talkedId, {
        id: talkedId,
        header: { cwd: workDir },
        snapshotEvents: () => [{ type: 'user/message' }],
      }],
    ]);
    const routes = new Map<string, (req: any, res: any) => any>();
    const { ctx } = makeCtx({ preset: 'workflow', sessions, routes });
    apply(ctx);
    const handler = routes.get('/dsh-agent-workflow/node-by-session');

    const emptyRes = makeResponse();
    await handler!(makeRequest({ method: 'GET', url: `/dsh-agent-workflow/node-by-session?sessionId=${emptyId}` }), emptyRes);
    expect(JSON.parse(emptyRes.body).hasMessages).toBe(false);

    const talkedRes = makeResponse();
    await handler!(makeRequest({ method: 'GET', url: `/dsh-agent-workflow/node-by-session?sessionId=${talkedId}` }), talkedRes);
    expect(JSON.parse(talkedRes.body).hasMessages).toBe(true);
  });

  it('浏览器埋点：/client-log 把消息写进同一个事件环，超限时静默丢弃', async () => {
    const routes = new Map<string, (req: any, res: any) => any>();
    const { ctx } = makeCtx({ preset: 'workflow', sessions: new Map(), routes });
    apply(ctx);
    const handler = routes.get('/dsh-agent-workflow/client-log');
    expect(handler).toBeDefined();

    const res = makeResponse();
    await handler!(makeRequest({
      url: '/dsh-agent-workflow/client-log',
      body: { level: 'info', message: 'badge node (session=s-1, node=n-1, state=discussing)' },
    }), res);
    expect(JSON.parse(res.body).accepted).toBe(true);
    expect(recentEvents(500).some((event) => event.message.includes('client badge node')
      && event.message.includes('session=s-1'))).toBe(true);

    // 速率闸：60 秒 30 条，第 31 条只返回 accepted:false，不报错。
    for (let index = 0; index < 29; index += 1) {
      await handler!(makeRequest({
        url: '/dsh-agent-workflow/client-log',
        body: { message: `flood-${index}` },
      }), makeResponse());
    }
    const overflow = makeResponse();
    await handler!(makeRequest({
      url: '/dsh-agent-workflow/client-log',
      body: { message: 'flood-overflow' },
    }), overflow);
    expect(JSON.parse(overflow.body).accepted).toBe(false);
    expect(recentEvents(500).some((event) => event.message.includes('flood-overflow'))).toBe(false);
  });

  it('/ensure-node：客户端没传工作目录时由宿主按会话解析', async () => {
    const sessionId = 'session-host-resolve';
    const sessions = new Map([[sessionId, { id: sessionId, header: { cwd: workDir } }]]);
    const routes = new Map<string, (req: any, res: any) => any>();
    const { ctx } = makeCtx({ preset: 'workflow', sessions, routes });
    apply(ctx);
    const handler = routes.get('/dsh-agent-workflow/ensure-node');
    expect(handler).toBeDefined();

    const res = makeResponse();
    await handler!(makeRequest({ url: '/dsh-agent-workflow/ensure-node', body: { sessionId } }), res);

    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.node?.current_state).toBe('discussing');
    const repository = new WorkflowRepository(join(profileDir, 'dsh-agent-workflow'));
    expect(await repository.findBySession(sessionId)).not.toBeNull();
  });

  it('/ensure-node：陌生会话没带 test 标记时拒绝建节点（不被默认预设的新会话钻空子）', async () => {
    const routes = new Map<string, (req: any, res: any) => any>();
    const { ctx } = makeCtx({ preset: 'workflow', sessions: new Map(), routes });
    apply(ctx);
    const handler = routes.get('/dsh-agent-workflow/ensure-node');
    expect(handler).toBeDefined();

    const res = makeResponse();
    await handler!(makeRequest({
      url: '/dsh-agent-workflow/ensure-node',
      body: { sessionId: 'session-unknown', workingDirectory: workDir },
    }), res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).node).toBeNull();
    const repository = new WorkflowRepository(join(profileDir, 'dsh-agent-workflow'));
    expect(await repository.findBySession('session-unknown')).toBeNull();
    expect(recentEvents(500).some((event) => event.message.includes('ensure-node refused')
      && event.message.includes('reason=unknown-session-without-test-flag'))).toBe(true);
  });

  it('/ensure-node：显式 test:true 的合成会话仍然能建节点（回归脚本的通道）', async () => {
    const routes = new Map<string, (req: any, res: any) => any>();
    const { ctx } = makeCtx({ preset: 'workflow', sessions: new Map(), routes });
    apply(ctx);
    const handler = routes.get('/dsh-agent-workflow/ensure-node');

    const res = makeResponse();
    await handler!(makeRequest({
      url: '/dsh-agent-workflow/ensure-node',
      body: { sessionId: 'session-regression', workingDirectory: workDir, test: true },
    }), res);

    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.node?.current_state).toBe('discussing');
    const repository = new WorkflowRepository(join(profileDir, 'dsh-agent-workflow'));
    expect(await repository.findBySession('session-regression')).not.toBeNull();
  });

  it('/ensure-node：已知的默认预设会话不建节点', async () => {
    const sessionId = 'session-known-default';
    const sessions = new Map([[sessionId, { id: sessionId, header: { cwd: workDir } }]]);
    const routes = new Map<string, (req: any, res: any) => any>();
    const { ctx } = makeCtx({ preset: 'default', sessions, routes });
    apply(ctx);
    const handler = routes.get('/dsh-agent-workflow/ensure-node');

    const res = makeResponse();
    await handler!(makeRequest({
      url: '/dsh-agent-workflow/ensure-node',
      body: { sessionId, workingDirectory: workDir },
    }), res);

    expect(JSON.parse(res.body).node).toBeNull();
    const repository = new WorkflowRepository(join(profileDir, 'dsh-agent-workflow'));
    expect(await repository.findBySession(sessionId)).toBeNull();
  });

  it('切换预设：工作流 → 标准模式后 /node-by-session 立刻松手，切回来沿用同一个节点', async () => {
    let preset: string | null = 'workflow';
    const sessionId = 'session-preset-switch';
    const sessions = new Map([[sessionId, { id: sessionId, header: { cwd: workDir } }]]);
    const routes = new Map<string, (req: any, res: any) => any>();
    const { ctx } = makeCtx({ preset: () => preset, sessions, routes });

    apply(ctx);
    const handler = routes.get('/dsh-agent-workflow/node-by-session');
    expect(handler).toBeDefined();
    const url = `/dsh-agent-workflow/node-by-session?sessionId=${sessionId}`;

    const first = makeResponse();
    await handler!(makeRequest({ method: 'GET', url }), first);
    const firstBody = JSON.parse(first.body);
    expect(firstBody.node?.current_state).toBe('discussing');
    const nodeId = firstBody.node?.nodeId;

    // 切回标准模式：必须立刻松手，否则徽标会留在标准模式的会话上。
    preset = 'default';
    const second = makeResponse();
    await handler!(makeRequest({ method: 'GET', url }), second);
    const secondBody = JSON.parse(second.body);
    expect(secondBody.node).toBeNull();
    expect(secondBody.enabled).toBe(false);
    expect(recentEvents(500).some((event) => event.message.includes('released')
      && event.message.includes(`session=${sessionId}`)
      && event.message.includes('preset=default'))).toBe(true);

    // 再切回工作流：沿用同一个节点（不新建、不丢历史）。
    preset = 'workflow';
    const third = makeResponse();
    await handler!(makeRequest({ method: 'GET', url }), third);
    const thirdBody = JSON.parse(third.body);
    expect(thirdBody.node?.current_state).toBe('discussing');
    expect(thirdBody.node?.nodeId).toBe(nodeId);
  });

  it('侧栏状态点：会话切回标准模式后不再返回（预设读不到的会话保留）', async () => {
    const repository = new WorkflowRepository(join(profileDir, 'dsh-agent-workflow'));
    await repository.ensureNode({ sessionId: 'session-dot-workflow', workingDirectory: workDir });
    await repository.ensureNode({ sessionId: 'session-dot-default', workingDirectory: workDir });
    await repository.ensureNode({ sessionId: 'session-dot-unknown', workingDirectory: workDir });

    const sessions = new Map([
      ['session-dot-workflow', { id: 'session-dot-workflow', header: { cwd: workDir } }],
      ['session-dot-default', { id: 'session-dot-default', header: { cwd: workDir } }],
    ]);
    const routes = new Map<string, (req: any, res: any) => any>();
    const { ctx } = makeCtx({
      preset: (session: any) => {
        if (session?.id === 'session-dot-workflow') return 'workflow';
        if (session?.id === 'session-dot-default') return 'default';
        return null;
      },
      sessions,
      routes,
    });
    apply(ctx);

    const handler = routes.get('/dsh-agent-workflow/sidebar-nodes');
    expect(handler).toBeDefined();
    const res = makeResponse();
    await handler!(makeRequest({ method: 'GET', url: '/dsh-agent-workflow/sidebar-nodes' }), res);

    const nodes = JSON.parse(res.body).nodes;
    expect(nodes['session-dot-workflow']).toBe('discussing');
    expect(nodes['session-dot-default']).toBeUndefined();
    expect(nodes['session-dot-unknown']).toBe('discussing');
  });

  it('推送通道：切换预设释放时把 released 帧推给已连接的页面', async () => {
    let preset: string | null = 'workflow';
    const sessionId = 'session-stream';
    const sessions = new Map([[sessionId, { id: sessionId, header: { cwd: workDir } }]]);
    const routes = new Map<string, (req: any, res: any) => any>();
    const { ctx } = makeCtx({ preset: () => preset, sessions, routes });

    apply(ctx);
    const streamHandler = routes.get('/dsh-agent-workflow/stream');
    const nodeHandler = routes.get('/dsh-agent-workflow/node-by-session');
    expect(streamHandler).toBeDefined();
    expect(nodeHandler).toBeDefined();

    const stream = makeStreamResponse();
    await streamHandler!(makeRequest({ method: 'GET', url: '/dsh-agent-workflow/stream' }), stream);
    expect(stream.statusCode).toBe(200);
    expect(String(stream.headers['content-type'])).toContain('text/event-stream');

    const url = `/dsh-agent-workflow/node-by-session?sessionId=${sessionId}`;
    const first = makeResponse();
    await nodeHandler!(makeRequest({ method: 'GET', url }), first);
    expect(JSON.parse(first.body).node?.current_state).toBe('discussing');

    preset = 'default';
    const second = makeResponse();
    await nodeHandler!(makeRequest({ method: 'GET', url }), second);

    expect(stream.frames.some((frame) => frame.includes('"reason":"released"') && frame.includes(sessionId))).toBe(true);
    stream.close();
  });
});

/** 够用的假响应：只收 writeHead / end，sendJson 只用这两个。 */
function makeResponse() {
  return {
    statusCode: 0,
    body: '',
    writeHead(status: number) {
      this.statusCode = status;
    },
    end(chunk: string) {
      this.body = chunk;
    },
  };
}

/** 假 SSE 响应：记下写出的帧，能把「连接断开」触发给路由的 cleanup。 */
function makeStreamResponse() {
  const listeners = new Map<string, Array<() => void>>();
  const frames: string[] = [];
  const res: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    frames,
    writeHead(status: number, headers: Record<string, string>) {
      res.statusCode = status;
      Object.assign(res.headers, headers ?? {});
    },
    write(chunk: string) {
      frames.push(String(chunk));
      return true;
    },
    end() {},
    on(event: string, callback: () => void) {
      const list = listeners.get(event) ?? [];
      list.push(callback);
      listeners.set(event, list);
      return res;
    },
    close() {
      for (const callback of listeners.get('close') ?? []) callback();
    },
  };
  return res;
}

/** 够用的假请求：POST 的 body 从 data/end 事件里给，makeHandler 的 readJsonBody 只认这两个。 */
function makeRequest(input: { url: string; body?: unknown; method?: string }) {
  const listeners = new Map<string, Array<(chunk?: any) => void>>();
  const req: any = {
    method: input.method ?? 'POST',
    url: input.url,
    headers: { host: '127.0.0.1:58765' },
    on(event: string, callback: (chunk?: any) => void) {
      const list = listeners.get(event) ?? [];
      list.push(callback);
      listeners.set(event, list);
      return req;
    },
    destroy() {},
  };
  queueMicrotask(() => {
    if (input.body !== undefined) {
      const chunk = Buffer.from(JSON.stringify(input.body), 'utf8');
      for (const callback of listeners.get('data') ?? []) callback(chunk);
    }
    for (const callback of listeners.get('end') ?? []) callback();
  });
  return req;
}
