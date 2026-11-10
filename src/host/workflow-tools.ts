// @ts-nocheck
/**
 * 工作流的硬机制：写操作门禁 + 三个模型专用工具。
 *
 * 为什么不是提示词：状态机是硬约束，文字约束不住模型。这里用 DSH 现成能力把约束做成机制：
 *   1) `tools.guard(fn)`：派发前执行，返回理由即拒绝，理由会作为错误结果回给模型；
 *   2) `tools.register(def, { when })`：只在工作流会话里出现，不污染标准模式。
 *
 * 策略（2026-11-11 定稿）：
 *   - 只有「讨论中」禁止改代码；实现中 / 验收中 / 已完结都放行。
 *   - 手册与勾选走专用工具，不经过 write，因此不受门禁影响。
 *   - 「分步绝对」落在推进前置上：方案没写不能进实现中，清单没勾完不能进验收中。
 */
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import { logEvent } from './event-log';

/** 会被门禁拦的"动手"类工具。 */
const SIDE_EFFECT_TOOLS = new Set(['write', 'edit', 'apply_patch', 'pwsh', 'bash', 'notebook']);

/** 合法推进表（与客户端推进/返工表保持一致）。 */
const ALLOWED_TRANSITIONS = {
  discussing: ['implementing'],
  implementing: ['verifying', 'discussing'],
  verifying: ['completed', 'implementing', 'discussing'],
  completed: ['implementing', 'discussing'],
};

const STATE_ORDER = ['discussing', 'implementing', 'verifying', 'completed'];

/** 允许 AI 通过 workflow_manual 改的小节；「实施顺序」只在讨论中可定义，之后只能勾选。 */
const WRITABLE_SECTIONS = {
  session: ['方案', '实施顺序'],
  project: ['项目总览', '决策记录', '约束', '坑与防线'],
};

export interface WorkflowToolsDeps {
  repository: any;
  isPresetSession: (sessionId: unknown) => boolean;
  getState: (sessionId: string) => string | undefined;
  setState: (sessionId: string, state: string) => void;
  logger: any;
  /** 记一条"等待用户同意"的推进请求；真正切换状态由用户的点击完成。 */
  requestAdvance: (input: { sessionId: string; to: string; reason?: string }) => void;
  pendingAdvanceOf: (sessionId: string) => { to: string; reason?: string } | null;
  clearPendingAdvance: (sessionId: string) => void;
}

function labelOf(state: string): string {
  return NODE_STATE_LABEL[state] ?? state;
}

/** 拒绝理由：只有「讨论中」拦写操作。 */
function denialFor(state: string, toolName: string): string | undefined {
  if (state !== 'discussing') return undefined;
  return `当前状态是「讨论中」，不允许执行 ${toolName}：讨论阶段只出方案、不改代码。先调用 workflow_advance({ to: "implementing" }) 推进到「实现中」（需要先把方案写进会话手册），或请用户点状态胶囊的 →。`;
}

/** 注册门禁：只在「讨论中」拦截写操作。 */
export function registerWorkflowGuard(ctx: any, deps: WorkflowToolsDeps): void {
  ctx.inject(['tools'], (toolCtx: any) => {
    toolCtx.effect(() => toolCtx.tools.guard((exec: any) => {
      const sessionId = exec?.agent?.session?.id;
      if (!deps.isPresetSession(sessionId)) return undefined;
      const toolName = String(exec?.name ?? '');
      if (!SIDE_EFFECT_TOOLS.has(toolName)) return undefined;
      const state = deps.getState(sessionId);
      if (state === undefined) {
        logEvent(ctx.logger, 'info', `[workflow] guard skipped (session=${sessionId}, tool=${toolName}, reason=unknown-state)`);
        return undefined;
      }
      const reason = denialFor(state, toolName);
      if (reason !== undefined) {
        logEvent(ctx.logger, 'info', `[workflow] guard denied (session=${sessionId}, tool=${toolName}, state=${state})`);
      }
      return reason;
    }));
  });
}

