/**
 * 工具治理的纯规则层：目录合并、调用判定、别名校验、参数合并与摘要。
 *
 * 这一层不读盘、不碰 DOM、不写日志——网关与测试都只依赖这些函数，
 * 规则改了先在这里失败，而不是等真机调用才发现。
 */
import { NODE_STATE_LABEL } from '../schema/node-state-label';
import {
  ALL_STATES,
  BASE_TOOL_NAMES,
  BASE_TOOLS,
  type ToolAliasEntry,
  type ToolCatalogEntry,
  type ToolParameterSchema,
  type ToolState,
  type ToolValueSchema,
} from '../schema/tool-catalog';

export type DenyCode =
  | 'unknown-tool'
  | 'stage-denied'
  | 'arguments-invalid'
  | 'arguments-override'
  | 'base-tool-invalid'
  | 'name-invalid'
  | 'name-duplicate'
  | 'description-invalid'
  | 'fixed-args-invalid'
  | 'sample-args-invalid'
  | 'states-invalid';

export type ToolDecision = { allow: true } | { allow: false; code: DenyCode; message: string };

export type AliasValidation =
  | { ok: true; parameters: ToolParameterSchema; allowedStates: ToolState[] }
  | { ok: false; code: DenyCode; message: string };

const BASE_TOOLS_BY_NAME = new Map(BASE_TOOLS.map((entry) => [entry.name, entry]));

function deny(code: DenyCode, message: string): ToolDecision {
  return { allow: false, code, message };
}

function fail(code: DenyCode, message: string): AliasValidation {
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

function cloneSchema(schema: ToolValueSchema): ToolValueSchema {
  const cloned: ToolValueSchema = { type: schema.type };
  if (schema.description !== undefined) cloned.description = schema.description;
  if (schema.enum !== undefined) cloned.enum = [...schema.enum];
  if (schema.anyOf !== undefined) cloned.anyOf = schema.anyOf.map(cloneSchema);
  if (schema.items !== undefined) cloned.items = cloneSchema(schema.items);
  if (schema.properties !== undefined) {
    cloned.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) cloned.properties[key] = cloneSchema(value);
  }
  if (schema.required !== undefined) cloned.required = [...schema.required];
  if (schema.additionalProperties !== undefined) cloned.additionalProperties = schema.additionalProperties;
  return cloned;
}

/**
 * 别名可见的参数 = 基础参数去掉固定键。
 * 固定键从 properties 里整个删掉：调用时传了它会被 additionalProperties=false 挡下，
 * 同时 decideToolCall 还会先给一个更明确的 arguments-override。
 */
export function deriveAliasParameters(base: ToolParameterSchema, fixedArgs: Record<string, unknown>): ToolParameterSchema {
  const fixedKeys = new Set(Object.keys(fixedArgs));
  const properties: Record<string, ToolValueSchema> = {};
  for (const [key, value] of Object.entries(base.properties)) {
    if (!fixedKeys.has(key)) properties[key] = cloneSchema(value);
  }
  const required = (base.required ?? []).filter((key) => !fixedKeys.has(key));
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: base.additionalProperties === true,
  };
}

/** 基础目录 + 本工作区别名 = 模型这次能看到的目录；基础工具不存在的脏别名直接丢弃。 */
export function mergeCatalog(base: ToolCatalogEntry[], aliases: ToolAliasEntry[]): ToolCatalogEntry[] {
  const baseByName = new Map(base.map((entry) => [entry.name, entry]));
  const merged: ToolCatalogEntry[] = [...base];
  for (const alias of aliases) {
    const baseEntry = baseByName.get(alias.base_tool);
    if (baseEntry === undefined) continue;
    const fixed = isPlainObject(alias.fixed_args) ? alias.fixed_args : {};
    const allowedStates = alias.allowed_states.filter((state) => ALL_STATES.includes(state));
    merged.push({
      name: alias.name,
      summary: alias.description,
      description: alias.description,
      base_tool: baseEntry.name,
      fixed_args: fixed,
      parameters: deriveAliasParameters(baseEntry.parameters, fixed),
      allowed_states: allowedStates.length > 0 ? allowedStates : [...baseEntry.allowed_states],
      side_effect: baseEntry.side_effect,
      alias: true,
      version: alias.version,
      created_at: alias.created_at,
    });
  }
  return merged;
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

/** 参数校验：args 必须是对象，且满足目录条目的 schema。 */
function validateToolArgs(schema: ToolParameterSchema, args: unknown): string | undefined {
  if (!isPlainObject(args)) return 'args 必须是对象';
  return validateValue({ ...schema, type: 'object' }, args, 'args');
}

/** 网关调用前的唯一判定点：阶段 → 固定值覆盖 → 参数。 */
export function decideToolCall(input: { state: string; entry: ToolCatalogEntry; args: unknown }): ToolDecision {
  const { entry } = input;
  if (!entry.allowed_states.includes(input.state as ToolState)) {
    return deny(
      'stage-denied',
      `当前状态「${stateLabel(input.state)}」不允许调用 ${entry.name}（允许：${statesText(entry.allowed_states)}）。`,
    );
  }
  const args = input.args === undefined || input.args === null ? {} : input.args;
  if (!isPlainObject(args)) return deny('arguments-invalid', `${entry.name} 的 args 必须是对象。`);
  for (const key of Object.keys(entry.fixed_args)) {
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      return deny('arguments-override', `${entry.name} 的 ${key} 是固定参数，不能在调用时覆盖。`);
    }
  }
  const problem = validateToolArgs(entry.parameters, args);
  if (problem !== undefined) return deny('arguments-invalid', `${entry.name} 参数不符：${problem}。`);
  return { allow: true };
}

