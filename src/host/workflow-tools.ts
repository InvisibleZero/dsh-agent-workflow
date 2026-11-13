// @ts-nocheck
/**
 * 工作流的硬机制：写操作门禁 + 工具网关（两个模型工具）。
 *
 * 为什么是网关：模型不再直接看到 5 个基础工具，只能：
 *   1) `workflow_tool_call`：按目录里的名字调用，目录外 / 阶段不符 / 参数不符一律拒；
 *   2) `workflow_tool_add`：登记 / 更新工具（先校验，再过宿主审批），只写工具表、不执行业务。
 *
 * 判定全部走 engine/tool-policy 的纯函数；这里只做「取数据 → 判定 → 执行 → 记账」。
 *
 * 策略（2026-11-13 定稿）：
 *   - 只有「讨论中」禁止宿主写工具；实现中 / 验收中 / 已完结放行。
 *   - 手册与勾选走网关，不经过 write，因此不受门禁影响。
 *   - 「分步绝对」落在推进前置上：方案没写不能进实现中，清单没勾完不能进验收中。
 */
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import { VERIFY_CHECKS, verifyMarkSymbol } from '../schema/verify-checks';
import { describePendingItems, resolveVerifyCheckId, summarizeVerification, validateVerifyReportInput } from '../engine/verify-rules';
import { logEvent, newTraceId } from './event-log';
import { BASE_TOOLS, TOOL_KIND, type ToolEntry } from '../schema/tool-catalog';
import {
  FACTORY_TOOL_NAMES,
  FACTORY_TOOLS,
  countVisibleByKind,
  decideToolCall,
  mergeCatalog,
  summarizeArgs,
  validateToolRegistration,
} from '../engine/tool-policy';
import { findChecker } from '../engine/checkers';
import { runCommand } from './command-runner';
import type { ToolLedgerInput } from './tool-ledger';

/** 会被门禁拦的"动手"类工具。 */
const SIDE_EFFECT_TOOLS = new Set(['write', 'edit', 'apply_patch', 'pwsh', 'bash', 'notebook']);

/** 合法状态迁移表（客户端「返工」菜单是它的展示子集，两边都要能走通）。 */
const ALLOWED_TRANSITIONS = {
  discussing: ['implementing'],
  implementing: ['verifying', 'discussing'],
  verifying: ['completed', 'implementing', 'discussing'],
  completed: ['verifying', 'implementing', 'discussing'],
};

const STATE_ORDER = ['discussing', 'implementing', 'verifying', 'completed'];

/** 允许 AI 通过 workflow_manual 改的小节；「实施顺序」只在讨论中可定义，之后只能勾选。 */
const WRITABLE_SECTIONS = {
  session: ['方案', '实施顺序'],
  project: ['项目总览', '决策记录', '约束', '坑与防线', '标签表'],
};

export interface WorkflowToolsDeps {
  repository: any;
  /** 推进 / 报备后立刻重算系统提示（工具登记后目录也要跟着变）。 */
  stateContext?: { refreshNow?: (sessionId: string) => Promise<string> };
  /** 扩展工具表：全局一份，不分工作区。 */
  registryStore: {
    list: () => Promise<{ entries: ToolEntry[]; corrupt: boolean }>;
    save: (entry: ToolEntry) => Promise<ToolEntry[]>;
    update: (entry: ToolEntry) => Promise<ToolEntry[]>;
  };
  /** 插件自带的工具脚本目录：扩展工具的 script 相对这里解析。 */
  /** 插件 node_modules/.bin 的绝对路径：检查器跑命令时加进 PATH，让命令用插件自带的工具、不触发 npx 下载。 */
  nodeModulesBin?: string;
  /** 检查器跑命令的执行器：测试注入用，默认是真跑。 */
  runCommand?: (input: { cwd: string; command: string; timeoutMs?: number; binDir?: string }) => Promise<{
    ok: boolean;
    exit_code: number | null;
    timed_out: boolean;
    ms: number;
    tail: string;
  }>;
  /**
   * 宿主审批：登记 / 更新工具前问一次用户。
   *
   * 返回 ApprovalOutcome（allowed-once / rejected / cancelled / unavailable）。
   * 没接这个依赖、或它答不上来时，调用方按 'unavailable' 处理，即拒绝——fail-closed。
   */
  requestApproval?: (input: {
    sessionId: string;
    agent: any;
    toolName: string;
    reason: string;
  }) => Promise<string>;
  /** 审计账：每次 tool.call / tool.add 一条。 */
  recordToolEvent?: (entry: ToolLedgerInput) => void;
  isPresetSession: (sessionId: unknown) => boolean;
  getState: (sessionId: string) => string | undefined;
  /** 状态表缺条时补一次（异步、可读盘）；门禁与工具都靠它自愈。 */
  refreshState?: (sessionId: string) => Promise<void>;
  setState: (sessionId: string, state: string) => void;
  logger: any;
  /** 记一条"等待用户同意"的推进请求；真正切换状态由用户的点击完成。 */
  requestAdvance: (input: { sessionId: string; to: string; reason?: string }) => void;
  pendingAdvanceOf: (sessionId: string) => { to: string; reason?: string } | null;
  clearPendingAdvance: (sessionId: string) => void;
  /**
   * 通知前端「这个会话变了」。
   *
   * 报备 / 撤勾都不改状态，但徽标上的 n/7 会变；不推的话聊过的会话没有轮询，
   * 只能等页面刷新才看得见——验收时会被当成「没打勾」。
   */
  notify?: (sessionId: string, reason: string) => void;
}

