/**
 * 工具治理的纯规则层：目录合并与过滤、调用判定、登记校验、参数摘要。
 *
 * 这一层不读盘、不碰 DOM、不写日志——网关与测试都只依赖这些函数，
 * 规则改了先在这里失败，而不是等真机调用才发现。
 *
 * 2026-11-13 起工具分两类：基础工具（代码定义，5 个）与扩展工具（登记而来，执行体只能是脚本）。
 * 两类同型 ToolEntry，靠 kind 区分；分类名只读 TOOL_KIND_LABEL，本文件不写死字面量。
 */
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import {
  ALL_STATES,
  BASE_TOOLS,
  EXTENSION_TOOLS,
  TOOL_KIND,
  TOOL_KIND_LABEL,
  type ToolEffect,
  type ToolEntry,
  type ToolKind,
  type ToolParameterSchema,
  type ToolRun,
  type ToolState,
  type ToolValueSchema,
} from '../schema/tool-catalog';
import { CHECKER_IDS } from './checkers';

/** 每类工具的条数上限：只卡「验收中」这一档，两类各自独立计数。 */
export const TOOL_LIMIT_BY_KIND: Record<ToolKind, number> = {
  base: 6,
  extension: 8,
};

/** 出厂工具名（基础 + 扩展）：登记工具不能重名（挡住"覆盖出厂工具"这条路）。 */
export const FACTORY_TOOL_NAMES: string[] = [...BASE_TOOLS, ...EXTENSION_TOOLS].map((entry) => entry.name);

/** 完整出厂目录：5 个基础工具 + 5 个扩展工具，不读盘。 */
export const FACTORY_TOOLS: ToolEntry[] = [...BASE_TOOLS, ...EXTENSION_TOOLS];

const EFFECTS: ToolEffect[] = ['read-state', 'write-state', 'exec'];

/** 扩展工具不声明参数时的默认 schema：收任何参数，不校验。 */
const LOOSE_PARAMETERS: ToolParameterSchema = { type: 'object', properties: {}, additionalProperties: true };

export type DenyCode =
  | 'unknown-tool'
  | 'stage-denied'
  | 'arguments-invalid'
  | 'name-invalid'
  | 'name-duplicate'
  | 'description-invalid'
  | 'sample-args-invalid'
  | 'states-invalid'
  | 'run-invalid'
  | 'effect-invalid'
  | 'script-invalid'
  | 'quota-exceeded';

export type ToolDecision = { allow: true } | { allow: false; code: DenyCode; message: string };

export type RegistrationValidation =
  | { ok: true; entry: ToolEntry }
  | { ok: false; code: DenyCode; message: string };

function deny(code: DenyCode, message: string): ToolDecision {
  return { allow: false, code, message };
}

