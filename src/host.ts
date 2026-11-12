// @ts-nocheck
/**
 * dsh-agent-workflow 宿主半（cordis 插件）。
 *
 * 职责：给浏览器半暴露 3 个本机 HTTP 路由（list / create / get），
 * 背后读写我们自己的 WorkflowRepository。客户端用 `fetch('/dsh-agent-workflow/*')` 调用，
 * 与 model-router 的路由写法一致（webServer.register + kind: 'exact'）。
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { WorkflowRepository } from './host/workflow-repository';
import { readSidebarNodes } from './host/sidebar-nodes';
import { effectiveDetail } from './engine/state-machine';
import { registerWorkflowStateContext } from './host/workflow-state-context';
import { assertAdvanceAllowed, registerWorkflowGuard, registerWorkflowTools } from './host/workflow-tools';
import { ensureClaimedSessionNode, resolveSessionWorkingDirectory } from './host/session-claim';
import { logEvent, newTraceId, recentEvents } from './host/event-log';
import { DEFAULT_GLOBAL_OPERATION_DETAIL } from './schema/workflow';
import { VERIFY_CHECKS } from './schema/verify-checks';

export const inject = [];

function resolveDataDir(): string {
  const profileDir = process.env.DSH_PROFILE_DIR;
  const base = profileDir && profileDir.trim() !== '' ? profileDir : join(homedir(), '.dsh');
  return join(base, 'dsh-agent-workflow');
}

/** 只允许本机页面读写，避免把 workflow 数据接口暴露到局域网。 */
function isLoopbackRequest(req: any): boolean {
  try {
    const host = String(req?.headers?.host ?? '');
    return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host);
  } catch {
    return false;
  }
}

function denyRequest(res: any): void {
  try {
    res.statusCode = 403;
    res.end('forbidden');
  } catch {
    // 连接已断开时忽略。
  }
}

function sendJson(res: any, status: number, value: unknown): void {
  try {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(value));
  } catch {
    // 连接已断开时忽略。
  }
}

function readJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy?.();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('JSON 解析失败'));
      }
    });
    req.on('error', reject);
  });
}

