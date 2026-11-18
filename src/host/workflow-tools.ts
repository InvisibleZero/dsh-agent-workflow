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
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import { VERIFY_CHECKS, verifyMarkSymbol } from '../schema/verify-checks';
import { describePendingItems, resolveVerifyCheckId, summarizeVerification, validateVerifyReportInput } from '../engine/verify-rules';
import { logEvent, newTraceId } from './event-log';
import { BASE_TOOLS, LAYER_GATES, TOOL_KIND, type ToolEntry } from '../schema/tool-catalog';
import {
  FACTORY_TOOLS,
  decideToolCall,
  summarizeArgs,
} from '../engine/tool-policy';
import { findChecker } from '../engine/checkers';
import { hasMachineDriver } from '../engine/degrade';
import { runCommand } from './command-runner';
import { detectStack } from './stack-detect';
import { listCandidateProjects, nearestProject, resolveProjects, type ProjectRef } from './project-root';
import { lintImportsPath, resolveProjectPython, resolvePython } from './tool-locate';
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
  /** 插件根目录：脚本型检查器按 `<packageRoot>/scripts/<script>` 解析，window 缺它时脚本检查器直接报错。 */
  packageRoot?: string;
  /** 检查器跑命令的执行器：测试注入用，默认是真跑。 */
  runCommand?: (input: { cwd: string; command: string; timeoutMs?: number; binDir?: string }) => Promise<{
    ok: boolean;
    exit_code: number | null;
    timed_out: boolean;
    ms: number;
    tail: string;
  }>;
  /** 确保 Python 三件套可用（惰性安装）：测试注入用，默认是真探测 + 缺了就离线装。 */
  ensurePythonTools?: (python: string, packageRoot: string) => boolean;
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
  /**
   * 门禁自身异常上报：非空字符串 = 记录「插件坏了」（徽标变红），null = 清除。
   * 和「被正常拦截」分开——一个看不见却报告没问题的门禁，比没有门禁更危险。
   */
  reportGuardError?: (sessionId: string, message: string | null) => void;
  /**
   * 实现中范围拦截的同步缓存：{ workingDir, scope（相对路径数组）}；null = 无范围限制。
   * 清单没声明范围、不在实现中、或还没算好都返回 null——按放行处理（保守）。
   */
  getScope?: (sessionId: string) => { workingDir: string; scope: string[] } | null;
  /** extend_scope 之后刷新范围缓存：让门禁立刻读到新范围，不等下一次状态迁移。 */
  refreshScope?: (sessionId: string) => Promise<void>;
}

function labelOf(state: string): string {
  return NODE_STATE_LABEL[state] ?? state;
}

/** 拒绝理由：只有「讨论中」拦写操作。 */
function denialFor(state: string, toolName: string): string | undefined {
  if (state !== 'discussing') return undefined;
  return `当前状态是「讨论中」，不允许执行 ${toolName}：讨论阶段只出方案、不改代码。先调用 workflow_tool_call({ name: "workflow_advance", args: { to: "implementing" } }) 推进到「实现中」（需要先把方案写进会话手册），或请用户点状态胶囊的 →。`;
}

/** 从写工具的入参里尽量取出目标文件路径；取不到返回 null（保守放行）。 */
function extractWritePath(exec: any): string | null {
  const containers = [exec?.args, exec?.arguments, exec?.input, exec?.params];
  for (const container of containers) {
    if (typeof container !== 'object' || container === null || Array.isArray(container)) continue;
    for (const key of ['path', 'file_path', 'filePath', 'file', 'filename', 'target', 'output', 'output_path', 'to']) {
      const value = (container as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim() !== '') return value.trim();
    }
  }
  return null;
}

/** 从命令型工具（pwsh/bash）入参里取命令串；取不到返回 null。 */
function extractCommand(exec: any): string | null {
  const containers = [exec?.args, exec?.arguments, exec?.input, exec?.params];
  for (const container of containers) {
    if (typeof container !== 'object' || container === null || Array.isArray(container)) continue;
    for (const key of ['command', 'cmd', 'script']) {
      const value = (container as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim() !== '') return value.trim();
    }
  }
  return null;
}