function fail(code: DenyCode, message: string): RegistrationValidation {
  return { ok: false, code, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stateLabel(state: string): string {
  return NODE_STATE_LABEL[state as keyof typeof NODE_STATE_LABEL] ?? state;
}

function statesText(states: ToolState[]): string {
  return states.map(stateLabel).join(' / ');
}

/** 内置 + 登记 = 完整目录；与基础工具同名的登记条目直接丢掉（登记时已挡，这里兜底）。 */
export function mergeCatalog(base: ToolEntry[], registered: ToolEntry[]): ToolEntry[] {
  const taken = new Set(base.map((entry) => entry.name));
  const merged: ToolEntry[] = [...base];
  for (const entry of registered) {
    if (taken.has(entry.name)) continue;
    taken.add(entry.name);
    merged.push(entry);
  }
  return merged;
}

/** 当前状态能看到的工具：目录按 allowed_states 过滤，不做任何分组。 */
export function visibleTools(entries: ToolEntry[], state: string): ToolEntry[] {
  return entries.filter((entry) => entry.allowed_states.includes(state as ToolState));
}

/** 按 kind 统计某状态下的可见条数：两类配额各自独立，就是靠这个计数。 */
export function countVisibleByKind(entries: ToolEntry[], state: string): Record<ToolKind, number> {
  const counts: Record<ToolKind, number> = { base: 0, extension: 0 };
  for (const entry of visibleTools(entries, state)) {
    if (entry.kind === TOOL_KIND.base) counts.base += 1;
    else counts.extension += 1;
  }
  return counts;
}

/** 值校验：返回错误描述；通过返回 undefined。 */
function validateValue(schema: ToolValueSchema, value: unknown, path: string): string | undefined {
  if (schema.anyOf !== undefined) {
    const problems: string[] = [];
    for (const option of schema.anyOf) {
      const problem = validateValue(option, value, path);
      if (problem === undefined) return undefined;
      problems.push(problem);
    }
    return problems[0] ?? `${path} 不匹配任何允许的类型`;
  }
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') return `${path} 应为字符串`;
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${path} 应为数字`;
      break;
    case 'boolean':
      if (typeof value !== 'boolean') return `${path} 应为布尔值`;
      break;
    case 'array':
      if (!Array.isArray(value)) return `${path} 应为数组`;
      if (schema.items !== undefined) {
        for (let index = 0; index < value.length; index += 1) {
          const problem = validateValue(schema.items, value[index], `${path}[${index}]`);
          if (problem !== undefined) return problem;
        }
      }
      break;
    case 'object': {
      if (!isPlainObject(value)) return `${path} 应为对象`;
      const properties = schema.properties ?? {};
      for (const key of schema.required ?? []) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) return `${path}.${key} 缺失（必填）`;
      }
      for (const [key, item] of Object.entries(value)) {
        const property = properties[key];
        if (property === undefined) {
          if (schema.additionalProperties === false) return `${path}.${key} 不是可接受的参数`;
          continue;
        }
        const problem = validateValue(property, item, `${path}.${key}`);
        if (problem !== undefined) return problem;
      }
      break;
    }
    default:
      return `${path} 的 schema 类型未知`;
  }
  if (schema.enum !== undefined && !schema.enum.includes(String(value))) {
    return `${path} 只能是 ${schema.enum.join(' / ')}`;
  }
  return undefined;
}

/** 参数校验：args 必须是对象，且满足工具声明的 schema。 */
function validateToolArgs(schema: ToolParameterSchema, args: unknown): string | undefined {
  if (!isPlainObject(args)) return 'args 必须是对象';
  return validateValue({ ...schema, type: 'object' }, args, 'args');
}

/** 网关调用前的唯一判定点：阶段 → 参数。 */
export function decideToolCall(input: { state: string; entry: ToolEntry; args: unknown }): ToolDecision {
  const { entry } = input;
  if (!entry.allowed_states.includes(input.state as ToolState)) {
    return deny(
      'stage-denied',
      `当前状态「${stateLabel(input.state)}」不允许调用 ${entry.name}（允许：${statesText(entry.allowed_states)}）。`,
    );
  }
  const args = input.args === undefined || input.args === null ? {} : input.args;
  if (!isPlainObject(args)) return deny('arguments-invalid', `${entry.name} 的 args 必须是对象。`);
  const problem = validateToolArgs(entry.parameters, args);
  if (problem !== undefined) return deny('arguments-invalid', `${entry.name} 参数不符：${problem}。`);
  return { allow: true };
}

/** 参数摘要进审计账：截断 + 去掉换行，避免一条日志占满整个事件环。 */
export function summarizeArgs(args: unknown, maxChars = 240): string {
  let text: string;
  try {
    text = JSON.stringify(args ?? {});
  } catch {
    text = '[unserializable]';
  }
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > maxChars ? `${flat.slice(0, maxChars)}…` : flat;
}

/** 执行方式收窄：扩展工具只能指向一个已登记的检查器。 */
function parseRun(raw: unknown): { run: ToolRun } | { problem: string; code: DenyCode } {
  if (!isPlainObject(raw)) {
    return { problem: 'run 必须是对象：{kind:"checker", checker:"deps"}', code: 'run-invalid' };
  }
  if (raw.kind !== 'checker') {
    return { problem: 'run.kind 只能是 checker：扩展工具必须指向一个内置检查器，不能是脚本', code: 'run-invalid' };
  }
  const checker = typeof raw.checker === 'string' ? raw.checker.trim() : '';
  if (checker === '') return { problem: 'run.checker 不能为空', code: 'run-invalid' };
  if (!CHECKER_IDS.includes(checker)) {
    return { problem: `没有叫「${checker}」的检查器：可用的是 ${CHECKER_IDS.join(' / ')}`, code: 'run-invalid' };
  }
  return { run: { kind: 'checker', checker } };
}

/**
 * 登记校验：新增与更新共用，产物一律是扩展工具。
 *
 * 和调用的区别：登记是「造工具」，所以校验 run / effect / 配额 / 样例参数；
 * 调用只校验「这个状态能不能用、参数对不对」。
 *
 * parameters：基础工具必填，扩展工具可选（不传就是宽松 schema）。
 * 配额：只卡验收中，且按 kind 分别计数——两类工具各自的上限互不挤占。
 */
export function validateToolRegistration(input: {
  name: unknown;
  description: unknown;
  run: unknown;
  effect: unknown;
  allowedStates: unknown;
  parameters: unknown;
  parametersGiven: boolean;
  sampleArgs: unknown;
  existingNames: string[];
  verifyingCounts: Record<ToolKind, number>;
  mode: 'create' | 'update';
}): RegistrationValidation {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(name)) {
    return fail('name-invalid', '工具名必须是 3~41 位小写字母/数字/下划线，且以字母开头（例：check_deps）。');
  }
  if (input.existingNames.includes(name)) {
    return fail('name-duplicate', `已经有叫「${name}」的工具：换一个名字，或走更新（update）。`);
  }
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description === '' || Array.from(description).length > 400) {
    return fail('description-invalid', '描述不能为空，且不超过 400 字：第一句要能独立说明什么时候用它。');
  }

  const parsedRun = parseRun(input.run);
  if ('problem' in parsedRun) return fail(parsedRun.code, parsedRun.problem);
  const run = parsedRun.run;

  const effect = typeof input.effect === 'string' && EFFECTS.includes(input.effect as ToolEffect)
    ? (input.effect as ToolEffect)
    : null;
  if (effect === null) return fail('effect-invalid', `effect 只能是：${EFFECTS.join(' / ')}。`);

  const rawStates = input.allowedStates;
  if (!Array.isArray(rawStates) || rawStates.length === 0) {
    return fail('states-invalid', 'allowed_states 必须是非空数组：写清这个工具在哪些阶段能用。');
  }
  const states: ToolState[] = [];
  for (const candidate of rawStates) {
    if (typeof candidate !== 'string' || !ALL_STATES.includes(candidate as ToolState)) {
      return fail('states-invalid', `allowed_states 里有未知状态：${String(candidate)}。`);
    }
    if (!states.includes(candidate as ToolState)) states.push(candidate as ToolState);
  }

  // 参数 schema：扩展工具可不传，不传就是宽松 schema（脚本本来不收调用参数）。
  let parameters: ToolParameterSchema = LOOSE_PARAMETERS;
  if (input.parametersGiven) {
    if (!isPlainObject(input.parameters)) return fail('arguments-invalid', 'parameters 必须是 JSON Schema 对象。');
    parameters = input.parameters as unknown as ToolParameterSchema;
  }

  if (input.sampleArgs === undefined || input.sampleArgs === null) {
    return fail('sample-args-invalid', 'sample_args 必填：给一个能跑通的示例参数，登记时会用它校验。');
  }
  if (!isPlainObject(input.sampleArgs)) return fail('sample-args-invalid', 'sample_args 必须是对象。');
  const sampleProblem = validateToolArgs(parameters, input.sampleArgs);
  if (sampleProblem !== undefined) {
    return fail('sample-args-invalid', `sample_args 不满足参数要求：${sampleProblem}。`);
  }

  // 配额：只卡验收中，且按 kind 分别计数。
  const kind = TOOL_KIND.extension;
  if (input.mode === 'create' && states.includes('verifying')
    && input.verifyingCounts[kind] >= TOOL_LIMIT_BY_KIND[kind]) {
    return fail(
      'quota-exceeded',
      `「验收中」可见的${TOOL_KIND_LABEL[kind]}已达上限 ${TOOL_LIMIT_BY_KIND[kind]} 条，不能再登记新的；`
      + `先让已有工具缩小 allowed_states（${TOOL_KIND_LABEL.base}另有独立的 ${TOOL_LIMIT_BY_KIND.base} 条上限）。`,
    );
  }

  return {
    ok: true,
    entry: {
      name,
      description,
      kind,
      run,
      allowed_states: states,
      effect,
      parameters,
    },
  };
}

/** 描述第一句：注入只留这一句，长描述留给设置页。 */
export function summarizeDescription(description: string, maxChars = 90): string {
  const firstSentence = description.split('。')[0]?.trim() ?? '';
  const text = firstSentence === '' ? description.trim() : `${firstSentence}。`;
  return Array.from(text).length > maxChars ? `${Array.from(text).slice(0, maxChars).join('')}…` : text;
}

/**
 * 注入给模型的目录文本：当前状态能看到的工具，一张表，不分段、不标类别。
 * 名字 + 可用阶段 + 必填参数 + 一句话说明。
 */
export function renderCatalogText(entries: ToolEntry[], state: string): string {
  const lines = [
    '【工具目录】模型只能通过 workflow_tool_call({name,args}) 调用下列工具；'
    + '新增工具用 workflow_tool_add（登记与更新都要用户同意后才生效）。',
  ];
  for (const entry of visibleTools(entries, state)) {
    const required = entry.parameters.required ?? [];
    const requiredText = required.length > 0 ? `必填：${required.join(',')}` : '无必填参数';
    lines.push(`- ${entry.name}（${statesText(entry.allowed_states)}可用；${requiredText}）${summarizeDescription(entry.description)}`);
  }
  return lines.join('\n');
}