function labelOf(state: string): string {
  return NODE_STATE_LABEL[state] ?? state;
}

/** 拒绝理由：只有「讨论中」拦写操作。 */
function denialFor(state: string, toolName: string): string | undefined {
  if (state !== 'discussing') return undefined;
  return `当前状态是「讨论中」，不允许执行 ${toolName}：讨论阶段只出方案、不改代码。先调用 workflow_tool_call({ name: "workflow_advance", args: { to: "implementing" } }) 推进到「实现中」（需要先把方案写进会话手册），或请用户点状态胶囊的 →。`;
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
        // 状态表缺这一条（认领发生在节点绑定之前 / 宿主刚重启）时**默认拦住**：
        // 放行等于"讨论中也能改代码"，漏拦比误拦危险。同时排一次回填，重试即可恢复。
        void deps.refreshState?.(sessionId);
        logEvent(ctx.logger, 'warn', `[workflow] guard denied (session=${sessionId}, tool=${toolName}, state=unknown)`);
        return `当前会话的工作流状态还没同步好（状态表缺这一条），为防绕过阶段限制，先拦住这次写操作。已触发同步，请重试一次；若反复出现，说明这个会话还没绑定 workflow 节点。`;
      }
      const reason = denialFor(state, toolName);
      if (reason !== undefined) {
        logEvent(ctx.logger, 'info', `[workflow] guard denied (session=${sessionId}, tool=${toolName}, state=${state})`);
      }
      return reason;
    }));
  });
}

/**
 * 注册两个模型工具：网关调用与工具登记。
 *
 * 两个工具都只在工作流会话里出现（`when`），不污染标准模式。
 */