/** 归一化后判断写入路径是否落在声明范围内（目录前缀匹配或精确匹配，大小写不敏感）。 */
function isWithinScope(writeAbs: string, scopes: string[]): boolean {
  const target = writeAbs.replace(/\\/g, '/').toLowerCase();
  for (const scope of scopes) {
    const base = scope.replace(/\\/g, '/').toLowerCase();
    if (target === base) return true;
    if (target.startsWith(`${base}/`)) return true;
  }
  return false;
}

/** 注册门禁：只在「讨论中」拦截写操作。 */
export function registerWorkflowGuard(ctx: any, deps: WorkflowToolsDeps): void {
  ctx.inject(['tools'], (toolCtx: any) => {
    toolCtx.effect(() => toolCtx.tools.guard((exec: any) => {
      const sessionId = exec?.agent?.session?.id;
      if (!deps.isPresetSession(sessionId)) return undefined;
      const toolName = String(exec?.name ?? '');
      // 命令型工具调用留痕：验收中 AI 跑命令做 AI 证据，这一跳必须可见可审查（命令原文 + 会话）。
      if (toolName === 'pwsh' || toolName === 'bash') {
        const cmd = extractCommand(exec);
        logEvent(ctx.logger, 'info', `[workflow] command-tool invoked (session=${sessionId}, tool=${toolName}, cmd=${String(cmd ?? '').slice(0, 200)})`);
      }
      try {
        if (!SIDE_EFFECT_TOOLS.has(toolName)) {
          deps.reportGuardError?.(sessionId, null);
          return undefined;
        }
        const state = deps.getState(sessionId);
        if (state === undefined) {
          // 状态表缺这一条（认领发生在节点绑定之前 / 宿主刚重启）时**默认拦住**：
          // 放行等于"讨论中也能改代码"，漏拦比误拦危险。同时排一次回填，重试即可恢复。
          void deps.refreshState?.(sessionId);
          logEvent(ctx.logger, 'warn', `[workflow] guard denied (session=${sessionId}, tool=${toolName}, state=unknown)`);
          deps.reportGuardError?.(sessionId, null);
          return `当前会话的工作流状态还没同步好（状态表缺这一条），为防绕过阶段限制，先拦住这次写操作。已触发同步，请重试一次；若反复出现，说明这个会话还没绑定 workflow 节点。`;
        }
        const reason = denialFor(state, toolName);
        if (reason !== undefined) {
          logEvent(ctx.logger, 'info', `[workflow] guard denied (session=${sessionId}, tool=${toolName}, state=${state})`);
          deps.reportGuardError?.(sessionId, null);
          return reason;
        }
        // 实现中范围拦截（保守版）：清单声明了范围、能确定写入路径、且路径明显越界时才拦。
        // 拿不到路径（bash/pwsh 等命令串）或没声明范围都放行，只留痕，别误伤正常开发。
        if (state === 'implementing') {
          const scopeInfo = deps.getScope?.(sessionId) ?? null;
          if (scopeInfo !== null && scopeInfo.scope.length > 0) {
            const writePath = extractWritePath(exec);
            if (writePath !== null) {
              const writeAbs = resolve(isAbsolute(writePath) ? writePath : join(scopeInfo.workingDir, writePath));
              const scopeAbs = scopeInfo.scope.map((scopePath) => resolve(scopeInfo.workingDir, scopePath));
              if (!isWithinScope(writeAbs, scopeAbs)) {
                logEvent(ctx.logger, 'info', `[workflow] guard denied (session=${sessionId}, tool=${toolName}, state=implementing, reason=out-of-scope)`);
                deps.reportGuardError?.(sessionId, null);
                return `当前「实现中」的实施范围只允许改动：${scopeInfo.scope.join(' / ')}。要写「${writePath}」超出了声明范围；先返工回「讨论中」补方案/范围（workflow_advance to: discussing，带 reason），或确认这是方案里已声明的改动。`;
              }
            } else {
              logEvent(ctx.logger, 'info', `[workflow] guard scope-unknown (session=${sessionId}, tool=${toolName}, state=implementing)`);
            }
          }
        }
        deps.reportGuardError?.(sessionId, null);
        return undefined;
      } catch (error) {
        // guard 自己抛异常（不是"模型被管住"，而是"插件坏了"）：仍按 fail-closed 拒绝，
        // 但必须让用户能区分这两种——记 guard-error + 让徽标变红提示。
        const message = String((error as Error)?.message ?? error);
        deps.reportGuardError?.(sessionId, message);
        logEvent(ctx.logger, 'warn', `[workflow] guard-error (session=${sessionId}, tool=${toolName}): ${message}`);
        return `门禁判定时发生内部错误（已按 fail-closed 拒绝本次写操作）：${message}。这表示插件本身出了问题，不是模型被正常拦截；请查看事件日志或重启插件。`;
      }
    }));
  });
}

