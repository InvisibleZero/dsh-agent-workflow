// @ts-nocheck
/**
 * 扩展工具的持久化：<toolsDir>/tool-registry.json，全局一份，不按工作区分。
 *
 * 为什么全局：工具是「做什么 + 跑哪个脚本」的定义，换工作区不该重配；
 * 脚本路径相对插件自己的目录，工作目录在调用时作为第一个参数传给脚本。
 *
 * 只暴露 list / save / update / snapshot 四个读写口，上层不直接碰文件：
 *   - save   ：新增；同名（含基础工具名）由领域层先挡，这里再挡一次防并发。
 *   - update ：按 name 整条替换；不存在就是调用方搞错了，直接抛。
 *
 * 文件损坏时返回 corrupt=true + 空表（基础工具不受影响），
 * 让调用方把「工具表不可用」和「还没登记过」分开记。
 *
 * 没做 remove：这一版条目只增不删，真要删等下个版本。
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_STATES,
  TOOL_KIND,
  type ToolEffect,
  type ToolEntry,
  type ToolParameterSchema,
  type ToolRun,
  type ToolState,
} from '../schema/tool-catalog';

export interface RegistryListing {
  entries: ToolEntry[];
  corrupt: boolean;
}

interface RegistryFile {
  version: number;
  tools: ToolEntry[];
}

/** 2：从按工作区分组改成全局平铺；1 的文件按损坏处理（没有历史数据要兼容）。 */
const FILE_VERSION = 2;
const FILE_NAME = 'tool-registry.json';
const EFFECTS: ToolEffect[] = ['read-state', 'write-state', 'exec'];

function emptyFile(): RegistryFile {
  return { version: FILE_VERSION, tools: [] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 执行方式收窄：只认检查器引用；id 是否真实存在由领域层校验，这里只管形状。 */
function normalizeRun(raw: unknown): ToolRun | null {
  if (!isPlainObject(raw)) return null;
  if (raw.kind !== 'checker') return null;
  const checker = typeof raw.checker === 'string' ? raw.checker.trim() : '';
  return checker === '' ? null : { kind: 'checker', checker };
}

/** 参数 schema 只校验「是个对象」：结构由领域层在登记时校验过，这里不重复。 */
function normalizeParameters(raw: unknown): ToolParameterSchema | null {
  if (!isPlainObject(raw)) return null;
  return raw as unknown as ToolParameterSchema;
}

/**
 * 单个条目收窄：任何必填字段缺失都丢弃该条（坏数据不能进目录）。
 *
 * 文件里只该有扩展工具——基础工具在代码里，出现在文件里就是脏数据。
 */
function normalizeEntry(raw: unknown): ToolEntry | null {
  if (!isPlainObject(raw)) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const kind = raw.kind === TOOL_KIND.extension ? TOOL_KIND.extension : null;
  const run = normalizeRun(raw.run);
  const parameters = normalizeParameters(raw.parameters);
  const effect = typeof raw.effect === 'string' && EFFECTS.includes(raw.effect as ToolEffect)
    ? (raw.effect as ToolEffect)
    : null;
  const createdAt = typeof raw.created_at === 'string' ? raw.created_at : '';
  const version = typeof raw.version === 'number' ? raw.version : 0;
  const states = Array.isArray(raw.allowed_states)
    ? raw.allowed_states.filter((state: unknown): state is ToolState => (
      typeof state === 'string' && ALL_STATES.includes(state as ToolState)
    ))
    : [];
  if (
    name === ''
    || description === ''
    || kind === null
    || run === null
    || parameters === null
    || effect === null
    || createdAt === ''
    || version <= 0
    || states.length === 0
  ) {
    return null;
  }
  return {
    name,
    description,
    kind,
    run,
    allowed_states: states,
    effect,
    parameters,
    version,
    created_at: createdAt,
  };
}

function normalizeFile(raw: unknown): { file: RegistryFile; corrupt: boolean } {
  if (!isPlainObject(raw) || !Array.isArray(raw.tools)) return { file: emptyFile(), corrupt: true };
  let corrupt = raw.version !== FILE_VERSION;
  const tools: ToolEntry[] = [];
  for (const item of raw.tools) {
    const entry = normalizeEntry(item);
    if (entry === null) corrupt = true;
    else tools.push(entry);
  }
  return { file: { version: FILE_VERSION, tools }, corrupt };
}

export class ToolRegistryStore {
  /** 同一文件的读改写串行：并发 save 不会互相覆盖。 */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly toolsDir: string) {}

  private filePath(): string {
    return join(this.toolsDir, FILE_NAME);
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  private async readFile(): Promise<{ file: RegistryFile; corrupt: boolean }> {
    try {
      const raw = JSON.parse(await fs.readFile(this.filePath(), 'utf8'));
      return normalizeFile(raw);
    } catch (error) {
      // 文件不存在是正常初始状态；其余（读失败 / JSON 坏）都算 corrupt。
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return { file: emptyFile(), corrupt: false };
      return { file: emptyFile(), corrupt: true };
    }
  }

  async list(): Promise<RegistryListing> {
    const { file, corrupt } = await this.readFile();
    return { entries: file.tools, corrupt };
  }

  /** 只读快照：设置页「工具」页签要展示全局扩展工具；字段形状与 list 一致。 */
  async snapshot(): Promise<RegistryListing> {
    return this.list();
  }

  /** 新增一条；同名已存在时抛错（并发下也不会出现两条同名）。 */
  async save(entry: ToolEntry): Promise<ToolEntry[]> {
    return this.serial(async () => {
      const { file } = await this.readFile();
      if (file.tools.some((item) => item.name === entry.name)) {
        throw new Error(`工具「${entry.name}」已在工具表里：要改它就得走更新（update），不能重复新增。`);
      }
      const next = [...file.tools, entry];
      await this.write({ ...file, tools: next });
      return next;
    });
  }

  /** 整条替换；找不到同名条目时抛错。 */
  async update(entry: ToolEntry): Promise<ToolEntry[]> {
    return this.serial(async () => {
      const { file } = await this.readFile();
      if (!file.tools.some((item) => item.name === entry.name)) {
        throw new Error(`工具表里没有叫「${entry.name}」的扩展工具：要新建就用 save。`);
      }
      const next = file.tools.map((item) => (item.name === entry.name ? entry : item));
      await this.write({ ...file, tools: next });
      return next;
    });
  }

  private async write(file: RegistryFile): Promise<void> {
    await fs.mkdir(this.toolsDir, { recursive: true });
    const target = this.filePath();
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(file, null, 2), 'utf8');
    await fs.rename(tmp, target);
  }
}