export function registerWorkflowTools(ctx: any, deps: WorkflowToolsDeps): void {
  ctx.inject(['tools'], (toolCtx: any) => {
    const whenWorkflow = (context: any) => deps.isPresetSession(context?.agent?.session?.id);

    /** 统一的工具埋点：成功/失败各一条，带 trace/耗时/会话，失败直接抛回模型。 */
    const instrument = async (toolName: string, sessionId: string, trace: string, run: () => Promise<any>): Promise<any> => {
      const startedAt = Date.now();
      try {
        const value = await run();
        logEvent(ctx.logger, 'info', `[workflow] tool ${toolName} ok (session=${sessionId}, trace=${trace}, ${Date.now() - startedAt}ms)`);
        return value;
      } catch (error) {
        const message = String((error as Error)?.message ?? error);
        logEvent(ctx.logger, 'warn', `[workflow] tool ${toolName} failed (session=${sessionId}, trace=${trace}, ${Date.now() - startedAt}ms): ${message}`);
        throw error;
      }
    };

    const record = (input: ToolLedgerInput): void => deps.recordToolEvent?.(input);

    // —— 1. 调用目录里的工具（模型唯一的调用入口） ——
    toolCtx.effect(() => toolCtx.tools.register({
      name: 'workflow_tool_call',
      description:
        '调用工具目录里的工具：name 是目录里的工具名，args 是它的参数。目录在系统提示里（基础工具 + 本工作区的扩展工具）。'
        + '目录外名字、当前阶段不可用、参数不符、覆盖固定参数都会被拒，拒绝理由会原样返回；新增工具用 workflow_tool_add。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'args'],
        properties: {
          name: { type: 'string', description: '目录里的工具名（例：workflow_manual / check_deps）。' },
          args: { type: 'object', description: '该工具的参数对象；按目录里的必填项与参数说明传。', additionalProperties: true },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['ok', 'name', 'run', 'value'],
          properties: {
            ok: { type: 'boolean' },
            name: { type: 'string' },
            run: { type: 'string' },
            value: { type: 'object' },
          },
        },
        render: (_args: any, value: any) => [{
          type: 'text',
          text: `已调用 ${value.name}${value.value?.message ? `：${value.value.message}` : ''}`,
        }],
      },
      execute: async (args: any, exec: any) => {
        const sessionId = requireSession(deps, exec);
        const trace = newTraceId();
        return instrument('workflow_tool_call', sessionId, trace, async () => {
          const found = await deps.repository.findBySession(sessionId);
          if (found === null) throw new Error('当前会话还没有 workflow 节点');
          const name = typeof args?.name === 'string' ? args.name : '';
          const catalog = await loadCatalog(deps);
          const state = await currentStateOf(deps, sessionId);
          const startedAt = Date.now();
          const entry = catalog.find((item) => item.name === name);
          if (entry === undefined) {
            const message = `工具目录里没有「${name}」：只能调用目录里的工具；要新增请用 workflow_tool_add。`;
            record({
              kind: 'call', session: sessionId, workflow_id: found.workflowId, name, trace,
              decision: 'deny', code: 'unknown-tool', state, args: summarizeArgs(args?.args), message,
            });
            throw new Error(message);
          }
          const runText = describeRun(entry);
          const decision = decideToolCall({ state, entry, args: args?.args });
          if (!decision.allow) {
            record({
              kind: 'call', session: sessionId, workflow_id: found.workflowId, name, trace,
              run: runText, version: entry.version, decision: 'deny', code: decision.code, state,
              args: summarizeArgs(args?.args), message: decision.message,
            });
            throw new Error(decision.message);
          }
          const merged = args?.args ?? {};
          let value: any;
          try {
            value = await invokeTool(deps, entry, merged, sessionId);
          } catch (error) {
            const message = String((error as Error)?.message ?? error);
            record({
              kind: 'call', session: sessionId, workflow_id: found.workflowId, name, trace,
              run: runText, version: entry.version, decision: 'error', code: 'execution-failed', state,
              args: summarizeArgs(args?.args), ms: Date.now() - startedAt, message,
            });
            throw error;
          }
          record({
            kind: 'call', session: sessionId, workflow_id: found.workflowId, name, trace,
            run: runText, version: entry.version, decision: 'allow', state,
            args: summarizeArgs(args?.args), ms: Date.now() - startedAt,
            ...(typeof value?.checker === 'string'
              ? {
                checker: value.checker,
                ok: value.ok === true,
                findings: Array.isArray(value.findings) ? value.findings.length : 0,
              }
              : {}),
          });
          return { ok: true, name: entry.name, run: runText, value };
        });
      },
    }, { when: whenWorkflow }));

    // —— 2. 登记 / 更新一个工具（先校验，再过宿主审批） ——
    toolCtx.effect(() => toolCtx.tools.register({
      name: 'workflow_tool_add',
      description:
        '登记一个扩展工具，或更新一个已登记的扩展工具（mode=update）。这是**开发期登记入口**，'
        + '不是给 AI 在运行时动态加能力的：登记结果写进工具表随代码进 git，别人 clone 下来直接可用。'
        + '模型只有申请权：静态校验通过后还要走宿主审批，只有 allowed-once 才写入。'
        + '扩展工具 = 名字 + 描述 + 指向哪个内置检查器（run.checker）+ 可用阶段；'
        + '检查器会跑插件自带的工具（vitest / dependency-cruiser / knip）检查项目；回归压测不自动跑，只读项目自产的证据文件。'
        + '只能在讨论中 / 实现中登记；「验收中」可见的扩展工具上限 8 条（基础工具另有独立的 6 条上限）。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'run', 'effect', 'allowed_states', 'sample_args'],
        properties: {
          mode: { type: 'string', enum: ['create', 'update'], description: 'create（默认）= 新增；update = 整条替换已有工具（会重新审批）。' },
          name: { type: 'string', description: '工具名：3~41 位小写字母/数字/下划线，以字母开头（例：check_deps）。' },
          description: { type: 'string', description: '说明：做什么、什么时候用（≤400 字）；第一句会被注入系统提示，要能独立说明用途。' },
          run: {
            type: 'object',
            description: '{kind:"checker",checker:"deps"}；checker 必须是内置检查器 id：contract / deps / deadcode / boundary / regression。',
            additionalProperties: true,
          },
          effect: { type: 'string', enum: ['read-state', 'write-state', 'exec'], description: '副作用分级；跑外部进程用 exec。' },
          allowed_states: {
            type: 'array',
            items: { type: 'string', enum: ['discussing', 'implementing', 'verifying', 'completed'] },
            description: '这个工具在哪些状态可用（非空）。',
          },
          parameters: { type: 'object', description: '可选：给模型看的参数 JSON Schema；不传 = 接受任意参数。', additionalProperties: true },
          sample_args: { type: 'object', description: '必填：一个能跑通的示例参数，登记时用它校验参数形状。', additionalProperties: true },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['ok', 'entry', 'message'],
          properties: {
            ok: { type: 'boolean' },
            entry: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'run', 'allowed_states', 'version'],
              properties: {
                name: { type: 'string' },
                run: { type: 'string' },
                allowed_states: { type: 'array', items: { type: 'string' } },
                version: { type: 'number' },
              },
            },
            message: { type: 'string' },
          },
        },
        render: (_args: any, value: any) => [{
          type: 'text',
          text: `已登记「${value.entry?.name ?? '?'}」（${value.entry?.run ?? '?'}，v${value.entry?.version ?? '?'}），现在可以通过 workflow_tool_call 调用。`,
        }],
      },
      execute: async (args: any, exec: any) => {
        const sessionId = requireSession(deps, exec);
        const trace = newTraceId();
        const startedAt = Date.now();
        return instrument('workflow_tool_add', sessionId, trace, async () => {
          const found = await deps.repository.findBySession(sessionId);
          if (found === null) throw new Error('当前会话还没有 workflow 节点');
          const state = await currentStateOf(deps, sessionId);
          if (state !== 'discussing' && state !== 'implementing') {
            const message = `当前状态「${labelOf(state)}」不能登记工具：工具变更会污染验收结论，等回到讨论中 / 实现中再登记。`;
            record({
              kind: 'add', session: sessionId, workflow_id: found.workflowId, name: String(args?.name ?? ''), trace,
              decision: 'deny', code: 'stage-denied', state, message,
            });
            throw new Error(message);
          }
          const mode: 'create' | 'update' = args?.mode === 'update' ? 'update' : 'create';
          const requestedName = String(args?.name ?? '').trim();
          const listing = await deps.registryStore.list();
          if (listing.corrupt) {
            logEvent(deps.logger, 'warn', `[workflow] tool registry corrupt (workflow=${found.workflowId})：扩展工具暂时不可用，基础工具不受影响`);
          }
          // 更新时不把自己算进「重名」里。
          const others = mode === 'update'
            ? listing.entries.filter((entry) => entry.name !== requestedName)
            : listing.entries;
          const validation = validateToolRegistration({
            name: args?.name,
            description: args?.description,
            run: args?.run,
            effect: args?.effect,
            allowedStates: args?.allowed_states,
            parameters: args?.parameters,
            parametersGiven: args?.parameters !== undefined && args?.parameters !== null,
            sampleArgs: args?.sample_args,
            existingNames: [...FACTORY_TOOL_NAMES, ...others.map((entry) => entry.name)],
            verifyingCounts: countVisibleByKind(listing.entries, 'verifying'),
            mode,
          });
          if (!validation.ok) {
            record({
              kind: 'add', session: sessionId, workflow_id: found.workflowId, name: requestedName, trace,
              decision: 'deny', code: validation.code, state, message: validation.message,
            });
            throw new Error(validation.message);
          }
          if (mode === 'update' && !listing.entries.some((entry) => entry.name === requestedName)) {
            const message = `没有叫「${requestedName}」的已登记工具：新建请用 mode=create。`;
            record({
              kind: 'add', session: sessionId, workflow_id: found.workflowId, name: requestedName, trace,
              decision: 'deny', code: 'unknown-tool', state, message,
            });
            throw new Error(message);
          }

          // 宿主审批：登记与更新都要问题主；没有审批通道就是拒绝（fail-closed）。
          const runText = describeRun(validation.entry);
          const approval = await (deps.requestApproval?.({
            sessionId,
            agent: exec?.agent,
            toolName: 'workflow_tool_add',
            reason: `${mode === 'update' ? '更新' : '登记'}工具「${requestedName}」：${runText}`,
          }) ?? Promise.resolve('unavailable'));
          if (approval !== 'allowed-once') {
            const message = approval === 'unavailable'
              ? '登记工具需要审批，但当前没有可用的审批人（fail-closed）：这次没有写入。'
              : `登记工具没有通过审批（${approval}）：这次没有写入。`;
            record({
              kind: 'add', session: sessionId, workflow_id: found.workflowId, name: requestedName, trace,
              run: runText, decision: 'deny', code: 'approval-denied', state, approval, message,
            });
            throw new Error(message);
          }

          const nextVersion = mode === 'update'
            ? (listing.entries.find((entry) => entry.name === requestedName)?.version ?? 0) + 1
            : 1;
          const entry: ToolEntry = {
            ...validation.entry,
            version: nextVersion,
            created_at: new Date().toISOString(),
          };
          if (mode === 'update') await deps.registryStore.update(entry);
          else await deps.registryStore.save(entry);
          record({
            kind: 'add', session: sessionId, workflow_id: found.workflowId, name: entry.name, trace,
            run: runText, version: entry.version, decision: 'allow', state, approval,
            args: summarizeArgs(args?.sample_args ?? {}), ms: Date.now() - startedAt,
          });
          // 目录变了：下一轮系统提示要立刻带上新工具。
          await deps.stateContext?.refreshNow?.(sessionId);
          const required = entry.parameters.required ?? [];
          return {
            ok: true,
            entry: { name: entry.name, run: runText, allowed_states: entry.allowed_states, version: entry.version },
            message: `已${mode === 'update' ? '更新' : '登记'}「${entry.name}」（${runText}，v${entry.version}）；调用时必填：${required.length > 0 ? required.join(',') : '无'}。`,
          };
        });
      },
    }, { when: whenWorkflow }));
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 目录 = 基础工具 + 全局扩展工具；文件坏时只丢扩展工具，基础工具照常。 */
async function loadCatalog(deps: WorkflowToolsDeps): Promise<ToolEntry[]> {
  const listing = await deps.registryStore.list();
  if (listing.corrupt) {
    logEvent(deps.logger, 'warn', '[workflow] tool registry corrupt：扩展工具暂时不可用，基础工具不受影响');
  }
  return mergeCatalog(FACTORY_TOOLS, listing.entries);
}

