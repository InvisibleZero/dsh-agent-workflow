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
import { effectiveDetail } from './engine/state-machine';
import { registerWorkflowStateContext } from './host/workflow-state-context';

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

function makeHandler(repository: WorkflowRepository, method: string, run: (body: any, query: URLSearchParams) => Promise<unknown>) {
  return async (req: any, res: any) => {
    if (!isLoopbackRequest(req)) return denyRequest(res);
    if (req.method !== method) return sendJson(res, 405, { ok: false, error: `只接受 ${method}` });
    let body: any = {};
    let query = new URLSearchParams();
    try {
      if (req.method === 'POST') body = await readJsonBody(req);
      const rawQuery = String((req.url ?? '').split('?')[1] ?? '');
      query = new URLSearchParams(rawQuery);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: String((error as Error).message ?? error) });
    }
    try {
      const value = await run(body, query);
      sendJson(res, 200, { ok: true, ...value });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: String((error as Error).message ?? error) });
    }
  };
}

export function apply(ctx: any) {
  const repository = new WorkflowRepository(resolveDataDir());
  // 按状态注入操作细节（系统提示里的动态上下文，不写会话记录）。
  const stateContext = registerWorkflowStateContext(ctx, repository);

  ctx.inject(['webServer'], (webCtx: any) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/list',
      handler: makeHandler(repository, 'GET', async () => ({ items: await repository.list() })),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/create',
      handler: makeHandler(repository, 'POST', async (body) => {
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
      handler: makeHandler(repository, 'GET', async (_body, query) => {
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
      handler: makeHandler(repository, 'GET', async (_body, query) => {
        const sessionId = query.get('sessionId');
        if (typeof sessionId !== 'string' || sessionId === '') throw new Error('缺少 sessionId');
        return { text: await stateContext.peek(sessionId) };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/global-settings',
      handler: makeHandler(repository, 'GET', async () => ({
        globalOperationDetail: await repository.getAppGlobalOperationDetail(),
      })),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/global-settings-save',
      handler: makeHandler(repository, 'POST', async (body) => {
        if (body?.globalOperationDetail === undefined || body.globalOperationDetail === null) {
          throw new Error('缺少 globalOperationDetail');
        }
        const globalOperationDetail = await repository.updateAppGlobalOperationDetail(body.globalOperationDetail);
        return { globalOperationDetail };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/node-detail',
      handler: makeHandler(repository, 'GET', async (_body, query) => {
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
      handler: makeHandler(repository, 'POST', async (body) => {
        if (typeof body?.id !== 'string' || body.id === '') throw new Error('缺少 id');
        if (typeof body?.nodeId !== 'string' || body.nodeId === '') throw new Error('缺少 nodeId');
        if (typeof body?.state !== 'string' || body.state === '') throw new Error('缺少 state');
        if (typeof body?.text !== 'string') throw new Error('缺少 text');
        const startedAt = Date.now();
        try {
          const snapshot = await repository.setNodeNote({ id: body.id, nodeId: body.nodeId, state: body.state, text: body.text });
          ctx.logger?.info?.(`[workflow] node-note ok (node=${body.nodeId}, state=${body.state}, ${Date.now() - startedAt}ms)`);
          return { snapshot };
        } catch (error) {
          ctx.logger?.warn?.(`[workflow] node-note failed (node=${body.nodeId}, state=${body.state}, ${Date.now() - startedAt}ms): ${String((error as Error)?.message ?? error)}`);
          throw error;
        }
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/node-by-session',
      handler: makeHandler(repository, 'GET', async (_body, query) => {
        const sessionId = query.get('sessionId');
        if (typeof sessionId !== 'string' || sessionId === '') throw new Error('缺少 sessionId');
        const node = await repository.findBySession(sessionId);
        if (node === null) return { node: null };
        // 顺便算出当前状态的「进入后默认输入」，客户端推进后用它填输入框。
        const snapshot = await repository.get(node.workflowId);
        const found = snapshot?.nodes.find((candidate) => candidate.node_id === node.nodeId);
        let enterTrigger = '';
        if (found !== undefined) {
          const global = await repository.getAppGlobalOperationDetail();
          const effective = effectiveDetail(found.current_state, found, global);
          enterTrigger = typeof effective.enter_trigger === 'string' ? effective.enter_trigger : '';
        }
        return { node: { ...node, enter_trigger: enterTrigger } };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/sidebar-nodes',
      handler: makeHandler(repository, 'GET', async (_body, query) => {
        const path = query.get('path');
        if (typeof path !== 'string' || path === '') return { nodes: {} };
        const startedAt = Date.now();
        const nodes = await repository.getNodeStatesByDirectory(path);
        ctx.logger?.info?.(`[workflow] sidebar-nodes ok (nodes=${Object.keys(nodes).length}, ${Date.now() - startedAt}ms)`);
        return { nodes };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/bind-session',
      handler: makeHandler(repository, 'POST', async (body) => {
        if (typeof body?.id !== 'string' || body.id === '') throw new Error('缺少 id');
        if (typeof body?.nodeId !== 'string' || body.nodeId === '') throw new Error('缺少 nodeId');
        if (typeof body?.sessionId !== 'string') throw new Error('缺少 sessionId');
        const snapshot = await repository.bindSession({ id: body.id, nodeId: body.nodeId, sessionId: body.sessionId });
        // 绑定/解绑后立刻刷新该会话的状态上下文（绑定：注入；解绑：清掉）。
        const sessionId = body.sessionId.trim();
        if (sessionId !== '') await stateContext.refreshNow(sessionId);
        return { snapshot };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/delete',
      handler: makeHandler(repository, 'POST', async (body) => {
        if (typeof body?.id !== 'string' || body.id === '') throw new Error('缺少 id');
        await repository.remove(body.id);
        ctx.logger?.info?.(`[workflow] delete→trash (id=${body.id})`);
        return { deleted: body.id };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/trash-list',
      handler: makeHandler(repository, 'GET', async () => ({ items: await repository.listTrash() })),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/trash-restore',
      handler: makeHandler(repository, 'POST', async (body) => {
        if (typeof body?.id !== 'string' || body.id === '') throw new Error('缺少 id');
        const restored = await repository.restoreFromTrash(body.id);
        ctx.logger?.info?.(`[workflow] trash-restore (id=${body.id}, ok=${String(restored)})`);
        return { restored };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/link-workspace',
      handler: makeHandler(repository, 'POST', async (body) => {
        if (typeof body?.id !== 'string' || body.id === '') throw new Error('缺少 id');
        if (typeof body?.hostWorkspaceId !== 'string') throw new Error('缺少 hostWorkspaceId');
        const snapshot = await repository.linkWorkspace({ id: body.id, hostWorkspaceId: body.hostWorkspaceId });
        return { snapshot };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/ensure-node',
      handler: makeHandler(repository, 'POST', async (body) => {
        if (typeof body?.sessionId !== 'string' || body.sessionId === '') throw new Error('缺少 sessionId');
        if (typeof body?.workingDirectory !== 'string' || body.workingDirectory === '') throw new Error('缺少 workingDirectory');
        const startedAt = Date.now();
        try {
          const node = await repository.ensureNode({ sessionId: body.sessionId, workingDirectory: body.workingDirectory });
          ctx.logger?.info?.(`[workflow] ensure-node ok (node=${node.nodeId}, ${Date.now() - startedAt}ms)`);
          return { node };
        } catch (error) {
          ctx.logger?.warn?.(`[workflow] ensure-node failed (${Date.now() - startedAt}ms): ${String((error as Error)?.message ?? error)}`);
          throw error;
        }
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/node-manual',
      handler: makeHandler(repository, 'GET', async (_body, query) => {
        const id = query.get('id');
        const nodeId = query.get('nodeId');
        if (typeof id !== 'string' || id === '') throw new Error('缺少 id');
        if (typeof nodeId !== 'string' || nodeId === '') throw new Error('缺少 nodeId');
        const manual = await repository.readNodeManual(id, nodeId);
        const globalManual = await repository.readGlobalManual(id);
        return { manual, globalManual };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/node-checklist',
      handler: makeHandler(repository, 'GET', async (_body, query) => {
        const id = query.get('id');
        const nodeId = query.get('nodeId');
        if (typeof id !== 'string' || id === '') throw new Error('缺少 id');
        if (typeof nodeId !== 'string' || nodeId === '') throw new Error('缺少 nodeId');
        const meta = await repository.getManualMeta(id, nodeId);
        return {
          exists: meta !== null,
          checklist: meta?.checklist ?? [],
          hasPlan: meta?.hasPlan ?? false,
        };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/open-folder',
      handler: makeHandler(repository, 'POST', async (body) => {
        const target = body?.path;
        if (typeof target !== 'string' || target.trim() === '') throw new Error('缺少 path');
        spawn('explorer.exe', [target.trim()], { stdio: 'ignore', detached: true }).unref();
        return { opened: true };
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/transition',
      handler: makeHandler(repository, 'POST', async (body) => {
        if (typeof body?.id !== 'string' || body.id === '') throw new Error('缺少 id');
        if (typeof body?.nodeId !== 'string' || body.nodeId === '') throw new Error('缺少 nodeId');
        if (typeof body?.to !== 'string' || body.to === '') throw new Error('缺少 to');
        const startedAt = Date.now();
        try {
          const snapshot = await repository.transitionNode({ id: body.id, nodeId: body.nodeId, to: body.to });
          // 推进后立刻重算该会话的状态上下文：否则下一条消息还会带旧状态的规则。
          const moved = snapshot.nodes.find((node) => node.node_id === body.nodeId);
          if (typeof moved?.session_id === 'string' && moved.session_id !== '') {
            await stateContext.refreshNow(moved.session_id);
          }
          ctx.logger?.info?.(`[workflow] transition ok (node=${body.nodeId}, to=${body.to}, ${Date.now() - startedAt}ms)`);
          return { snapshot };
        } catch (error) {
          ctx.logger?.warn?.(`[workflow] transition failed (node=${body.nodeId}, to=${body.to}, ${Date.now() - startedAt}ms): ${String((error as Error)?.message ?? error)}`);
          throw error;
        }
      }),
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-workflow/pin',
      handler: makeHandler(repository, 'POST', async (body) => {
        if (typeof body?.id !== 'string' || body.id === '') throw new Error('缺少 id');
        const snapshot = await repository.setPinned({ id: body.id, pinned: body.pinned === true });
        return { snapshot };
      }),
    }));
  });
}