/** 从请求路径里取路由名（`/dsh-agent-workflow/ensure-node?x=1` → `ensure-node`），只用于埋点。 */
function routeNameOf(req: any): string {
  const routePath = String(req?.url ?? '').split('?')[0];
  return routePath.replace(/^\/dsh-agent-workflow\//, '') || '(root)';
}

function makeHandler(
  ctx: any,
  repository: WorkflowRepository,
  method: string,
  run: (body: any, query: URLSearchParams, traceId: string) => Promise<unknown>,
) {
  return async (req: any, res: any) => {
    if (!isLoopbackRequest(req)) return denyRequest(res);
    if (req.method !== method) return sendJson(res, 405, { ok: false, error: `只接受 ${method}` });
    const traceId = newTraceId();
    const routeName = routeNameOf(req);
    const startedAt = Date.now();
    let body: any = {};
    let query = new URLSearchParams();
    try {
      if (req.method === 'POST') body = await readJsonBody(req);
      const rawQuery = String((req.url ?? '').split('?')[1] ?? '');
      query = new URLSearchParams(rawQuery);
    } catch (error) {
      const message = String((error as Error).message ?? error);
      logEvent(ctx.logger, 'warn', `[workflow] route rejected (route=${routeName}, trace=${traceId}, ${Date.now() - startedAt}ms): ${message}`, traceId);
      return sendJson(res, 400, { ok: false, error: message, traceId });
    }
    try {
      const value = await run(body, query, traceId);
      sendJson(res, 200, { ok: true, traceId, ...(value as Record<string, unknown>) });
    } catch (error) {
      // 每条路由的失败都留一条：排查时先看「这一跳到没到」，再看它为什么没往下走。
      const message = String((error as Error)?.message ?? error);
      logEvent(ctx.logger, 'warn', `[workflow] route failed (route=${routeName}, trace=${traceId}, ${Date.now() - startedAt}ms): ${message}`, traceId);
      sendJson(res, 500, { ok: false, error: message, traceId });
    }
  };
}

export function apply(ctx: any) {
  const repository = new WorkflowRepository(resolveDataDir());

  /**
   * 推送通道：把「这个会话变了」主动告诉浏览器半，代替每 3 秒轮询。
   *
   * 协议只有一条事件：`{ sessionId, reason, state? }`。客户端收到就重取一次
   * `/node-by-session`，所以以后新增状态来源不用改协议。
   * 只往本机回环连接推（路由层已限 loopback），写失败就把该连接摘掉。
   */
  const streamClients = new Set<any>();

  /**
   * 浏览器埋点的速率闸：60 秒最多 30 条。
   *
   * 浏览器侧只在状态变化时上报，正常远低于这个数；上限只为防止某处循环调用
   * 把 500 条的事件环冲掉（环被冲掉时，几秒前的关键跳就查不到了）。
   */
  const CLIENT_LOG_LIMIT = 30;
  const CLIENT_LOG_WINDOW_MS = 60_000;
  const clientLogWindow = { startedAt: 0, count: 0 };
  const clientLogAccepted = (now: number): boolean => {
    if (now - clientLogWindow.startedAt >= CLIENT_LOG_WINDOW_MS) {
      clientLogWindow.startedAt = now;
      clientLogWindow.count = 0;
    }
    if (clientLogWindow.count >= CLIENT_LOG_LIMIT) return false;
    clientLogWindow.count += 1;
    return true;
  };

  const broadcast = (sessionId: string, reason: string, state?: string): void => {
    if (typeof sessionId !== 'string' || sessionId === '') return;
    if (streamClients.size === 0) return;
    const payload: Record<string, string> = { sessionId, reason };
    if (typeof state === 'string' && state !== '') payload.state = state;
    const frame = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of streamClients) {
      try {
        client.write(frame);
      } catch {
        streamClients.delete(client);
      }
    }
  };

  /**
   * 本插件接管的会话集合 = 选了「工作流模式」预设的会话。
   *
   * 插件作为全局 bundle 挂载（这样客户端半才加载），但只对预设 id 为 workflow 的 Agent 生效：
   * 预设 id 从 agent-preset-registry 读（composedPreset），读不到就当作不接管。
   */
  const WORKFLOW_PRESET_ID = 'workflow';
  const presetSessions = new Set<string>();
  const presetIdOf = (agentCtx: any): string | null => {
    try {
      const registry = ctx.get('agentPresets');
      if (registry === undefined || agentCtx === undefined) return null;
      return registry.composedPreset(agentCtx) ?? null;
    } catch {
      return null;
    }
  };
  const isPresetSession = (sessionId: unknown): boolean =>
    typeof sessionId === 'string' && presetSessions.has(sessionId);

  /** 认领一次：预设 id 匹配就记下来。agent/created 与 agent/pre-step 各调一次，幂等。 */
  const claim = (agent: any): void => {
    const sessionId = agent?.session?.id;
    if (typeof sessionId !== 'string' || sessionId === '') return;
    const preset = presetIdOf(agent?.ctx);
    if (preset !== WORKFLOW_PRESET_ID) {
      // 预设明确是别的（用户把会话切回了标准模式）：立刻松手。
      // 不能只是 return——之前认领过的会话会一直留在集合里，徽标和门禁就会跟着它走。
      if (typeof preset === 'string') releaseClaim(sessionId, `preset=${preset}`);
      return;
    }
    if (presetSessions.has(sessionId)) return;
    presetSessions.add(sessionId);
    void refreshSessionState(sessionId);
    // 认领了就一定有节点：不等浏览器补建。浏览器那一跳在新会话创建时会被拒（预设还没投影出来），
    // 而它只试一次；缺了节点，首条消息的工具调用就会被门禁当成「状态未知」拦掉。
    void ensureNodeAndPublish(sessionId, 'claim');
  };
  ctx.on('agent/created', (payload: any) => claim(payload?.agent));
  // 创建事件里预设可能还没绑好，第一步再认领一次兜底（瀑布事件，必须把 next 传下去）。
  ctx.on('agent/pre-step', (payload: any, next: any) => {
    claim(payload?.agent);
    return next();
  });

  /**
   * 会话当前状态的内存副本。
   *
   * 门禁（tools.guard）是同步的，不能读盘；所以每次状态变化（认领 / 推进 / 返工 / 自动推进）
   * 都同步更新这张表。所有状态变化的入口都经过本插件，因此不会长期失真。
   */
  const sessionState = new Map<string, string>();
  async function refreshSessionState(sessionId: string): Promise<void> {
    try {
      const found = await repository.findBySession(sessionId);
      if (found !== null) sessionState.set(sessionId, String(found.current_state));
    } catch {
      // 读失败保持旧值，下一次状态变化会再刷新。
    }
  }

  /**
   * 退出接管：会话从工作流预设切回标准模式后，插件必须立刻松手。
   *
   * 只改内存不够——`/node-by-session` 只要看到集合里还有它就会继续返回节点，
   * 徽标、门禁、注入就都会留在标准模式的会话上（实测：切回标准模式后胶囊还在）。
   * 节点本身不删：切回工作流预设时沿用同一个，历史与手册都还在。
   */
  const releaseClaim = (sessionId: string, reason: string): void => {
    if (!presetSessions.delete(sessionId)) return;
    sessionState.delete(sessionId);
    logEvent(ctx.logger, 'info', `[workflow] released (session=${sessionId}, reason=${reason})`);
    // 页面要立刻把徽标收掉：只靠轮询的话，切回标准模式的会话最多还会挂几秒。
    broadcast(sessionId, 'released');
  };

  /**
   * 认领即补建节点（宿主侧兜底，不依赖浏览器）。
   *
   * 只在内存里记一笔状态不够：节点不存在时 `findBySession` 永远返回 null，
   * 门禁也就永远是「状态未知」。这里按会话自己的工作目录把节点建出来，并把
   * 建出来的状态回填给门禁（门禁是同步执行的，等不了下一次读盘）。
   *
   * 返回 Promise 是为了让 `/node-by-session` 能「补建完再回读」；事件回调里不关心结果，用 void 调。
   */
  const claimNodeDeps = {
    repository,
    resolveWorkingDirectory: (id: string) => resolveSessionWorkingDirectory(ctx, id),
    setState: (id: string, state: string) => sessionState.set(id, state),
    log: (level: 'info' | 'warn', message: string) => logEvent(ctx.logger, level, message),
  };
  const ensureNodeAndPublish = async (sessionId: string, trigger: string): Promise<string | null> => {
    const state = await ensureClaimedSessionNode(claimNodeDeps, sessionId, trigger);
    // 节点是宿主补出来的：推一帧，页面上的徽标/侧栏点立刻出现，不必等轮询。
    if (state !== null) broadcast(sessionId, 'created', state);
    return state;
  };

  /** 自愈冷却：同一会话 30 秒内只补建一次，避免「建不出来」的会话把事件环刷满。 */
  const SELF_HEAL_COOLDOWN_MS = 30 * 1000;
  const selfHealAttemptAt = new Map<string, number>();

  /**
   * 按会话 id 补认领。
   *
   * 之前只靠 agent 判预设，存在竞态：会话刚打开、agent 还没建好时判不出来，
   * 徽标就会消失一段时间（实测有一分半）。这里优先用 sessions 服务 + 预设投影
   * （`presetForSession`）直接读会话的预设，不依赖 agent 是否已就绪。
   */
  const claimBySession = (sessionId: string): boolean => {
    // 每次问答都读当前预设，不用「认领过就一直算」：用户可能在会话里换预设，
    // 缓存一份就会漏掉「切回标准模式」这种撤销。
    let currentPreset: string | null = null;
    try {
      const registry = ctx.get('agentPresets');
      const session = ctx.get('sessions')?.get?.(sessionId);
      if (registry !== undefined && session !== undefined) {
        currentPreset = registry.presetForSession(session) ?? null;
      }
    } catch {
      // 投影读不到：按未知处理，后面退回缓存与 agent 判定（别因为一次读失败就把会话踢掉）。
    }
    if (typeof currentPreset === 'string' && currentPreset !== WORKFLOW_PRESET_ID) {
      releaseClaim(sessionId, `preset=${currentPreset}`);
      return false;
    }
    if (presetSessions.has(sessionId)) {
      // 认领过但状态表可能仍是空的（认领发生在节点绑定之前）：这里补一次，
      // 否则门禁拿到空状态、"写实施顺序"也会被误判成非讨论中。
      if (!sessionState.has(sessionId)) void refreshSessionState(sessionId);
      return true;
    }
    if (currentPreset === WORKFLOW_PRESET_ID) {
      presetSessions.add(sessionId);
      void refreshSessionState(sessionId);
      void ensureNodeAndPublish(sessionId, 'preset-projection');
      return true;
    }
    try {
      const agent = ctx.get('agents')?.get?.(sessionId);
      if (agent !== undefined) claim(agent);
    } catch {
      // 拿不到 agent 就按未接管处理。
    }
    return presetSessions.has(sessionId);
  };

  // 按状态注入操作细节（系统提示里的动态上下文，不写会话记录）；只对本预设接管的会话生效。
  const stateContext = registerWorkflowStateContext(ctx, repository, isPresetSession);

  /** 读会话「此刻」的预设：true=工作流，false=明确是别的预设，null=读不到（别据此隐藏 UI）。 */
  const workflowPresetNow = (sessionId: string): boolean | null => {
    try {
      const registry = ctx.get('agentPresets');
      const session = ctx.get('sessions')?.get?.(sessionId);
      if (registry === undefined || session === undefined) return null;
      const preset = registry.presetForSession(session);
      if (typeof preset !== 'string' || preset === '') return null;
      return preset === WORKFLOW_PRESET_ID;
    } catch {
      return null;
    }
  };

  /**
   * 这个会话有没有产生过对话消息。
   *
   * 客户端拿它决定要不要轮询：空会话（新建、还没发过消息）一直轮询——预设可以在任何时候
   * 被切过来，而那一刻宿主不会发任何事件；聊过的会话不需要轮询，推送就够了。
   * 会话对象拿不到时按「空会话」处理：宁可多问几次，也别让新会话显示不出 UI。
   */
  const sessionHasMessages = (sessionId: string): boolean => {
    try {
      const session = ctx.get('sessions')?.get?.(sessionId);
      const events = session?.snapshotEvents?.();
      if (!Array.isArray(events)) return false;
      return events.some((event: any) => event?.type === 'user/message' || event?.type === 'assistant/message');
    } catch {
      return false;
    }
  };

  /**
   * 诊断用：把预设投影的原始值读出来。
   *
   * 「刚切到工作流，宿主还认成旧预设」这类问题，只能靠日志里这个值判断是投影滞后
   * 还是根本没更新；不参与任何判定。
   */
  const rawPresetOf = (sessionId: string): string => {
    try {
      const registry = ctx.get('agentPresets');
      const session = ctx.get('sessions')?.get?.(sessionId);
      if (registry === undefined) return '(no-registry)';
      if (session === undefined) return '(no-session)';
      const preset = registry.presetForSession(session);
      return typeof preset === 'string' && preset !== '' ? preset : '(empty)';
    } catch {
      return '(error)';
    }
  };

  /**
   * 待确认的推进请求：模型只能"请求"，真正切换必须由用户在界面上点同意。
   * 五分钟没人处理就作废，避免回来看到一堆僵尸按钮。
   */
  const PENDING_ADVANCE_TTL_MS = 5 * 60 * 1000;
  const pendingAdvances = new Map<string, { to: string; reason?: string; at: number }>();
  const readPendingAdvance = (sessionId: string): { to: string; reason?: string } | null => {
    const pending = pendingAdvances.get(sessionId);
    if (pending === undefined) return null;
    if (Date.now() - pending.at > PENDING_ADVANCE_TTL_MS) {
      pendingAdvances.delete(sessionId);
      return null;
    }
    return { to: pending.to, ...(pending.reason === undefined ? {} : { reason: pending.reason }) };
  };

  const toolsDeps = {
    repository,
    stateContext,
    isPresetSession,
    getState: (sessionId: string) => sessionState.get(sessionId),
    /** 状态表里没有这条时由工具调用方补一次（异步，能读盘）：修「认领早于绑节点 → 永久缺条」。 */
    refreshState: (sessionId: string) => refreshSessionState(sessionId),
    setState: (sessionId: string, state: string) => sessionState.set(sessionId, state),
    logger: ctx.logger,
    requestAdvance: (input: { sessionId: string; to: string; reason?: string }) => {
      pendingAdvances.set(input.sessionId, {
        to: input.to,
        ...(typeof input.reason === 'string' && input.reason !== '' ? { reason: input.reason } : {}),
        at: Date.now(),
      });
      // 模型发了推进请求：让开着的那一页立刻显示「同意 / 拒绝」，不用等下一次轮询。
      broadcast(input.sessionId, 'pending');
    },
    pendingAdvanceOf: (sessionId: string) => readPendingAdvance(sessionId),
    clearPendingAdvance: (sessionId: string) => {
      pendingAdvances.delete(sessionId);
      broadcast(sessionId, 'pending-cleared');
    },
  };
  // 硬机制：写操作门禁 + 模型专用工具（请求推进 / 写手册 / 勾选清单）。
  registerWorkflowGuard(ctx, toolsDeps);
  registerWorkflowTools(ctx, toolsDeps);

  /**
   * 状态变化时同步刷新门禁用的内存副本。
   *
   * 门禁是同步执行的，不能读盘，所以所有状态入口（认领 / 推进 / 返工 / 工具推进）都要维护这张表。
   */
  const markState = (sessionId: string, state: string): void => {
    sessionState.set(sessionId, state);
  };


  ctx.inject(['webServer'], (webCtx: any) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/stream',
      handler: (req: any, res: any) => {
        if (!isLoopbackRequest(req)) return denyRequest(res);
        try {
          res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-store',
            connection: 'keep-alive',
            // 有些反代会攒包，显式关掉缓冲；本机访问通常用不到，但写了不亏。
            'x-accel-buffering': 'no',
          });
          res.write(': connected\n\n');
        } catch {
          return;
        }
        streamClients.add(res);
        logEvent(ctx.logger, 'info', `[workflow] stream connected (clients=${streamClients.size})`);
        // 心跳：防止长连接被当成空闲掐断；写失败说明连接已经没了，顺手摘掉。
        const heartbeat = setInterval(() => {
          try {
            res.write(': ping\n\n');
          } catch {
            // 下面 cleanup 会处理。
          }
        }, 20_000);
        const cleanup = () => {
          clearInterval(heartbeat);
          streamClients.delete(res);
        };
        req.on?.('close', cleanup);
        res.on?.('close', cleanup);
        res.on?.('error', cleanup);
      },
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/list',
      handler: makeHandler(ctx, repository, 'GET', async () => ({ items: await repository.list() })),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/create',
      handler: makeHandler(ctx, repository, 'POST', async (body) => {
        if (typeof body?.path !== 'string' || body.path.trim() === '') {
          throw new Error('缺少工作目录 path');
        }
        const workspace = await repository.create({
          title: body.title,
          path: body.path.trim(),
          hostWorkspaceId: typeof body.hostWorkspaceId === 'string' ? body.hostWorkspaceId : undefined,
        });
        return { workspace };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/get',
      handler: makeHandler(ctx, repository, 'GET', async (_body, query) => {
        const id = query.get('id');
        if (typeof id !== 'string' || id === '') throw new Error('缺少 id');
        const snapshot = await repository.get(id);
        if (snapshot === null) throw new Error('找不到该 workflow');
        return { snapshot };
      }),
    }));
    // 应用级全局操作细节（A + B/C/D）：所有 workflow 共用一份。
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/state-context',
      handler: makeHandler(ctx, repository, 'GET', async (_body, query) => {
        const sessionId = query.get('sessionId');
        if (typeof sessionId !== 'string' || sessionId === '') throw new Error('缺少 sessionId');
        return { text: await stateContext.peek(sessionId) };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/app-settings',
      handler: makeHandler(ctx, repository, 'GET', async () => {
        const settings = await repository.getAppSettings();
        return { autoSendEnterTrigger: settings.autoSendEnterTrigger, manualLimits: settings.manualLimits };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/app-settings-save',
      handler: makeHandler(ctx, repository, 'POST', async (body) => {
        const saved = await repository.updateAppSettings({
          autoSendEnterTrigger: body?.autoSendEnterTrigger === undefined ? undefined : body.autoSendEnterTrigger === true,
          manualLimits: body?.manualLimits,
        });
        logEvent(ctx.logger, 'info', `[workflow] app-settings saved (autoSend=${saved.autoSendEnterTrigger}, 约束=${saved.manualLimits.constraints_chars}字, 方案=${saved.manualLimits.plan_chars}字, 整本=${saved.manualLimits.session_total_chars}字)`);
        return { autoSendEnterTrigger: saved.autoSendEnterTrigger, manualLimits: saved.manualLimits };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/global-settings',
      handler: makeHandler(ctx, repository, 'GET', async (_body, _query, traceId) => {
        const startedAt = Date.now();
        const globalOperationDetail = await repository.getAppGlobalOperationDetail();
        const profiles = await repository.listProfiles();
        logEvent(ctx.logger, 'info', `[workflow] global-settings ok (active=${profiles.active}, ${Date.now() - startedAt}ms)`, traceId);
        return { globalOperationDetail, defaults: DEFAULT_GLOBAL_OPERATION_DETAIL, profiles: profiles.names, activeProfile: profiles.active };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/global-settings-save',
      handler: makeHandler(ctx, repository, 'POST', async (body, _query, traceId) => {
        if (body?.globalOperationDetail === undefined || body.globalOperationDetail === null) {
          throw new Error('缺少 globalOperationDetail');
        }
        const startedAt = Date.now();
        const globalOperationDetail = await repository.updateAppGlobalOperationDetail(body.globalOperationDetail);
        logEvent(ctx.logger, 'info', `[workflow] global-settings-save ok (shared=${Buffer.byteLength(String(globalOperationDetail.shared_detail ?? ''), 'utf8')}B, ${Date.now() - startedAt}ms)`, traceId);
        return { globalOperationDetail };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/profiles-save',
      handler: makeHandler(ctx, repository, 'POST', async (body, _query, traceId) => {
        if (typeof body?.name !== 'string' || body.name.trim() === '') throw new Error('缺少 name');
        const profiles = await repository.saveProfile(body.name, body.globalOperationDetail);
        const globalOperationDetail = await repository.getAppGlobalOperationDetail();
        logEvent(ctx.logger, 'info', `[workflow] profiles-save ok (name=${profiles.active}, total=${profiles.names.length})`, traceId);
        return { active: profiles.active, profiles: profiles.names, globalOperationDetail };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/profiles-activate',
      handler: makeHandler(ctx, repository, 'POST', async (body, _query, traceId) => {
        if (typeof body?.name !== 'string' || body.name === '') throw new Error('缺少 name');
        const profiles = await repository.activateProfile(body.name);
        const globalOperationDetail = await repository.getAppGlobalOperationDetail();
        logEvent(ctx.logger, 'info', `[workflow] profiles-activate ok (active=${profiles.active})`, traceId);
        return { active: profiles.active, profiles: profiles.names, globalOperationDetail };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/profiles-delete',
      handler: makeHandler(ctx, repository, 'POST', async (body, _query, traceId) => {
        if (typeof body?.name !== 'string' || body.name === '') throw new Error('缺少 name');
        const profiles = await repository.deleteProfile(body.name);
        const globalOperationDetail = await repository.getAppGlobalOperationDetail();
        logEvent(ctx.logger, 'info', `[workflow] profiles-delete ok (deleted=${body.name}, active=${profiles.active})`, traceId);
        return { active: profiles.active, profiles: profiles.names, globalOperationDetail };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/profiles-export',
      handler: makeHandler(ctx, repository, 'POST', async (_body, _query, traceId) => {
        const exported = await repository.exportActiveProfile();
        spawn('explorer.exe', [join(exported.path, '..')], { stdio: 'ignore', detached: true }).unref();
        logEvent(ctx.logger, 'info', `[workflow] profiles-export ok (name=${exported.name})`, traceId);
        return exported;
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/profiles-import',
      handler: makeHandler(ctx, repository, 'POST', async (body, _query, traceId) => {
        if (typeof body?.json !== 'string' || body.json.trim() === '') throw new Error('缺少 json：请粘贴导出的文件内容');
        const result = await repository.importProfile(typeof body.name === 'string' ? body.name : '', body.json);
        logEvent(ctx.logger, 'info', `[workflow] profiles-import ok (name=${result.imported})`, traceId);
        return { imported: result.imported, profiles: result.names };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/node-detail',
      handler: makeHandler(ctx, repository, 'GET', async (_body, query) => {
        const id = query.get('id');
        const nodeId = query.get('nodeId');
        if (typeof id !== 'string' || id === '') throw new Error('缺少 id');
        if (typeof nodeId !== 'string' || nodeId === '') throw new Error('缺少 nodeId');
        const snapshot = await repository.get(id);
        if (snapshot === null) throw new Error('找不到该 workflow');
        const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
        if (node === undefined) throw new Error('找不到节点');
        const global = await repository.getAppGlobalOperationDetail();
        return {
          node: { node_id: node.node_id, title: node.title ?? '', current_state: node.current_state, history: node.history ?? [] },
          global,
          effective: effectiveDetail(node.current_state, node, global),
          overrides: node.state_detail_overrides ?? null,
          additional: node.additional_detail ?? null,
        };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/node-note',
      handler: makeHandler(ctx, repository, 'POST', async (body) => {
        if (typeof body?.id !== 'string' || body.id === '') throw new Error('缺少 id');
        if (typeof body?.nodeId !== 'string' || body.nodeId === '') throw new Error('缺少 nodeId');
        if (typeof body?.state !== 'string' || body.state === '') throw new Error('缺少 state');
        if (typeof body?.text !== 'string') throw new Error('缺少 text');
        const startedAt = Date.now();
        try {
          const snapshot = await repository.setNodeNote({ id: body.id, nodeId: body.nodeId, state: body.state, text: body.text });
          logEvent(ctx.logger, 'info', `[workflow] node-note ok (node=${body.nodeId}, state=${body.state}, ${Date.now() - startedAt}ms)`);
          return { snapshot };
        } catch (error) {
          logEvent(ctx.logger, 'warn', `[workflow] node-note failed (node=${body.nodeId}, state=${body.state}, ${Date.now() - startedAt}ms): ${String((error as Error)?.message ?? error)}`);
          throw error;
        }
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/node-by-session',
      handler: makeHandler(ctx, repository, 'GET', async (_body, query, traceId) => {
        const sessionId = query.get('sessionId');
        if (typeof sessionId !== 'string' || sessionId === '') throw new Error('缺少 sessionId');
        // 客户端靠这个决定要不要轮询：空会话（还没对话过）才轮询，聊过的靠推送。
        const hasMessages = sessionHasMessages(sessionId);
        if (!claimBySession(sessionId)) return { node: null, enabled: false, hasMessages };
        const startedAt = Date.now();
        let node = await repository.findBySession(sessionId);
        if (node === null && Date.now() - (selfHealAttemptAt.get(sessionId) ?? 0) >= SELF_HEAL_COOLDOWN_MS) {
          // 认领到了却没有节点（认领早于绑节点 / 宿主刚重启）：补建一次再回读。
          // 徽标会轮询这条路由，所以这条自愈就是「新会话自己长出来」的最后一跳；
          // 冷却只为「一直建不出来」的会话（例如工作目录解析不到）别把事件环刷满。
          selfHealAttemptAt.set(sessionId, Date.now());
          const healedState = await ensureNodeAndPublish(sessionId, 'node-by-session');
          if (healedState !== null) node = await repository.findBySession(sessionId);
        }
        if (node === null) {
          // 「没找到节点」是徽标不出现的第一个断点：必须能查到这一跳确实走到了。
          logEvent(ctx.logger, 'info', `[workflow] node-by-session none (session=${sessionId}, ${Date.now() - startedAt}ms)`, traceId);
          return { node: null, hasMessages };
        }
        // 顺便算出当前状态的「进入后默认输入」，客户端推进后用它填输入框。
        const snapshot = await repository.get(node.workflowId);
        const found = snapshot?.nodes.find((candidate) => candidate.node_id === node.nodeId);
        let enterTrigger = '';
        if (found !== undefined) {
          const global = await repository.getAppGlobalOperationDetail();
          const effective = effectiveDetail(found.current_state, found, global);
          enterTrigger = typeof effective.enter_trigger === 'string' ? effective.enter_trigger : '';
        }
        logEvent(ctx.logger, 'info', `[workflow] node-by-session ok (node=${node.nodeId}, state=${node.current_state}, ${Date.now() - startedAt}ms)`, traceId);
        return { node: { ...node, enter_trigger: enterTrigger }, pendingAdvance: readPendingAdvance(sessionId), hasMessages };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/sidebar-nodes',
      handler: makeHandler(ctx, repository, 'GET', async (_body, query) => {
        const path = query.get('path');
        const startedAt = Date.now();
        // 显示只认「节点绑过哪个会话」：不能再用进程内名单过滤，重启后名单为空会把旧会话全丢掉。
        // 坏快照被跳过时留一条 warn：否则「没有这个会话」和「快照读坏了」分不开。
        const onBroken = (fileName: string, error: unknown) => {
          logEvent(ctx.logger, 'warn', `[workflow] sidebar-nodes skipped broken snapshot (file=${fileName}): ${String((error as Error)?.message ?? error)}`);
        };
        const nodes = await readSidebarNodes(repository, path, onBroken);
        // 节点绑过会话就会一直留在仓储里，但状态点是「这个会话是工作流单元」的标志：
        // 会话切回标准模式后要跟着消失。预设读不到时保留（宁可多显示，也别误删别人的点）。
        let hiddenByPreset = 0;
        for (const sessionId of Object.keys(nodes)) {
          if (workflowPresetNow(sessionId) === false) {
            delete nodes[sessionId];
            hiddenByPreset += 1;
          }
        }
        const mode = typeof path === 'string' && path.trim() !== '' ? 'directory' : 'all';
        const hiddenNote = hiddenByPreset === 0 ? '' : `, hidden=${hiddenByPreset}`;
        logEvent(ctx.logger, 'info', `[workflow] sidebar-nodes ok (mode=${mode}, nodes=${Object.keys(nodes).length}${hiddenNote}, ${Date.now() - startedAt}ms)`);
        return { nodes };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/events',
      handler: makeHandler(ctx, repository, 'GET', async (_body, query) => {
        const rawLimit = Number(query.get('limit') ?? '100');
        return { events: recentEvents(Number.isFinite(rawLimit) ? rawLimit : 100) };
      }),
    }));
    // 浏览器半的埋点入口：落在同一个事件环里，才能和宿主日志对时间。
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/client-log',
      handler: makeHandler(ctx, repository, 'POST', async (body, _query, traceId) => {
        const level = body?.level === 'warn' ? 'warn' : 'info';
        const message = typeof body?.message === 'string' ? body.message.trim() : '';
        if (message === '') throw new Error('缺少 message');
        if (!clientLogAccepted(Date.now())) {
          // 超限静默丢弃：埋点不能反过来影响功能，也不需要报错重试。
          return { accepted: false };
        }
        logEvent(ctx.logger, level, `[workflow] client ${message.slice(0, 200)}`, traceId);
        return { accepted: true };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/bind-session',
      handler: makeHandler(ctx, repository, 'POST', async (body, _query, traceId) => {
        if (typeof body?.id !== 'string' || body.id === '') throw new Error('缺少 id');
        if (typeof body?.nodeId !== 'string' || body.nodeId === '') throw new Error('缺少 nodeId');
        if (typeof body?.sessionId !== 'string') throw new Error('缺少 sessionId');
        const startedAt = Date.now();
        const snapshot = await repository.bindSession({ id: body.id, nodeId: body.nodeId, sessionId: body.sessionId });
        // 绑定/解绑后立刻刷新该会话的状态上下文（绑定：注入；解绑：清掉）。
        const sessionId = body.sessionId.trim();
        if (sessionId !== '') await stateContext.refreshNow(sessionId);
        logEvent(ctx.logger, 'info', `[workflow] bind-session (node=${body.nodeId}, bound=${sessionId !== ''}, ${Date.now() - startedAt}ms)`, traceId);
        return { snapshot };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/approve-advance',
      handler: makeHandler(ctx, repository, 'POST', async (body) => {
        if (typeof body?.sessionId !== 'string' || body.sessionId === '') throw new Error('缺少 sessionId');
        const pending = readPendingAdvance(body.sessionId);
        if (pending === null) throw new Error('没有待确认的推进请求（可能已超时或已处理）');
        if (body.accept !== true) {
          pendingAdvances.delete(body.sessionId);
          logEvent(ctx.logger, 'info', `[workflow] advance rejected by user (session=${body.sessionId}, to=${pending.to})`);
          broadcast(body.sessionId, 'pending-cleared');
          return { accepted: false, requested: pending.to };
        }
        const found = await repository.findBySession(body.sessionId);
        if (found === null) throw new Error('当前会话还没有 workflow 节点');
        const from = String(found.current_state);
        await assertAdvanceAllowed(repository, found, from, pending.to);
        const snapshot = await repository.transitionNode({ id: found.workflowId, nodeId: found.nodeId, to: pending.to, by: 'agent-request' });
        pendingAdvances.delete(body.sessionId);
        markState(body.sessionId, pending.to);
        await stateContext.refreshNow(body.sessionId);
        logEvent(ctx.logger, 'info', `[workflow] advance accepted by user (session=${body.sessionId}, ${from}→${pending.to})`);
        broadcast(body.sessionId, 'state', pending.to);
        return { accepted: true, snapshot };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/delete',
      handler: makeHandler(ctx, repository, 'POST', async (body) => {
        if (typeof body?.id !== 'string' || body.id === '') throw new Error('缺少 id');
        await repository.remove(body.id);
        logEvent(ctx.logger, 'info', `[workflow] delete→trash (id=${body.id})`);
        return { deleted: body.id };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/trash-list',
      handler: makeHandler(ctx, repository, 'GET', async () => ({ items: await repository.listTrash() })),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/trash-restore',
      handler: makeHandler(ctx, repository, 'POST', async (body) => {
        if (typeof body?.id !== 'string' || body.id === '') throw new Error('缺少 id');
        const restored = await repository.restoreFromTrash(body.id);
        logEvent(ctx.logger, 'info', `[workflow] trash-restore (id=${body.id}, ok=${String(restored)})`);
        return { restored };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/link-workspace',
      handler: makeHandler(ctx, repository, 'POST', async (body) => {
        if (typeof body?.id !== 'string' || body.id === '') throw new Error('缺少 id');
        if (typeof body?.hostWorkspaceId !== 'string') throw new Error('缺少 hostWorkspaceId');
        const snapshot = await repository.linkWorkspace({ id: body.id, hostWorkspaceId: body.hostWorkspaceId });
        return { snapshot };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/ensure-node',
      handler: makeHandler(ctx, repository, 'POST', async (body) => {
        if (typeof body?.sessionId !== 'string' || body.sessionId === '') throw new Error('缺少 sessionId');
        // 客户端只传它能看到的工作目录；新会话可能还没提交过目录，这时由宿主按会话解析。
        const workingDirectory = typeof body?.workingDirectory === 'string' && body.workingDirectory.trim() !== ''
          ? body.workingDirectory.trim()
          : resolveSessionWorkingDirectory(ctx, body.sessionId);
        if (workingDirectory === '') throw new Error('缺少 workingDirectory（宿主也解析不到该会话的工作目录）');
        // 预设模式下不接管别的预设的会话：不建节点，客户端收到 node=null 就不显示徽标。
        // 宿主管不到的会话有两种来源：真实会话尚未注册进 sessions 服务的那一小段窗口，
        // 以及回归脚本的合成 id。以前两种一律按测试放行，结果「默认预设的新会话」在窗口期
        // 也会被建成节点、被门禁接管；现在必须由调用方显式标记 test: true 才放行。
        if (!claimBySession(body.sessionId)) {
          const knownSession = (() => {
            try {
              return ctx.get('sessions')?.get?.(body.sessionId);
            } catch {
              return undefined;
            }
          })();
          if (knownSession !== undefined) {
            // 带上读到的预设值：排查「刚切成工作流，宿主还认成旧预设」时全靠这个。
            logEvent(ctx.logger, 'info', `[workflow] ensure-node skipped (session=${body.sessionId}, preset=${rawPresetOf(body.sessionId)})`);
            return { node: null, enabled: false };
          }
          if (body.test !== true) {
            // 默认拒绝：宁可不建，也不能把一个陌生会话悄悄算进工作流。
            logEvent(ctx.logger, 'warn', `[workflow] ensure-node refused (session=${body.sessionId}, reason=unknown-session-without-test-flag)`);
            return { node: null, enabled: false };
          }
          presetSessions.add(body.sessionId);
          logEvent(ctx.logger, 'info', `[workflow] ensure-node for test session (session=${body.sessionId})`);
        }
        const startedAt = Date.now();
        try {
          const node = await repository.ensureNode({ sessionId: body.sessionId, workingDirectory });
          logEvent(ctx.logger, 'info', `[workflow] ensure-node ok (node=${node.nodeId}, ${Date.now() - startedAt}ms)`);
          broadcast(body.sessionId, 'created', String(node.current_state));
          return { node };
        } catch (error) {
          logEvent(ctx.logger, 'warn', `[workflow] ensure-node failed (${Date.now() - startedAt}ms): ${String((error as Error)?.message ?? error)}`);
          throw error;
        }
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/node-manual',
      handler: makeHandler(ctx, repository, 'GET', async (_body, query, traceId) => {
        const id = query.get('id');
        const nodeId = query.get('nodeId');
        if (typeof id !== 'string' || id === '') throw new Error('缺少 id');
        if (typeof nodeId !== 'string' || nodeId === '') throw new Error('缺少 nodeId');
        const startedAt = Date.now();
        const manual = await repository.readNodeManual(id, nodeId);
        const globalManual = await repository.readGlobalManual(id);
        // 弹窗「手册是空的」有两种原因（没建 / 读失败），埋点至少能分开：exists 与读取字节数。
        logEvent(ctx.logger, 'info', `[workflow] node-manual (node=${nodeId}, exists=${String(manual !== null)}, manual=${manual === null ? 0 : Buffer.byteLength(manual.manual, 'utf8')}B, global=${Buffer.byteLength(globalManual, 'utf8')}B, ${Date.now() - startedAt}ms)`, traceId);
        return { manual, globalManual };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/node-checklist',
      handler: makeHandler(ctx, repository, 'GET', async (_body, query, traceId) => {
        const id = query.get('id');
        const nodeId = query.get('nodeId');
        if (typeof id !== 'string' || id === '') throw new Error('缺少 id');
        if (typeof nodeId !== 'string' || nodeId === '') throw new Error('缺少 nodeId');
        const startedAt = Date.now();
        const meta = await repository.getManualMeta(id, nodeId);
        // 验收七项：徽标要显示 n/7 与问询数，名字在服务端拼好，客户端不用再懂协议表。
        const verification = await repository.getVerification(id, nodeId);
        const verificationView = verification.items.map((item) => ({
          id: item.id,
          name: VERIFY_CHECKS.find((check) => check.id === item.id)?.name ?? '',
          mark: item.mark,
          summary: item.report?.summary ?? '',
        }));
        logEvent(ctx.logger, 'info', `[workflow] node-checklist (node=${nodeId}, exists=${String(meta !== null)}, items=${meta?.checklist.length ?? 0}, verify=${verificationView.filter((item) => item.mark !== 'pending').length}/7, ${Date.now() - startedAt}ms)`, traceId);
        return {
          exists: meta !== null,
          checklist: meta?.checklist ?? [],
          hasPlan: meta?.hasPlan ?? false,
          verification: verificationView,
          verificationRound: verification.round,
        };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/open-folder',
      handler: makeHandler(ctx, repository, 'POST', async (body) => {
        const target = body?.path;
        if (typeof target !== 'string' || target.trim() === '') throw new Error('缺少 path');
        spawn('explorer.exe', [target.trim()], { stdio: 'ignore', detached: true }).unref();
        return { opened: true };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/transition',
      handler: makeHandler(ctx, repository, 'POST', async (body, _query, traceId) => {
        if (typeof body?.id !== 'string' || body.id === '') throw new Error('缺少 id');
        if (typeof body?.nodeId !== 'string' || body.nodeId === '') throw new Error('缺少 nodeId');
        if (typeof body?.to !== 'string' || body.to === '') throw new Error('缺少 to');
        const startedAt = Date.now();
        try {
          // 人工点击也走同一套前置：方案没写不能进实现中，清单没勾完不能进验收中。
          const before = await repository.get(body.id);
          const nodeBefore = before?.nodes.find((node) => node.node_id === body.nodeId);
          if (nodeBefore !== undefined) {
            await assertAdvanceAllowed(
              repository,
              { workflowId: body.id, nodeId: body.nodeId, current_state: nodeBefore.current_state },
              String(nodeBefore.current_state),
              body.to,
            );
          }
          const snapshot = await repository.transitionNode({ id: body.id, nodeId: body.nodeId, to: body.to, by: 'human' });
          // 推进后立刻重算该会话的状态上下文：否则下一条消息还会带旧状态的规则。
          const moved = snapshot.nodes.find((node) => node.node_id === body.nodeId);
          if (typeof moved?.session_id === 'string' && moved.session_id !== '') {
            // 人工切换后，模型之前挂着的推进请求就作废了。
            pendingAdvances.delete(moved.session_id);
            markState(moved.session_id, body.to);
            await stateContext.refreshNow(moved.session_id);
            broadcast(moved.session_id, 'state', body.to);
          }
          // 记 from → to：只看 to 分不清「从讨论中推进」还是「从验收中返工」。
          const lastEntry = moved?.history?.[moved.history.length - 1];
          logEvent(ctx.logger, 'info', `[workflow] transition ok (node=${body.nodeId}, from=${lastEntry?.from ?? '?'}, to=${body.to}, ${Date.now() - startedAt}ms)`, traceId);
          return { snapshot };
        } catch (error) {
          logEvent(ctx.logger, 'warn', `[workflow] transition failed (node=${body.nodeId}, to=${body.to}, ${Date.now() - startedAt}ms): ${String((error as Error)?.message ?? error)}`, traceId);
          throw error;
        }
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/pin',
      handler: makeHandler(ctx, repository, 'POST', async (body) => {
        if (typeof body?.id !== 'string' || body.id === '') throw new Error('缺少 id');
        const snapshot = await repository.setPinned({ id: body.id, pinned: body.pinned === true });
        return { snapshot };
      }),
    }));
  });
}