/** 把执行方式压成一行：审计账与审批理由共用，避免两处各写一套。 */
function describeRun(entry: ToolEntry): string {
  if (entry.kind === TOOL_KIND.extension) return `checker:${entry.run?.checker ?? '?'}`;
  return `base:${entry.name}`;
}

/** 取当前状态；缺条先补一次，补不到就明确拒绝（不能拿 undefined 当"允许"）。 */
async function currentStateOf(deps: WorkflowToolsDeps, sessionId: string): Promise<string> {
  let state = deps.getState(sessionId);
  if (state === undefined) {
    await deps.refreshState?.(sessionId);
    state = deps.getState(sessionId);
  }
  if (state === undefined) {
    throw new Error('读不到这个会话的工作流状态（可能还没绑定 workflow 节点）。已触发同步，请重试一次。');
  }
  return state;
}

/** 按 kind 分发：扩展工具跑脚本，基础工具走内置 handler。网关只做转发。 */
async function invokeTool(deps: WorkflowToolsDeps, entry: ToolEntry, args: any, sessionId: string): Promise<any> {
  if (entry.kind === TOOL_KIND.extension) return invokeChecker(deps, entry, args, sessionId);
  return invokeBaseTool(deps, entry.name, args, sessionId);
}

/** 基础工具的分派点：只有这 5 个名字，别的一律当未知。 */
async function invokeBaseTool(deps: WorkflowToolsDeps, name: string, args: any, sessionId: string): Promise<any> {
  switch (name) {
    case 'workflow_advance': return invokeAdvance(deps, sessionId, args);
    case 'workflow_manual': return invokeManual(deps, sessionId, args);
    case 'workflow_check': return invokeCheck(deps, sessionId, args);
    case 'workflow_verify_report': return invokeVerifyReport(deps, sessionId, args);
    case 'workflow_verify_check': return invokeVerifyCheck(deps, sessionId, args);
    default: throw new Error(`未知的基础工具：${name}`);
  }
}