/** 注册三个模型专用工具：推进 / 写手册 / 勾选清单。 */
export function registerWorkflowTools(ctx: any, deps: WorkflowToolsDeps): void {
  ctx.inject(['tools'], (toolCtx: any) => {
    const whenWorkflow = (context: any) => deps.isPresetSession(context?.agent?.session?.id);

    /** 统一的工具埋点：成功/失败各一条，带耗时与会话，失败直接抛回模型。 */
    const instrument = async (toolName: string, sessionId: string, run: () => Promise<any>): Promise<any> => {
      const startedAt = Date.now();
      try {
        const value = await run();
        logEvent(ctx.logger, 'info', `[workflow] tool ${toolName} ok (session=${sessionId}, ${Date.now() - startedAt}ms)`);
        return value;
      } catch (error) {
        const message = String((error as Error)?.message ?? error);
        logEvent(ctx.logger, 'warn', `[workflow] tool ${toolName} failed (session=${sessionId}, ${Date.now() - startedAt}ms): ${message}`);
        throw error;
      }
    };

    // —— 1. 推进状态 ——
    toolCtx.effect(() => toolCtx.tools.register({
      name: 'workflow_advance',
      description:
        'Request a stage change for this workflow session. This tool does NOT change the stage: it validates the preconditions and leaves a request the user must approve in the session UI (a 同意 / 拒绝 control appears next to the state badge). Call it when the user agrees to move on: 讨论中→实现中 before writing any code (the session manual must contain a plan), 实现中→验收中 when every checklist item is checked. Only available in sessions using the workflow preset.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['to'],
        properties: {
          to: {
            type: 'string',
            enum: ['discussing', 'implementing', 'verifying', 'completed'],
            description: 'Requested stage. Forward = normal progression; backward = rework.',
          },
          reason: {
            type: 'string',
            description: 'Required when moving backward (rework): why the previous stage was insufficient.',
          },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['requested', 'status', 'message'],
          properties: {
            requested: { type: 'string' },
            status: { type: 'string' },
            message: { type: 'string' },
          },
        },
        render: (_args: any, value: any) => [
          { type: 'text', text: `已请求切换到「${labelOf(value.requested)}」，等待用户确认。` },
        ],
      },
      execute: async (args: any, exec: any) => {
        const sessionId = requireSession(deps, exec);
        return instrument('workflow_advance', sessionId, async () => {
        const found = await deps.repository.findBySession(sessionId);
        if (found === null) throw new Error('当前会话还没有 workflow 节点');
        const from = String(found.current_state);
        const to = String(args?.to ?? '');
        const allowed = ALLOWED_TRANSITIONS[from] ?? [];
        if (!allowed.includes(to)) {
          throw new Error(`不能从「${labelOf(from)}」直接到「${labelOf(to)}」；当前可去：${allowed.map(labelOf).join(' / ')}`);
        }
        const backward = STATE_ORDER.indexOf(to) < STATE_ORDER.indexOf(from);
        if (backward && (typeof args?.reason !== 'string' || args.reason.trim() === '')) {
          throw new Error('返工需要 reason：说明上一阶段哪里不够');
        }
        await assertAdvanceAllowed(deps.repository, found, from, to);
        // 只登记请求，不改状态：切换由用户在界面上点「同意」完成。
        deps.requestAdvance({ sessionId, to, ...(typeof args?.reason === 'string' ? { reason: args.reason } : {}) });
        logEvent(ctx.logger, 'info', `[workflow] advance requested (session=${sessionId}, ${from}→${to}${backward ? ', rework' : ''})`);
        return {
          requested: to,
          status: 'awaiting-approval',
          message: `已请求从「${labelOf(from)}」切换到「${labelOf(to)}」，等待用户在会话里确认；同意之前状态不会变。`,
        };
        });
      },
    }, { when: whenWorkflow }));

    // —— 2. 读写手册（会话手册 / 项目手册）——
    toolCtx.effect(() => toolCtx.tools.register({
      name: 'workflow_manual',
      description:
        'Read or update this workflow session\'s manual. target=session edits 会话手册 (writable section: 方案); target=project edits 项目手册 (writable sections: 项目总览 / 决策记录 / 要点). Replaces one section body only — headings and other sections are preserved, and the 实施顺序 checklist cannot be edited here (use workflow_check). Allowed in every stage.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['target', 'action'],
        properties: {
          target: { type: 'string', enum: ['session', 'project'], description: 'Which manual to touch.' },
          action: { type: 'string', enum: ['read', 'replace_section'], description: 'read returns the text; replace_section rewrites one section body.' },
          section: { type: 'string', description: 'Section name for replace_section (e.g. 方案 / 项目总览 / 决策记录 / 要点).' },
          content: { type: 'string', description: 'New body for that section (markdown, without the heading).' },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['ok'],
          properties: {
            ok: { type: 'boolean' },
            text: { type: 'string' },
            bytes: { type: 'integer' },
            section: { type: 'string' },
          },
        },
        render: (args: any, value: any) => [
          { type: 'text', text: args?.action === 'read' ? `手册共 ${value.text?.length ?? 0} 字` : `已更新「${value.section}」小节（${value.bytes} 字节）` },
        ],
      },
      execute: async (args: any, exec: any) => {
        const sessionId = requireSession(deps, exec);
        return instrument('workflow_manual', sessionId, async () => {
        const found = await deps.repository.findBySession(sessionId);
        if (found === null) throw new Error('当前会话还没有 workflow 节点');
        const target = String(args?.target ?? '');
        if (target !== 'session' && target !== 'project') throw new Error('target 只能是 session 或 project');
        const action = String(args?.action ?? '');
        const nodeId = target === 'session' ? found.nodeId : null;
        if (action === 'read') {
          const text = await deps.repository.readManual(found.workflowId, nodeId);
          return { ok: true, text };
        }
        if (action !== 'replace_section') throw new Error('action 只能是 read 或 replace_section');
        const section = String(args?.section ?? '').trim();
        const writable = WRITABLE_SECTIONS[target];
        if (!writable.includes(section)) {
          throw new Error(`「${target}」手册只能改这些小节：${writable.join(' / ')}；${section === '实施顺序' ? '清单请用 workflow_check 勾选。' : ''}`);
        }
        if (typeof args?.content !== 'string' || args.content.trim() === '') throw new Error('content 不能为空');
        // 「实施顺序」只在讨论中定义；进入实现中之后只能勾选，不能重排或改写条目。
        if (target === 'session' && section === '实施顺序') {
          const state = deps.getState(sessionId);
          if (state !== 'discussing') {
            throw new Error('「实施顺序」只能在「讨论中」定义；进入实现中之后请用 workflow_check 逐条勾选，不要改写条目。');
          }
        }
        const result = await deps.repository.replaceManualSection({ workflowId: found.workflowId, nodeId, section, content: args.content });
        logEvent(ctx.logger, 'info', `[workflow] manual write (session=${sessionId}, target=${target}, section=${section}, bytes=${result.bytes})`);
        return { ok: true, bytes: result.bytes, section };
        });
      },
    }, { when: whenWorkflow }));

    // —— 3. 勾选实施顺序 ——
    toolCtx.effect(() => toolCtx.tools.register({
      name: 'workflow_check',
      description:
        'Check or uncheck ONE item in this workflow session\'s 实施顺序 checklist. The item text must match an existing line exactly — this tool never adds, rewords, or reorders items. Every item must be checked before the session can move to 验收中. Not available in 讨论中.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['item', 'done'],
        properties: {
          item: { type: 'string', description: 'Exact text of an existing checklist item.' },
          done: { type: 'boolean', description: 'true = checked, false = unchecked.' },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['label', 'done'],
                properties: {
                  label: { type: 'string' },
                  done: { type: 'boolean' },
                },
              },
            },
          },
        },
        render: (_args: any, value: any) => [
          { type: 'text', text: `清单进度：${value.items.filter((item: any) => item.done).length}/${value.items.length}` },
        ],
      },
      execute: async (args: any, exec: any) => {
        const sessionId = requireSession(deps, exec);
        return instrument('workflow_check', sessionId, async () => {
        const state = deps.getState(sessionId);
        if (state === 'discussing') throw new Error('「讨论中」还不勾清单：先把方案写进会话手册，推进到「实现中」再勾。');
        const found = await deps.repository.findBySession(sessionId);
        if (found === null) throw new Error('当前会话还没有 workflow 节点');
        const label = String(args?.item ?? '').trim();
        if (label === '') throw new Error('item 不能为空');
        const items = await deps.repository.setChecklistItem({
          workflowId: found.workflowId,
          nodeId: found.nodeId,
          label,
          done: args?.done === true,
        });
        return { items };
        });
      },
    }, { when: whenWorkflow }));
  });
}