/** 把工具调用结果压成一行回给模型：检查器要亮出 ok/findings/exit_code，不能只说「已调用」。 */
function renderToolCallResult(value: any): string {
  const head = `已调用 ${value?.name ?? ''}`;
  const inner = value?.value;
  if (inner && typeof inner.checker === 'string') {
    const okText = inner.ok === true ? '检查通过' : '检查未通过';
    const findingsCount = Array.isArray(inner.findings) ? inner.findings.length : 0;
    const exitText = inner.exit_code === null || inner.exit_code === undefined ? 'exit=n/a' : `exit=${inner.exit_code}`;
    const problems = Array.isArray(inner.findings)
      ? inner.findings.map((finding: any) => (finding?.problem ? String(finding.problem) : JSON.stringify(finding))).join('；')
      : '';
    return `${head}（${okText}，findings=${findingsCount}，${exitText}）${problems === '' ? '' : `：${problems}`}`;
  }
  const message = inner?.message;
  return message ? `${head}：${message}` : head;
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
          text: renderToolCallResult(value),
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
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 目录 = 固定 13 工具（5 基础 + 8 检查器），无登记表。 */
async function loadCatalog(_deps: WorkflowToolsDeps): Promise<ToolEntry[]> {
  return FACTORY_TOOLS;
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
 * 检查器命令：脚本型走 `node <packageRoot>/scripts/<script>`；否则按技术栈选命令
 * （有对应栈的 buildCommands 就用它，没有退回 buildCommand 默认模板）。调用方不能传命令。
 */
function commandForChecker(checker: any, target: string, stack: string | null, tools: any, packageRoot?: string): string {
  if (checker.script !== undefined) {
    if (typeof packageRoot !== 'string' || packageRoot === '') {
      throw new Error(`检查器「${checker.id}」用脚本执行，但宿主没给出 packageRoot：先修宿主注入`);
    }
    return `node "${join(packageRoot, 'scripts', checker.script)}"`;
  }
  if (typeof stack === 'string' && stack !== '' && typeof checker.buildCommands?.[stack] === 'function') {
    return checker.buildCommands[stack](target, tools);
  }
  if (checker.buildCommands !== undefined) {
    // 检查器按栈分派命令，但探测不到技术栈：不能静默退回 JS（会拿 depcruise 去跑 Python 项目）。
    throw new Error(
      `检查器「${checker.id}」需要技术栈（${Object.keys(checker.buildCommands).join(' / ')}），`
      + '但工作目录探测不到；先把工作目录指到项目根（pyproject.toml / package.json）',
    );
  }
  if (typeof checker.buildCommand !== 'function') {
    throw new Error(`检查器「${checker.id}」既没有 script 也没有 buildCommand`);
  }
  return checker.buildCommand(target);
}

/**
 * 确保 Python 三件套可用：先探测，缺了就离线装一次。
 * 兜底「官方商店用 --ignore-scripts 装包、postinstall 没跑」的情况。
 */
function ensurePythonTools(python: string, packageRoot: string): boolean {
  const probe = spawnSync(python, ['-c', 'import pytest, importlinter, vulture'], { stdio: 'ignore' });
  if (probe.status === 0) return true;
  const wheelsDir = join(packageRoot, 'python-wheels');
  if (!existsSync(wheelsDir)) return false;
  const install = spawnSync(
    python,
    ['-m', 'pip', 'install', '--no-index', '--find-links', wheelsDir, 'pytest', 'pytest-json-report', 'import-linter', 'vulture'],
    { stdio: 'ignore' },
  );
  if (install.status !== 0) return false;
  return spawnSync(python, ['-c', 'import pytest, importlinter, vulture'], { stdio: 'ignore' }).status === 0;
}

/**
 * 按技术栈定位取证工具：python → DSH 自带 Python + 它的 lint-imports console script。
 * 返回 null = 关键工具没找到（调用方报「工具缺失」并降级）。
 */
async function resolveToolsFor(
  stack: string | null,
  projectRoot: string | undefined,
  packageRoot?: string,
  ensure: (python: string, packageRoot: string) => boolean = ensurePythonTools,
): Promise<any | null> {
  if (stack === 'python') {
    const python = await resolvePython();
    // 项目自己的 venv 有项目依赖（pytest 跑测试用它）；DSH Python 只有插件工具。
    const projectPython = await resolveProjectPython(projectRoot ?? '');
    if (python === null && projectPython === null) return null;
    const toolPython = python ?? projectPython;
    if (!ensure(toolPython, packageRoot ?? '')) return null;
    return {
      python: toolPython,
      projectPython: projectPython ?? undefined,
      lintImports: lintImportsPath(toolPython),
    };
  }
  return {};
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
  const requestedStack = args?.stack === 'js' || args?.stack === 'python' ? args.stack : null;
  const requestedProject = typeof args?.project === 'string' && args.project.trim() !== '' ? args.project.trim() : null;

  // 1. 确定要测的项目根：AI 指定了就用它，否则从「改动范围」推断（范围里每一条向上找 marker）。
  let projects: ProjectRef[];
  let candidates: string[] = [];
  if (requestedProject !== null) {
    const picked = await nearestProject(resolve(workingDirectory, requestedProject));
    projects = picked !== null ? [picked] : [];
    if (projects.length === 0) candidates = await listCandidateProjects(workingDirectory);
  } else {
    const scopeInfo = await deps.repository.getChecklistScope?.(found.workflowId, found.nodeId);
    const resolution = await resolveProjects(workingDirectory, scopeInfo?.scope ?? []);
    projects = resolution.projects;
    candidates = resolution.candidates;
  }

  // 2. 一个都找不到：返回候选目录，让 AI 用选择框让用户挑，再带 project 参数重跑。
  if (projects.length === 0) {
    const problem = candidates.length > 0
      ? '找不到项目根：用选择框让用户从候选目录里挑一个，再带 project 参数重跑 `check_*`'
      : '找不到项目根：工作目录及上层没有 pyproject.toml / package.json，也没有带 marker 的一级子目录；先把工作目录指到项目根';
    await deps.repository.recordCheckerRun?.({
      workflowId: found.workflowId,
      nodeId: found.nodeId,
      checkerId: checker.id,
      ok: false,
      findings: 1,
      exit_code: null,
      evidence: `.workflow/evidence/${checker.evidence}`,
    });
    logEvent(deps.logger, 'warn', `[workflow] checker project not found (session=${sessionId}, checker=${checker.id}, candidates=${candidates.length})`);
    return {
      ok: false,
      checker: checker.id,
      project_candidates: candidates,
      command: null,
      exit_code: null,
      timed_out: false,
      findings: [{ location: checker.evidence, problem }],
      stats: {},
    };
  }

  // 3. 逐个项目跑：各自的项目根 + 各自的技术栈（多项目语言可以不同）。
  const perProject: Array<{ root: string; stack: string | null; result: any }> = [];
  for (const project of projects) {
    const stack = requestedStack ?? project.stack;
    const result = await runCheckerInProject(deps, checker, args, target, project.root, stack);
    perProject.push({ root: project.root, stack, result });
  }

  // 4. 合并：ok 全过才算过；findings 带项目前缀；stats 求和 + per_project 明细（不求和掩盖）。
  const multi = perProject.length > 1;
  const ok = perProject.every((item) => item.result.ok);
  const findings = perProject.flatMap((item) => {
    const label = relative(workingDirectory, item.root) || '.';
    const prefix = multi ? `[${label}] ` : '';
    return item.result.findings.map((finding: any) => ({
      location: `${prefix}${finding.location}`,
      problem: finding.problem,
    }));
  });
  const stats: Record<string, number> = { projects: perProject.length };
  for (const item of perProject) {
    for (const [key, value] of Object.entries(item.result.stats ?? {})) {
      stats[key] = (stats[key] ?? 0) + Number(value);
    }
  }
  const per_project = perProject.map((item) => ({
    root: relative(workingDirectory, item.root) || '.',
    stack: item.stack,
    ok: item.result.ok,
    stats: item.result.stats,
  }));
  const notes = perProject
    .map((item) => item.result.note)
    .filter((note) => typeof note === 'string' && note !== '');

  // 5. 会话证据（报备锚点要指它）：单项目且项目根=工作目录时，原证据就在那；
  //    否则写一份合并记录，保证 `.workflow/evidence/<file>` 存在、审计能看到每个项目。
  const sameAsWorking = perProject.length === 1 && perProject[0] !== undefined
    && perProject[0].root === resolve(workingDirectory);
  if (!sameAsWorking) {
    const recordPath = join(workingDirectory, '.workflow', 'evidence', checker.evidence);
    await ensureWorkflowDir(join(workingDirectory, '.workflow'));
    await mkdir(dirname(recordPath), { recursive: true });
    await writeFile(
      recordPath,
      JSON.stringify({ checker: checker.id, ok, findings, per_project, stats }, null, 2),
      'utf8',
    ).catch(() => {});
  }

  // 6. 记录 + 返回。
  try {
    await deps.repository.recordCheckerRun?.({
      workflowId: found.workflowId,
      nodeId: found.nodeId,
      checkerId: checker.id,
      ok,
      findings: findings.length,
      exit_code: perProject[0]?.result.exit_code ?? null,
      evidence: `.workflow/evidence/${checker.evidence}`,
    });
  } catch (error) {
    logEvent(
      deps.logger,
      'warn',
      `[workflow] checker run record failed (session=${sessionId}, checker=${checker.id}): ${String((error as Error)?.message ?? error)}`,
    );
  }

  logEvent(
    deps.logger,
    'info',
    `[workflow] checker run (session=${sessionId}, tool=${entry.name}, checker=${checker.id}, `
    + `projects=${perProject.length}, stacks=${perProject.map((item) => item.stack).join(',')}, `
    + `ok=${String(ok)}, findings=${findings.length})`,
  );
  return {
    ok,
    checker: checker.id,
    command: perProject.length === 1 ? perProject[0].result.command : null,
    exit_code: perProject[0]?.result.exit_code ?? null,
    timed_out: perProject.some((item) => item.result.timed_out === true),
    findings,
    stats,
    per_project,
    ...(notes.length > 0 ? { notes } : {}),
  };
}

/**
 * 确保 `.workflow` 目录存在，并在里面放一个忽略一切的 `.gitignore`。
 * 证据（build.json / contract.json 等）不该被提交进项目仓库；放这儿比改项目根的 .gitignore 侵入性小。
 */
async function ensureWorkflowDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const ignore = join(dir, '.gitignore');
  if (!existsSync(ignore)) {
    await writeFile(ignore, '*\n!.gitignore\n', 'utf8').catch(() => {});
  }
}

/**
 * 在单个项目根里跑一个检查器：缺配置 / 缺工具 / 命令 / 证据 / 判定，都收在这一层。
 * 返回的 findings 不带项目前缀（合并时由 invokeChecker 加）。
 */
async function runCheckerInProject(
  deps: WorkflowToolsDeps,
  checker: any,
  args: any,
  target: string,
  projectRoot: string,
  stack: string | null,
): Promise<any> {
  // deps + python：import-linter 必须先有 [tool.importlinter] 契约，否则 lint-imports 只会报「没契约」或空输出。
  if (checker.id === 'deps' && stack === 'python') {
    const pyproject = join(projectRoot, 'pyproject.toml');
    const text = existsSync(pyproject) ? await readFile(pyproject, 'utf8').catch(() => '') : '';
    if (!text.includes('[tool.importlinter]')) {
      const problem = text === ''
        ? `缺 pyproject.toml：[tool.importlinter] 契约通常写在 pyproject.toml 里，但 ${pyproject} 不存在或读不到；确认项目用的是别的 import-linter 配置文件；这一项可降级为 AI 证据`
        : '缺 [tool.importlinter] 契约配置：请在 pyproject.toml 里声明架构契约（layers / forbidden 等），否则 lint-imports 无法判依赖；这一项可降级为 AI 证据';
      return {
        ok: false,
        command: null,
        exit_code: null,
        timed_out: false,
        findings: [{ location: pyproject, problem }],
        stats: {},
      };
    }
  }

  const tools = await resolveToolsFor(stack, projectRoot, deps.packageRoot, deps.ensurePythonTools ?? ensurePythonTools);
  if (tools === null) {
    return {
      ok: false,
      command: null,
      exit_code: null,
      timed_out: false,
      findings: [{ location: checker.evidence, problem: '工具缺失：DSH Python 没找到（先装/配置好再重试；这一项可降级为 AI 证据）' }],
      stats: {},
    };
  }

  const command = commandForChecker(checker, target, stack, tools, deps.packageRoot);
  const evidencePath = join(projectRoot, '.workflow', 'evidence', checker.evidence);
  await ensureWorkflowDir(join(projectRoot, '.workflow'));
  await mkdir(dirname(evidencePath), { recursive: true });

  let commandResult: { ok: boolean; exit_code: number | null; timed_out: boolean; ms: number; tail: string } | null = null;
  if (checker.autoRun) {
    const execute = deps.runCommand ?? runCommand;
    commandResult = await execute({ cwd: projectRoot, command, binDir: deps.nodeModulesBin });
  }

  const normalizer = typeof stack === 'string' && stack !== ''
    && typeof checker.normalizers?.[stack] === 'function'
    ? checker.normalizers[stack]
    : null;
  let evidenceJson: unknown = null;
  let parseError = '';
  try {
    const rawText = await readFile(evidencePath, 'utf8');
    evidenceJson = normalizer !== null ? normalizer(rawText) : JSON.parse(rawText);
    // 有归一化器（Python 栈）：原始产物归档到 <file>.raw，判据形状写回 <file>，
    // 让证据文件本身是合法 JSON、可直接复用；.raw 留作人肉排查。
    // JS 栈的产物本身就是判据形状，不拆。
    if (normalizer !== null) {
      try {
        await writeFile(`${evidencePath}.raw`, rawText, 'utf8');
        await writeFile(evidencePath, `${JSON.stringify(evidenceJson, null, 2)}\n`, 'utf8');
      } catch {
        // 归档失败不阻断判定：内存里的 evidenceJson 已可用。
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') parseError = String((error as Error)?.message ?? error);
  }

  let result = parseError === ''
    ? checker.check(evidenceJson)
    : {
      ok: false,
      findings: [{ location: checker.evidence, problem: `证据文件解析失败：${parseError}` }],
      stats: {},
    };

  // 命令失败 + 判据说「没违规」= 工具没产出有效证据（不是真的零违规），判不合格。
  if (commandResult !== null && commandResult.ok !== true && result.ok === true) {
    result = {
      ok: false,
      findings: [
        ...result.findings,
        {
          location: checker.evidence,
          problem: `取证命令失败（exit=${commandResult.exit_code ?? '?'}）且没判出不合格项：证据可能没生成，不能当「零违规」`,
        },
      ],
      stats: result.stats,
    };
  }

  return {
    ok: result.ok,
    command: checker.autoRun ? command : null,
    exit_code: commandResult?.exit_code ?? null,
    timed_out: commandResult?.timed_out ?? false,
    findings: result.findings,
    stats: result.stats,
    ...(typeof result.note === 'string' && result.note !== '' ? { note: result.note } : {}),
    ...(commandResult !== null && commandResult.ok !== true ? { command_output: commandResult.tail.slice(-800) } : {}),
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
  // —— 实现中追加范围（append-only + 留痕）：被范围门禁拦时的低成本修正，不必返工回讨论中 ——
  if (action === 'extend_scope') {
    if (target !== 'session') {
      throw new Error('extend_scope 只对会话手册（target=session）可用');
    }
    if (deps.getState(sessionId) === undefined) await deps.refreshState?.(sessionId);
    const state = deps.getState(sessionId);
    if (state !== 'implementing') {
      throw new Error('「范围追加」只在「实现中」可用：讨论中请直接改实施顺序的「｜ 范围：」，验收 / 已完结没有范围拦截');
    }
    const paths = Array.isArray(args?.paths) ? args.paths : [];
    const result = await deps.repository.extendSessionScope({
      workflowId: found.workflowId,
      nodeId: found.nodeId,
      paths,
      reason: String(args?.reason ?? ''),
    });
    logEvent(deps.logger, 'info', `[workflow] scope extended (session=${sessionId}, appended=${result.appended.length})`);
    await deps.refreshScope?.(sessionId);
    return { ok: true, scope: result.scope, appended: result.appended };
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
    throw new Error('action 只能是 read / replace_section / extend_scope / append_entry / update_entry / remove_entry / rename_tag');
  }
  const section = String(args?.section ?? '').trim();
  const writable = WRITABLE_SECTIONS[target];
  if (!writable.includes(section)) {
    throw new Error(`「${target}」手册只能改这些小节：${writable.join(' / ')}；${section === '实施顺序' ? '清单请用 workflow_check 勾选。' : ''}`);
  }
  if (typeof args?.content !== 'string' || args.content.trim() === '') throw new Error('content 不能为空');
  // 「方案」「实施顺序」都只在讨论中定义；进入实现中之后方案锁定、清单只能勾选。
  if (target === 'session' && (section === '实施顺序' || section === '方案')) {
    // 状态表可能还没回填（认领早于绑节点）：先补一次，否则"讨论中"会被误判。
    if (deps.getState(sessionId) === undefined) await deps.refreshState?.(sessionId);
    const state = deps.getState(sessionId);
    if (state === undefined) {
      throw new Error('读不到这个会话的工作流状态（可能还没绑定 workflow 节点）：先让宿主完成认领，再写入。');
    }
    if (state !== 'discussing') {
      throw new Error(
        section === '实施顺序'
          ? '「实施顺序」只能在「讨论中」定义；进入实现中之后请用 workflow_check 逐条勾选，不要改写条目。'
          : '「方案」只能在「讨论中」定义；进入实现中之后方案已锁定，要改请先返工回「讨论中」（workflow_advance to: discussing，带 reason）。',
      );
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
/** 按清单条目 label 找小验收门禁：label 以层名开头（如「接口层 —— 完成标准：…」）。 */
function layerGateFor(label: string): { checker: string; require_run: boolean } | null {
  for (const [layer, gate] of Object.entries(LAYER_GATES)) {
    if (label.startsWith(layer)) return gate;
  }
  return null;
}

async function invokeCheck(deps: WorkflowToolsDeps, sessionId: string, args: any): Promise<any> {
  const state = deps.getState(sessionId);
  if (state === undefined) await deps.refreshState?.(sessionId);
  const stateNow = deps.getState(sessionId);
  if (stateNow === 'discussing') throw new Error('「讨论中」还不勾清单：先把方案写进会话手册，推进到「实现中」再勾。');
  const found = await deps.repository.findBySession(sessionId);
  if (found === null) throw new Error('当前会话还没有 workflow 节点');
  const label = String(args?.item ?? '').trim();
  if (label === '') throw new Error('item 不能为空');
  // 小验收门禁：hard-to-reverse 的层勾选前必须真跑过对应检查器（结果不卡，只查跑没跑）。
  if (args?.done === true) {
    const gate = layerGateFor(label);
    if (gate !== null && gate.require_run && gate.checker !== '') {
      const verification = await deps.repository.getVerification(found.workflowId, found.nodeId);
      const runs = verification.checker_runs.filter((run) => run.checker_id === gate.checker);
      if (runs.length === 0) {
        throw new Error(`勾选「${label}」前必须先真跑过 check_${gate.checker}（小验收门禁：这一层做完再改贵，得先机器验过）`);
      }
    }
  }
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
  // 至少跑一次门禁：协助型但要求「本轮至少跑过一次」的项（第 6 项埋点检测），
  // 只查有没有真调用记录，不卡 ok——结果仍由 AI 判断。扫描是唯一确定性证据，不拦就白设计了。
  const checkerMeta = check.checker;
  if (checkerMeta?.require_run === true && report.result === 'pass') {
    const verification = await deps.repository.getVerification(found.workflowId, found.nodeId);
    const runs = verification.checker_runs.filter((run) => run.checker_id === checkerMeta.id);
    if (runs.length === 0) {
      const toolName = `check_${checkerMeta.id}`;
      throw new Error(
        `「${check.name}」报 pass 前本轮至少要跑过一次 ${toolName}（先真跑一次检查器）；没跑就声称到位不算数（至少跑一次门禁）`,
      );
    }
  }
  // 强制使用门禁 + 强制提交工具输出：required 型检查器报 pass 前，必须真跑过对应 check_* 且提交真实输出。
  // 无机器驱动（非 JS/Python/Go 或该栈无对应命令）时降级为 AI 证据，跳过这条强制。
  const requiredChecker = checkerMeta?.enforcement === 'required' ? findChecker(checkerMeta.id) : undefined;
  const requiredSnapshot = requiredChecker !== undefined ? await deps.repository.get(found.workflowId) : null;
  const requiredDetection = requiredChecker !== undefined ? await detectStack(requiredSnapshot?.working_directory) : null;
  const requiredStack = requiredDetection?.stack ?? null;
  if (checkerMeta?.enforcement === 'required' && report.result === 'pass'
    && requiredChecker !== undefined && hasMachineDriver(requiredChecker, requiredStack)) {
    const verification = await deps.repository.getVerification(found.workflowId, found.nodeId);
    const toolName = `check_${checkerMeta.id}`;
    const runs = verification.checker_runs.filter((run) => run.checker_id === checkerMeta.id);
    const latest = runs.length > 0 ? runs[runs.length - 1] : undefined;
    if (latest === undefined) {
      throw new Error(
        `「${check.name}」报 pass 前必须先真的跑过 ${toolName}（用 workflow_tool_call 调用），不是只在报备里填 checker 结果（强制使用门禁）`,
      );
    }
    const submitted = report.checker;
    const okMatch = submitted?.ok === latest.ok;
    const findingsMatch = submitted?.findings === latest.findings;
    const submittedExit = submitted?.exit_code ?? null;
    const exitMatch = submittedExit === null || submittedExit === latest.exit_code;
    if (!okMatch || !findingsMatch || !exitMatch) {
      throw new Error(
        `提交的 checker 与 ${toolName} 的真实输出不一致（强制提交工具输出）：最近一次是 ok=${latest.ok}、findings=${latest.findings}、exit=${latest.exit_code ?? 'n/a'}，请以工具返回为准`,
      );
    }
    // 锚点归属：报备至少要有一条锚点指着本次检查器生成的证据文件，防止「跑了 check_contract、锚点却挂别的文件」。
    const evidence = latest.evidence;
    if (typeof evidence === 'string' && evidence !== '') {
      const normalize = (file: string): string => file.replace(/\\/g, '/').replace(/^\.\//, '');
      const target = normalize(evidence);
      const hasEvidenceAnchor = report.anchors.some((anchor) => normalize(anchor.file) === target);
      if (!hasEvidenceAnchor) {
        throw new Error(
          `报备锚点必须包含本次 ${toolName} 生成的证据文件「${evidence}」（强制锚点归属）：不要把检查器结果挂在别的文件上`,
        );
      }
    }
  }
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
  // 徽标上的 n/8 变了：推一次，别让页面等刷新才看见勾。
  deps.notify?.(sessionId, 'verify');
  // 第 8 项「收尾」报 pass 且八项全非 ○ → 自动推进到已完结（不再走 workflow_advance 的人工同意）。
  if (itemId === 8 && report.result === 'pass' && progress.complete) {
    await deps.repository.transitionNode({ id: found.workflowId, nodeId: found.nodeId, to: 'completed' });
    logEvent(deps.logger, 'info', `[workflow] auto completed (session=${sessionId}, round=${state.round})`);
    deps.notify?.(sessionId, 'advance');
  }
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
  if (!deps.isPresetSession(sessionId)) throw new Error('这个工具只对「门禁工作流模式」预设的会话可用');
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
    // 跨态失效：required 型检查器跑完后源码又有改动，证据就过期了，必须重跑再报备。
    await repository.assertVerificationFresh(found.workflowId, found.nodeId);
  }
}