/**
 * 扩展工具：先在工作目录执行检查器自带的命令，再读产物判定。
 *
 * 命令是检查器定义里的常量模板（只有 target 可替换），调用方不能传命令——
 * 所以这里不会执行模型给的任意字符串。
 * 缺工具 / 超时 / 坏产物都判不合格，不抛错：它们是验收结果的一部分。
 */
async function invokeChecker(deps: WorkflowToolsDeps, entry: ToolEntry, args: any, sessionId: string): Promise<any> {
  const found = await deps.repository.findBySession(sessionId);
  if (found === null) throw new Error('当前会话还没有 workflow 节点');
  const run = entry.run as { kind: 'checker'; checker: string };
  const checker = findChecker(run.checker);
  if (checker === undefined) {
    throw new Error(`工具「${entry.name}」指向的检查器「${run.checker}」不在注册表里：先补实现再登记`);
  }
  const snapshot = await deps.repository.get(found.workflowId);
  const workingDirectory = snapshot?.working_directory;
  if (typeof workingDirectory !== 'string' || workingDirectory === '') {
    throw new Error('该 workflow 没有工作目录，检查器跑不了：先给它指定工作目录');
  }

  const target = resolveCheckerTarget(args?.target, checker);
  const command = checker.buildCommand(target);
  const evidencePath = join(workingDirectory, '.workflow', 'evidence', checker.evidence);
  await mkdir(dirname(evidencePath), { recursive: true });

  let commandResult: { ok: boolean; exit_code: number | null; timed_out: boolean; ms: number; tail: string } | null = null;
  if (checker.autoRun) {
    const execute = deps.runCommand ?? runCommand;
    commandResult = await execute({ cwd: workingDirectory, command, binDir: deps.nodeModulesBin });
  }

  let data: unknown = null;
  let parseError = '';
  try {
    data = JSON.parse(await readFile(evidencePath, 'utf8'));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') parseError = String((error as Error)?.message ?? error);
  }

  const result = parseError === ''
    ? checker.check(data)
    : {
      ok: false,
      findings: [{ location: checker.evidence, problem: `证据文件解析失败：${parseError}` }],
      stats: {},
    };

  logEvent(
    deps.logger,
    'info',
    `[workflow] checker run (session=${sessionId}, tool=${entry.name}, checker=${checker.id}, `
    + `auto=${String(checker.autoRun)}, exit=${String(commandResult?.exit_code ?? 'n/a')}, `
    + `ok=${String(result.ok)}, findings=${result.findings.length}, ${commandResult?.ms ?? 0}ms)`,
  );
  return {
    ok: result.ok,
    checker: checker.id,
    command: checker.autoRun ? command : null,
    exit_code: commandResult?.exit_code ?? null,
    timed_out: commandResult?.timed_out ?? false,
    findings: result.findings,
    stats: result.stats,
    ...(commandResult !== null && commandResult.ok !== true
      ? { command_output: commandResult.tail.slice(-800) }
      : {}),
  };
}