/** 合并固定参数：调用参数只能补剩余字段（判定已挡掉覆盖，这里固定值仍然优先）。 */
export function mergeArgs(fixed: Record<string, unknown> | undefined, call: unknown): Record<string, unknown> {
  const fixedArgs = isPlainObject(fixed) ? fixed : {};
  const callArgs = isPlainObject(call) ? call : {};
  return { ...callArgs, ...fixedArgs };
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

/** 别名校验：四关里除「账」以外的全部规则（类型 / 静态 / 样例 / 阶段继承）。 */
export function validateAliasInput(input: {
  name: unknown;
  description: unknown;
  baseTool: unknown;
  fixedArgs: unknown;
  allowedStates: unknown;
  sampleArgs: unknown;
  existingNames: string[];
}): AliasValidation {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(name)) {
    return fail('name-invalid', '工具名必须是 3~41 位小写字母/数字/下划线，且以字母开头（例：note_decision）。');
  }
  if (input.existingNames.includes(name)) {
    return fail('name-duplicate', `已经有叫「${name}」的工具：换一个名字，或直接调用已有的。`);
  }
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description === '' || Array.from(description).length > 200) {
    return fail('description-invalid', '描述不能为空，且不超过 200 字：写清这个工具做什么、什么时候用。');
  }
  const baseTool = typeof input.baseTool === 'string' ? input.baseTool : '';
  if (!BASE_TOOL_NAMES.includes(baseTool)) {
    return fail('base-tool-invalid', `基础工具只能是：${BASE_TOOL_NAMES.join(' / ')}；别名不能再挂别名（禁止链式）。`);
  }
  const base = BASE_TOOLS_BY_NAME.get(baseTool)!;
  const fixed = input.fixedArgs === undefined || input.fixedArgs === null ? {} : input.fixedArgs;
  if (!isPlainObject(fixed)) return fail('fixed-args-invalid', 'fixed_args 必须是对象。');
  for (const [key, value] of Object.entries(fixed)) {
    const property = base.parameters.properties[key];
    if (property === undefined) return fail('fixed-args-invalid', `fixed_args.${key} 不是 ${baseTool} 的参数。`);
    const problem = validateValue(property, value, `fixed_args.${key}`);
    if (problem !== undefined) return fail('fixed-args-invalid', problem);
  }

  let allowedStates: ToolState[] = [...base.allowed_states];
  if (input.allowedStates !== undefined && input.allowedStates !== null) {
    if (!Array.isArray(input.allowedStates) || input.allowedStates.length === 0) {
      return fail('states-invalid', 'allowed_states 必须是非空数组（不传则继承基础工具的全部状态）。');
    }
    const picked: ToolState[] = [];
    for (const candidate of input.allowedStates) {
      if (typeof candidate !== 'string' || !ALL_STATES.includes(candidate as ToolState)) {
        return fail('states-invalid', `allowed_states 里有未知状态：${String(candidate)}。`);
      }
      if (!base.allowed_states.includes(candidate as ToolState)) {
        return fail('states-invalid', `${baseTool} 本身在「${stateLabel(String(candidate))}」不可用，别名不能放宽。`);
      }
      if (!picked.includes(candidate as ToolState)) picked.push(candidate as ToolState);
    }
    if (picked.length === 0) return fail('states-invalid', 'allowed_states 不能为空。');
    allowedStates = picked;
  }

  if (input.sampleArgs === undefined || input.sampleArgs === null) {
    return fail('sample-args-invalid', 'sample_args 必填：给一个能跑通的示例参数，登记时会用它校验。');
  }
  if (!isPlainObject(input.sampleArgs)) return fail('sample-args-invalid', 'sample_args 必须是对象。');
  for (const key of Object.keys(fixed)) {
    if (Object.prototype.hasOwnProperty.call(input.sampleArgs, key)) {
      return fail('sample-args-invalid', `sample_args 里不要再写固定参数 ${key}。`);
    }
  }
  const mergedSample = { ...input.sampleArgs, ...fixed };
  const sampleProblem = validateToolArgs(base.parameters, mergedSample);
  if (sampleProblem !== undefined) {
    return fail('sample-args-invalid', `sample_args 不满足 ${baseTool} 的参数要求：${sampleProblem}。`);
  }

  return {
    ok: true,
    parameters: deriveAliasParameters(base.parameters, fixed),
    allowedStates,
  };
}

/** 注入给模型的目录文本：名字 + 可用阶段 + 必填参数 + 一句话说明。 */
export function renderCatalogText(entries: ToolCatalogEntry[]): string {
  const base = entries.filter((entry) => entry.alias !== true);
  const aliases = entries.filter((entry) => entry.alias === true);
  const lines = ['【工具目录】模型只能通过 workflow_tool_call({name,args}) 调用下列工具；新增工具用 workflow_tool_add（只登记、不执行）。'];
  const lineOf = (entry: ToolCatalogEntry): string => {
    const required = entry.parameters.required ?? [];
    const requiredText = required.length > 0 ? `必填：${required.join(',')}` : '无必填参数';
    const summary = entry.alias === true ? entry.description : entry.summary ?? entry.description;
    return `- ${entry.name}（${statesText(entry.allowed_states)}可用；${requiredText}）${summary}`;
  };
  for (const entry of base) lines.push(lineOf(entry));
  if (aliases.length > 0) {
    lines.push('别名（workflow_tool_add 登记的固定参数版本）：');
    for (const alias of aliases) lines.push(lineOf(alias));
  }
  return lines.join('\n');
}