/** 取当前会话，并确认它归本插件管。 */
function requireSession(deps: WorkflowToolsDeps, exec: any): string {
  const sessionId = exec?.agent?.session?.id;
  if (typeof sessionId !== 'string' || sessionId === '') throw new Error('这个工具需要一个会话');
  if (!deps.isPresetSession(sessionId)) throw new Error('这个工具只对「工作流模式」预设的会话可用');
  return sessionId;
}

/** 推进前置：方案非空才能进实现中；清单全勾才能进验收中。工具与人工点击共用。 */
export async function assertAdvanceAllowed(repository: any, found: any, from: string, to: string): Promise<void> {
  if (to === 'implementing' && from === 'discussing') {
    const meta = await repository.getManualMeta(found.workflowId, found.nodeId);
    if (meta === null || meta.hasPlan !== true) {
      throw new Error(
        '会话手册的「方案」还是空的：先用 workflow_manual({ target: "session", action: "replace_section", section: "方案", content: "..." }) 写入方案，再推进到「实现中」。',
      );
    }
  }
  if (to === 'verifying') {
    const meta = await repository.getManualMeta(found.workflowId, found.nodeId);
    const items = meta?.checklist ?? [];
    if (items.length === 0) {
      throw new Error('「实施顺序」里还没有条目：先用 workflow_manual 写入方案和实施顺序，再逐条用 workflow_check 勾选。');
    }
    const unchecked = items.filter((item: any) => item.done !== true);
    if (unchecked.length > 0) {
      throw new Error(`还有 ${unchecked.length} 条没勾完，不能进「验收中」：${unchecked.map((item: any) => item.label).join(' / ')}`);
    }
  }
}