/**
 * 检查器目标的校验：两种形态。
 *   - 路径片段：字母数字与 . _ - / @（拼进 shell 安全）
 *   - URL：http(s)://主机[:端口][/路径]（不带查询串，避免 & ? 注入）
 * 两者都不允许空白、引号、分号、重定向。
 */
function resolveCheckerTarget(
  raw: unknown,
  checker: { defaultTarget: string; requiresTarget?: boolean },
): string {
  const text = raw === undefined || raw === null ? '' : String(raw).trim();
  if (text === '') {
    if (checker.requiresTarget === true) {
      throw new Error('这一项需要目标地址：调用时传 target（例：{"target":"http://127.0.0.1:3000"}）');
    }
    return checker.defaultTarget;
  }
  if (/^https?:\/\//i.test(text)) {
    if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._/-]*)?$/i.test(text)) {
      throw new Error('target 作为 URL 时只允许 http(s)://主机[:端口][/路径]，不能带查询串或特殊字符');
    }
    return text;
  }
  if (!/^[A-Za-z0-9_.@/-]+$/.test(text)) {
    throw new Error('target 只能是相对路径片段（字母/数字/. _ - / @），不能含空格、引号、分号或重定向');
  }
  if (text.startsWith('/') || /^[A-Za-z]:/.test(text) || text.includes('..')) {
    throw new Error('target 不能是绝对路径，也不能含 ..');
  }
  return text;
}

/** 1. 推进状态：只登记请求，不改状态。 */
async function invokeAdvance(deps: WorkflowToolsDeps, sessionId: string, args: any): Promise<any> {
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
  logEvent(deps.logger, 'info', `[workflow] advance requested (session=${sessionId}, ${from}→${to}${backward ? ', rework' : ''})`);
  return {
    requested: to,
    status: 'awaiting-approval',
    message: `已请求从「${labelOf(from)}」切换到「${labelOf(to)}」，等待用户在会话里确认；同意之前状态不会变。`,
  };
}

/** 2. 读写手册（会话手册 / 项目手册）。 */
async function invokeManual(deps: WorkflowToolsDeps, sessionId: string, args: any): Promise<any> {
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
  // —— 项目手册的条目级写口：一条一写，必须带标签 ——
  if (action === 'append_entry' || action === 'update_entry' || action === 'remove_entry' || action === 'rename_tag') {
    if (target !== 'project') {
      throw new Error('条目级写入只对项目手册（target=project）可用；会话手册用 replace_section 写方案');
    }
    const section = String(args?.section ?? '').trim();
    const tags = Array.isArray(args?.tags) ? args.tags.map((tag: unknown) => String(tag)) : [];
    const entry = String(args?.entry ?? '').trim();
    try {
      if (action === 'append_entry') {
        const written = await deps.repository.appendProjectEntry({
          workflowId: found.workflowId, section, tags, content: String(args?.content ?? ''),
        });
        logEvent(deps.logger, 'info', `[workflow] manual entry appended (session=${sessionId}, section=${section}, table=${written.tags.length}, registered=${written.registered.length})`);
        return { ok: true, section, entry: written.entry, tags: written.tags, registered: written.registered };
      }
      if (action === 'update_entry') {
        const written = await deps.repository.updateProjectEntry({
          workflowId: found.workflowId, section, entry, tags, content: String(args?.content ?? ''),
        });
        logEvent(deps.logger, 'info', `[workflow] manual entry updated (session=${sessionId}, section=${section}, tags=${written.tags.length})`);
        return { ok: true, section, entry: written.entry, tags: written.tags };
      }
      if (action === 'remove_entry') {
        const removed = await deps.repository.removeProjectEntry({ workflowId: found.workflowId, section, entry });
        logEvent(deps.logger, 'info', `[workflow] manual entry removed (session=${sessionId}, section=${section})`);
        return { ok: true, section, removed: removed.removed };
      }
      const from = String(args?.from ?? '');
      const to = String(args?.to ?? '');
      const renamed = await deps.repository.renameProjectTag({ workflowId: found.workflowId, from, to });
      logEvent(deps.logger, 'info', `[workflow] manual tag renamed (session=${sessionId}, from=${from}, to=${to}, rewritten=${renamed.rewritten}, table=${renamed.tags.length})`);
      return { ok: true, tags: renamed.tags, rewritten: renamed.rewritten };
    } catch (error) {
      // 被标签规则拒（缺标签 / 表满 / 匹配不到）也是"正常拒绝"：单独记一条，别和程序错混在一起。
      logEvent(
        deps.logger,
        'warn',
        `[workflow] manual entry rejected (session=${sessionId}, action=${action}, section=${section}): ${String((error as Error)?.message ?? error)}`,
      );
      throw error;
    }
  }
  if (action !== 'replace_section') {
    throw new Error('action 只能是 read / replace_section / append_entry / update_entry / remove_entry / rename_tag');
  }
  const section = String(args?.section ?? '').trim();
  const writable = WRITABLE_SECTIONS[target];
  if (!writable.includes(section)) {
    throw new Error(`「${target}」手册只能改这些小节：${writable.join(' / ')}；${section === '实施顺序' ? '清单请用 workflow_check 勾选。' : ''}`);
  }
  if (typeof args?.content !== 'string' || args.content.trim() === '') throw new Error('content 不能为空');
  // 「实施顺序」只在讨论中定义；进入实现中之后只能勾选，不能重排或改写条目。
  if (target === 'session' && section === '实施顺序') {
    // 状态表可能还没回填（认领早于绑节点）：先补一次，否则"讨论中"会被误判。
    if (deps.getState(sessionId) === undefined) await deps.refreshState?.(sessionId);
    const state = deps.getState(sessionId);
    if (state === undefined) {
      throw new Error('读不到这个会话的工作流状态（可能还没绑定 workflow 节点）：先让宿主完成认领，再定义实施顺序。');
    }
    if (state !== 'discussing') {
      throw new Error('「实施顺序」只能在「讨论中」定义；进入实现中之后请用 workflow_check 逐条勾选，不要改写条目。');
    }
  }
  let result: { bytes: number; section: string; chars: number };
  try {
    result = await deps.repository.replaceManualSection({ workflowId: found.workflowId, nodeId, section, content: args.content });
  } catch (error) {
    // 被字数闸门拒是一种"正常的拒绝"，不是程序错：单独记一条，排查时不必去猜参数错还是超限。
    if ((error as any)?.code === 'manual-limit') {
      logEvent(
        deps.logger,
        'warn',
        `[workflow] manual gate rejected (session=${sessionId}, target=${target}, section=${section}): ${String((error as Error)?.message ?? error)}`,
      );
    }
    throw error;
  }
  logEvent(deps.logger, 'info', `[workflow] manual write (session=${sessionId}, target=${target}, section=${section}, bytes=${result.bytes}, chars=${result.chars})`);
  return { ok: true, bytes: result.bytes, section };
}

/** 3. 勾选实施顺序。 */
async function invokeCheck(deps: WorkflowToolsDeps, sessionId: string, args: any): Promise<any> {
  const state = deps.getState(sessionId);
  if (state === undefined) await deps.refreshState?.(sessionId);
  const stateNow = deps.getState(sessionId);
  if (stateNow === 'discussing') throw new Error('「讨论中」还不勾清单：先把方案写进会话手册，推进到「实现中」再勾。');
  const found = await deps.repository.findBySession(sessionId);
  if (found === null) throw new Error('当前会话还没有 workflow 节点');
  const label = String(args?.item ?? '').trim();
  if (label === '') throw new Error('item 不能为空');
  const items = await deps.repository.setChecklistItem({
    workflowId: found.workflowId,
    nodeId: found.nodeId,
    label,
    done: args?.done === true,
    evidence: typeof args?.evidence === 'string' ? args.evidence : '',
  });
  return { items };
}

/** 4. 提交验收报备（七项中的一项）。 */
async function invokeVerifyReport(deps: WorkflowToolsDeps, sessionId: string, args: any): Promise<any> {
  const found = await requireVerifyingNode(deps, sessionId);
  const itemId = resolveVerifyCheckId(args?.item);
  const check = VERIFY_CHECKS.find((entry) => entry.id === itemId);
  if (check === undefined) throw new Error(`没有 ${itemId} 号验收项`);
  const report = validateVerifyReportInput(check, args);
  const { state } = await deps.repository.submitVerifyReport({
    workflowId: found.workflowId,
    nodeId: found.nodeId,
    itemId,
    report,
  });
  const progress = summarizeVerification(state);
  const item = state.items.find((entry: any) => entry.id === itemId);
  // 报备成功必须留「哪一项、什么标记、第几轮」：否则日志只能证明工具调过，
  // 答不上「这一项是刚被标上的，还是上一轮遗留的」——验收排查第一跳就断。
  logEvent(
    deps.logger,
    'info',
    `[workflow] verify report (session=${sessionId}, item=${itemId}, mark=${item?.mark ?? 'pending'}, round=${state.round}, pending=${progress.pending})`,
  );
  // 徽标上的 n/7 变了：推一次，别让页面等刷新才看见勾。
  deps.notify?.(sessionId, 'verify');
  return {
    item: { id: itemId, name: check.name, mark: item?.mark ?? 'pending' },
    progress: {
      pass: progress.pass,
      deferred: progress.deferred,
      pending: progress.pending,
      total: progress.total,
    },
  };
}

/** 5. 取消验收标记（AI 只能取消，不能直接打勾）。 */
async function invokeVerifyCheck(deps: WorkflowToolsDeps, sessionId: string, args: any): Promise<any> {
  if (args?.done !== false) {
    throw new Error('AI 不能直接打验收勾：先调用 workflow_verify_report 提交报备，标记由报备落。取消勾请传 done=false。');
  }
  const found = await requireVerifyingNode(deps, sessionId);
  const itemId = resolveVerifyCheckId(args?.item);
  const { state, item } = await deps.repository.cancelVerifyMark({
    workflowId: found.workflowId,
    nodeId: found.nodeId,
    itemId,
  });
  const progress = summarizeVerification(state);
  logEvent(
    deps.logger,
    'info',
    `[workflow] verify cancel (session=${sessionId}, item=${itemId}, round=${state.round}, pending=${progress.pending})`,
  );
  // 撤勾也改徽标，同样要推。
  deps.notify?.(sessionId, 'verify');
  return {
    item: { id: itemId, mark: item.mark },
    progress: {
      pass: progress.pass,
      deferred: progress.deferred,
      pending: progress.pending,
      total: progress.total,
    },
  };
}

/** 取当前会话，并确认它归本插件管。 */
function requireSession(deps: WorkflowToolsDeps, exec: any): string {
  const sessionId = exec?.agent?.session?.id;
  if (typeof sessionId !== 'string' || sessionId === '') throw new Error('这个工具需要一个会话');
  if (!deps.isPresetSession(sessionId)) throw new Error('这个工具只对「工作流模式」预设的会话可用');
  return sessionId;
}

/** 验收类工具的前置：必须在「验收中」，且能定位到节点。 */
async function requireVerifyingNode(
  deps: WorkflowToolsDeps,
  sessionId: string,
): Promise<{ workflowId: string; nodeId: string }> {
  let state = deps.getState(sessionId);
  if (state === undefined) {
    await deps.refreshState?.(sessionId);
    state = deps.getState(sessionId);
  }
  if (state === undefined) throw new Error('读不到这个会话的工作流状态（可能还没绑定 workflow 节点）');
  if (state !== 'verifying') {
    throw new Error(`验收报备只能在「验收中」提交（当前是「${labelOf(state)}」）：先让用户推进到验收中。`);
  }
  const found = await deps.repository.findBySession(sessionId);
  if (found === null) throw new Error('当前会话还没有 workflow 节点');
  return found;
}

/** 推进前置：方案非空才能进实现中；清单全勾才能进验收中。工具与人工点击共用。 */
export async function assertAdvanceAllowed(repository: any, found: any, from: string, to: string): Promise<void> {
  if (to === 'implementing' && from === 'discussing') {
    const meta = await repository.getManualMeta(found.workflowId, found.nodeId);
    if (meta === null || meta.hasPlan !== true) {
      throw new Error(
        '会话手册的「方案」还是空的：先用 workflow_tool_call({ name: "workflow_manual", args: { target: "session", action: "replace_section", section: "方案", content: "..." } }) 写入方案，再推进到「实现中」。',
      );
    }
  }
  if (to === 'verifying' && from === 'implementing') {
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
  if (to === 'completed' && from === 'verifying') {
    const verification = await repository.getVerification(found.workflowId, found.nodeId);
    const summary = summarizeVerification(verification);
    if (!summary.complete) {
      throw new Error(
        `验收还有 ${summary.pending} 项没处理（${describePendingItems(verification)}）：逐项用 workflow_verify_report 报备`
        + '（pass 记 ✓，deferred 记 ？），全部处理完才能进「已完结」。',
      );
    }
  }
}
