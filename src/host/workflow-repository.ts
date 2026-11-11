import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { JsonStorageAdapter } from '../adapter/json-storage';
import { DEFAULT_GLOBAL_OPERATION_DETAIL, DEFAULT_SETTINGS, GlobalOperationDetail, type WorkflowSnapshot } from '../schema/workflow';
import type { AgentNode } from '../schema/node';

/** 随插件提供的内置存档名：只读，不可改不可删，缺省时就用它。 */
export const BUILTIN_PROFILE_NAME = '默认存档';
/** 旧版扁平设置文件迁移成的存档名。 */
const MIGRATED_PROFILE_NAME = '我的存档';

/**
 * workflow 工作区的持久化仓库：一份快照文件 = 一个 workflow 工作区。
 * 存储目录：<baseDir>/workflows/<workspace_id>.json（复用 JsonStorageAdapter 的原子写 + 迁移）。
 *
 * 与 dsh 的「目录工作区」完全无关：dsh workspace 走它自己的 workspace.json，
 * 这里写的是我们自己的 WorkflowSnapshot，互不共享实体。
 */

export interface WorkflowSummary {
  id: string;
  title: string;
  /** 用户创建时选的工作目录；旧快照可能没有。 */
  path: string | null;
  /** 对应的宿主目录工作区 id；旧快照可能没有（靠 path 反查）。 */
  workspaceId?: string;
  /** 是否置顶（只影响侧栏排序）。 */
  pinned: boolean;
  /** 文件最后修改时间（ISO），用于列表排序；不是严格意义上的"创建时间"。 */
  updatedAt: string;
}

/** 造一个合法的根节点（workspace 类型，parent_id 为 null，初始态 discussing）。 */
export function buildRootNode(id: string, maxDepth: number, maxSteps: number): AgentNode {
  return {
    node_id: id,
    parent_id: null,
    node_type: 'workspace',
    current_state: 'discussing',
    child_ids: [],
    context_payload: null,
    flags: [],
    depth: 0,
    max_depth: maxDepth,
    step_count: 0,
    max_steps: maxSteps,
  };
}

/** 手册平铺在工作区根目录的 .workflow/ 下。
 *  会话手册 = 方案 + 实施顺序（每会话一份，文件名自索引 node_id）。
 *  项目手册 = 项目总览 / 决策 / 要点（每工作区一份）。 */
const WORKFLOW_SUBDIR = '.workflow';
const MANUAL_MAX_BYTES = 200 * 1024;
const GLOBAL_MANUAL_MAX_BYTES = 64 * 1024;

function sessionManualFileName(nodeId: string): string {
  return `会话手册-${nodeId}.md`;
}
function globalManualFileName(): string {
  return '项目手册.md';
}

/** 会话手册模板：方案（自底向上 4 层）+ 实施顺序（勾选清单）。 */
const SESSION_MANUAL_TEMPLATE = [
  '# 会话手册',
  '',
  '## 方案（自底向上）',
  '### 1. 目标与验收',
  '<!-- 要解决什么、不做什么、验收标准 -->',
  '### 2. 数据层',
  '<!-- 数据模型 / 持久化 / 迁移；完成标准：能读写、迁移可跑，附测试脚本；层间契约：对外只暴露 ____，上层不直接碰存储实现 -->',
  '### 3. 领域层',
  '<!-- 核心规则 / 状态机 / 算法；完成标准：逻辑独立可测，附测试脚本；层间契约：只暴露纯函数 ____，不碰 DOM、不读写全局 -->',
  '### 4. 接口层',
  '<!-- 对外契约（工具 / 路由 / 命令）；完成标准：契约测试通过，附测试文件；层间契约：只做事件 → action 映射，不做计算、不渲染 -->',
  '### 5. 表现层',
  '<!-- UI / 文案 / 端到端；完成标准：build + smoke 通过；层间契约：只消费只读状态渲染，不反向写数据层 -->',
  '',
  '## 实施顺序',
  '- [ ] 数据层 —— 完成标准：能读写、迁移可跑',
  '- [ ] 领域层 —— 完成标准：逻辑独立可测',
  '- [ ] 接口层 —— 完成标准：契约测试通过',
  '- [ ] 表现层 —— 完成标准：build + smoke 通过',
  '',
].join('\n');

/**
 * 项目手册模板：四类跨会话内容。
 * - 项目总览：是什么、从哪进
 * - 决策记录：拍板了什么、放弃了什么
 * - 约束 / 红线：本项目绝不能做的事（比全局 AGENTS.md 更具体）
 * - 坑与防线：重复踩的坑，按「现象 → 根因 → 防线 → 自查」写
 */
const GLOBAL_MANUAL_TEMPLATE = [
  '# 项目手册',
  '',
  '## 项目总览',
  '<!-- 这个项目在做什么、技术栈、关键目录；不超过 3 行 -->',
  '',
  '## 决策记录',
  '<!-- 拍板过的分叉点：选了什么、为什么、放弃了什么；每条不超过 2 行 -->',
  '',
  '## 约束 / 红线',
  '<!-- 本项目绝不能做的事；只写能判定的，不写"注意质量"这类空话 -->',
  '',
  '## 坑与防线',
  '<!-- 现象 → 根因 → 防线 → 自查；每条不超过 3 行 -->',
  '',
].join('\n');

/** 清单行里「自检证据」的分隔标记：- [x] 条目 ｜ 自检：<证据> */
const CHECK_EVIDENCE_MARK = ' ｜ 自检：';

/** 从会话手册里解析「实施顺序」小节的勾选清单；解析不到返回空数组。证据只从 label 里剥掉，不返回。 */
function parseChecklist(manual: string): Array<{ label: string; done: boolean }> {
  const lines = manual.split(/\r?\n/);
  let inSection = false;
  const items: Array<{ label: string; done: boolean }> = [];
  for (const line of lines) {
    if (line.trim() === '## 实施顺序') {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith('## ')) break;
    if (!inSection) continue;
    const match = /^\s*-\s+\[([ xX])\]\s*(.+)$/.exec(line);
    if (match !== null) {
      const raw = (match[2] ?? '').trim();
      const cut = raw.indexOf(CHECK_EVIDENCE_MARK);
      items.push({ label: cut === -1 ? raw : raw.slice(0, cut).trim(), done: match[1] !== ' ' });
    }
  }
  return items;
}

/** 判断「方案」小节是否已经写了实质内容（非标题、非注释、非空行）。 */
function parseHasPlan(manual: string): boolean {
  const lines = manual.split(/\r?\n/);
  let inPlan = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## 方案')) {
      inPlan = true;
      continue;
    }
    if (inPlan && trimmed.startsWith('## ')) break;
    if (!inPlan) continue;
    if (trimmed === '' || trimmed.startsWith('### ') || trimmed.startsWith('<!--')) continue;
    return true;
  }
  return false;
}

// —— 手册编辑（AI 专用工具的实现）——

/** 去掉 `##` 前缀后的标题文字。 */
function headingText(line: string): string {
  return line.replace(/^#+\s*/, '').trim();
}

/** 手册里现有的一级小节名（给"小节不存在"的报错用）。 */
function availableSections(manual: string): string[] {
  return manual
    .split(/\r?\n/)
    .filter((line) => line.startsWith('## '))
    .map(headingText);
}

/**
 * 按小节替换正文：只改 `## <section>` 到下一个 `## ` 之间的内容，标题与其它小节保留。
 * aliases 用于兼容旧模板的标题（例如「坑与防线」在旧手册里叫「要点 / 疑难杂症」）。
 * @throws 手册里没有该小节时抛出，并列出可用小节。
 */
function replaceSectionBody(manual: string, section: string, content: string, aliases: string[] = []): string {
  const lines = manual.split(/\r?\n/);
  const candidates = [section, ...aliases];
  const start = lines.findIndex((line) => line.startsWith('## ')
    && candidates.some((candidate) => headingText(line).startsWith(candidate)));
  if (start < 0) {
    throw new Error(`手册里没有「${section}」小节；可用小节：${availableSections(manual).join(' / ')}`);
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== undefined && line.startsWith('## ')) {
      end = index;
      break;
    }
  }
  const head = lines.slice(0, start + 1);
  const tail = lines.slice(end);
  const body = content.trim();
  return [...head, '', body, '', ...tail].join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * 旧模板标题 → 新标题的兼容映射：写入时如果找不到新标题，就退回旧标题。
 * （「要点 / 疑难杂症」是 v0.2.0 的旧名，现在叫「坑与防线」。）
 */
const MANUAL_SECTION_ALIASES: Record<string, string[]> = {
  '坑与防线': ['要点'],
};

/** 按 `## 标题` 切分手册，返回有序的 { 标题, 正文 } 列表。 */
function splitManualSections(manual: string): Array<{ title: string; body: string }> {
  const sections: Array<{ title: string; body: string }> = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of manual.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      if (current !== null) sections.push({ title: current.title, body: current.lines.join('\n').trim() });
      current = { title: headingText(line), lines: [] };
      continue;
    }
    if (current !== null) current.lines.push(line);
  }
  if (current !== null) sections.push({ title: current.title, body: current.lines.join('\n').trim() });
  return sections;
}

/** 追加一个不存在的小节（用于旧手册缺新小节时的迁移：只追加，不改动已有内容）。 */
function appendSection(manual: string, section: string, content: string): string {
  const base = manual.trimEnd();
  const body = content.trim();
  return `${base}\n\n## ${section}\n\n${body}\n`;
}

/**
 * 勾选/取消「实施顺序」里的某一条：按条目文字精确匹配，只改复选框字符。
 * 勾选时把证据写进行尾：`- [x] 条目 ｜ 自检：<证据>`；取消勾选时去掉证据。
 */
function toggleChecklistLine(manual: string, label: string, done: boolean, evidence: string): string {
  const lines = manual.split(/\r?\n/);
  let inSection = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    if (line.trim() === '## 实施顺序') {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith('## ')) break;
    if (!inSection) continue;
    const match = /^(\s*-\s+\[)([ xX])(\]\s*)(.+)$/.exec(line);
    if (match === null || match[4] === undefined) continue;
    const raw = match[4].trim();
    const cut = raw.indexOf(CHECK_EVIDENCE_MARK);
    const lineLabel = cut === -1 ? raw : raw.slice(0, cut).trim();
    if (lineLabel !== label) continue;
    const suffix = done && evidence !== '' ? `${CHECK_EVIDENCE_MARK}${evidence}` : '';
    lines[index] = `${match[1] ?? ''}${done ? 'x' : ' '}${match[3] ?? ''}${label}${suffix}`;
    return lines.join('\n');
  }
  throw new Error(`没能定位到条目「${label}」`);
}

/** 原子写：临时文件 + rename，避免写一半留下残文件。 */
async function writeTextAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, path);
}

async function writeIfMissing(path: string, content: string): Promise<void> {
  try {
    await fs.access(path);
  } catch {
    await fs.writeFile(path, content, 'utf8');
  }
}

async function readTextCapped(path: string, maxBytes: number): Promise<string> {
  try {
    const raw = await fs.readFile(path, 'utf8');
    if (Buffer.byteLength(raw, 'utf8') <= maxBytes) return raw;
    return `${raw.slice(0, maxBytes)}\n…（已截断）`;
  } catch {
    return '';
  }
}

/** 往根工作目录的 .gitignore 追加 .workflow/（文件不存在则跳过，不主动新建）。 */
async function appendGitignore(workingDir: string | undefined): Promise<void> {
  if (typeof workingDir !== 'string' || workingDir === '') return;
  const target = join(workingDir, '.gitignore');
  try {
    await fs.access(target);
  } catch {
    return;
  }
  try {
    const content = await fs.readFile(target, 'utf8');
    if (content.includes('.workflow')) return;
    const separator = content !== '' && !content.endsWith('\n') ? '\n' : '';
    await fs.writeFile(target, `${content}${separator}.workflow/\n`, 'utf8');
  } catch {
    // 读写失败不阻塞建节点。
  }
}

export class WorkflowRepository {
  private readonly storage: JsonStorageAdapter;
  /** 手册元数据缓存：key = workflowId:nodeId，按文件 mtime 失效，避免每次轮询都读盘。 */
  private readonly manualMetaCache = new Map<string, { mtimeMs: number; checklist: Array<{ label: string; done: boolean }>; hasPlan: boolean }>();
  /** 每个工作区的写队列（串行化读-改-写，避免并发覆盖丢更新）。 */
  private readonly writeQueues = new Map<string, Promise<unknown>>();

  constructor(readonly baseDir: string) {
    this.storage = new JsonStorageAdapter(baseDir);
  }

  /**
   * 按 key（通常是 workflowId 或工作目录）串行执行写操作。
   * 前一个任务无论成功失败，后面的都会接着跑；返回本次任务的真实结果。
   */
  private serial<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.writeQueues.get(key) ?? Promise.resolve();
    const current = previous.then(task, task);
    this.writeQueues.set(key, current.catch(() => {}));
    return current;
  }

  /** 列出所有 workflow 工作区，按最后修改时间倒序。单个损坏文件跳过，不影响整体。 */
  async list(): Promise<WorkflowSummary[]> {
    const dir = join(this.baseDir, 'workflows');
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const items: WorkflowSummary[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const id = name.slice(0, -'.json'.length);
      try {
        const snapshot = await this.storage.load(id);
        if (snapshot === null) continue;
        const stat = await fs.stat(join(dir, name));
        items.push({
          id,
          title: snapshot.title,
          path: snapshot.working_directory ?? null,
          ...(snapshot.host_workspace_id === undefined ? {} : { workspaceId: snapshot.host_workspace_id }),
          pinned: snapshot.pinned === true,
          updatedAt: stat.mtime.toISOString(),
        });
      } catch {
        // 单个文件损坏时跳过，不拖垮整个列表。
      }
    }
    items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return items;
  }

  /** 新建一个 workflow 工作区：自动建根节点，标题缺省用目录名。 */
  async create(input: { title?: string; path: string; hostWorkspaceId?: string }): Promise<WorkflowSummary> {
    const id = randomUUID();
    const trimmedTitle = input.title?.trim() ?? '';
    const title = trimmedTitle !== '' ? trimmedTitle : basename(input.path);
    const hostWorkspaceId = typeof input.hostWorkspaceId === 'string' && input.hostWorkspaceId !== ''
      ? input.hostWorkspaceId
      : undefined;
    const snapshot: WorkflowSnapshot = {
      version: 2,
      workspace_id: id,
      title,
      working_directory: input.path,
      ...(hostWorkspaceId === undefined ? {} : { host_workspace_id: hostWorkspaceId }),
      settings: DEFAULT_SETTINGS,
      nodes: [buildRootNode(id, DEFAULT_SETTINGS.default_max_depth, DEFAULT_SETTINGS.default_max_steps)],
    };
    await this.storage.save(snapshot);
    await this.ensureGlobalManual(input.path);
    return {
      id,
      title,
      path: input.path,
      ...(hostWorkspaceId === undefined ? {} : { workspaceId: hostWorkspaceId }),
      pinned: false,
      updatedAt: new Date().toISOString(),
    };
  }

  async get(id: string): Promise<WorkflowSnapshot | null> {
    return this.storage.load(id);
  }

  /** 读取某个 workflow 的全局操作细节（A + B/C/D）。 */
  async getGlobalOperationDetail(id: string): Promise<WorkflowSnapshot['settings']['global_operation_detail'] | null> {
    const snapshot = await this.storage.load(id);
    return snapshot === null ? null : snapshot.settings.global_operation_detail;
  }

  /** 存档目录：一份存档 = 一个 json 文件；内置「默认存档」来自代码常量，不落盘。 */
  private profilesDir(): string {
    return join(this.baseDir, 'exports');
  }

  /** 当前生效存档的指针：只存一个名字，存在 <baseDir>/global-settings.json。 */
  private activePointerPath(): string {
    return join(this.baseDir, 'global-settings.json');
  }

  /** 存档名 → 文件名：去掉路径分隔符等非法字符并限长，防止写到目录外。 */
  private profileFileName(name: string): string {
    const safe = name.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/^\.+/, '').slice(0, 40);
    if (safe === '' || safe === BUILTIN_PROFILE_NAME) throw new Error(`存档名不可用：${name}`);
    return `${safe}.json`;
  }

  /** 列出存档名（不含内置存档；读不出来的文件跳过，不让坏文件阻塞设置页）。 */
  private async listProfileNames(): Promise<string[]> {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(this.profilesDir());
    } catch {
      return [];
    }
    const names: string[] = [];
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.json')) continue;
      const name = entry.slice(0, -'.json'.length);
      if (name === BUILTIN_PROFILE_NAME) continue;
      try {
        const raw = JSON.parse(await fs.readFile(join(this.profilesDir(), entry), 'utf8'));
        GlobalOperationDetail.parse(raw?.detail ?? raw);
        names.push(name);
      } catch {
        // 坏文件不列出
      }
    }
    return names.sort();
  }

  /** 当前生效存档名；指针失效时回到内置存档。 */
  private async activeProfileName(names: string[]): Promise<string> {
    try {
      const raw = JSON.parse(await fs.readFile(this.activePointerPath(), 'utf8'));
      const active = typeof raw?.active === 'string' ? raw.active : BUILTIN_PROFILE_NAME;
      if (active === BUILTIN_PROFILE_NAME) return active;
      return names.includes(active) ? active : BUILTIN_PROFILE_NAME;
    } catch {
      return BUILTIN_PROFILE_NAME;
    }
  }

  private async writeActivePointer(name: string): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const target = this.activePointerPath();
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify({ active: name }, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, target);
  }

  private async writeProfileFile(name: string, detail: GlobalOperationDetail): Promise<void> {
    await fs.mkdir(this.profilesDir(), { recursive: true });
    const target = join(this.profilesDir(), this.profileFileName(name));
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify({ kind: 'dsh-agent-workflow/operation-detail', version: 1, name, detail }, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, target);
  }

  private async readProfileFile(name: string): Promise<GlobalOperationDetail> {
    const raw = JSON.parse(await fs.readFile(join(this.profilesDir(), this.profileFileName(name)), 'utf8'));
    return GlobalOperationDetail.parse(raw?.detail ?? raw);
  }

  /**
   * 一次性迁移：旧的 `{ active, profiles }` 或更早的扁平 A/B/C/D，都拆成"一份存档一个文件"。
   * 只在指针文件还是旧格式时动手，迁完就只剩 `{ active }`。
   */
  private async migrateLegacySettings(): Promise<void> {
    let raw: any;
    try {
      raw = JSON.parse(await fs.readFile(this.activePointerPath(), 'utf8'));
    } catch {
      return;
    }
    if (raw === null || typeof raw !== 'object') return;
    const hasProfiles = raw.profiles !== null && typeof raw.profiles === 'object';
    const isFlat = typeof raw.shared_detail === 'string';
    if (!hasProfiles && !isFlat) return;
    const entries: Array<[string, unknown]> = hasProfiles
      ? Object.entries(raw.profiles)
      : [[MIGRATED_PROFILE_NAME, raw]];
    for (const [name, value] of entries) {
      if (name === BUILTIN_PROFILE_NAME) continue;
      const parsed = GlobalOperationDetail.safeParse(value);
      if (!parsed.success) continue;
      try {
        await this.writeProfileFile(name, parsed.data);
      } catch {
        // 单个存档迁移失败不影响其它
      }
    }
    const active = typeof raw.active === 'string' ? raw.active : MIGRATED_PROFILE_NAME;
    await this.writeActivePointer(active);
  }

  /** 存档列表：内置存档永远排第一，其余按文件名排序。 */
  async listProfiles(): Promise<{ active: string; names: string[] }> {
    await this.migrateLegacySettings();
    const names = await this.listProfileNames();
    return { active: await this.activeProfileName(names), names: [BUILTIN_PROFILE_NAME, ...names] };
  }

  /** 当前生效的操作细节：内置存档来自代码常量，其余读对应的 json 文件。 */
  async getAppGlobalOperationDetail(): Promise<GlobalOperationDetail> {
    const { active } = await this.listProfiles();
    if (active === BUILTIN_PROFILE_NAME) return DEFAULT_GLOBAL_OPERATION_DETAIL;
    try {
      return await this.readProfileFile(active);
    } catch {
      return DEFAULT_GLOBAL_OPERATION_DETAIL;
    }
  }

  /** 保存当前生效的存档。内置存档只读，改它会被拒绝。 */
  async updateAppGlobalOperationDetail(raw: unknown): Promise<GlobalOperationDetail> {
    const { active } = await this.listProfiles();
    if (active === BUILTIN_PROFILE_NAME) {
      throw new Error(`「${BUILTIN_PROFILE_NAME}」随插件提供、不可修改；请先「另存为」一份自己的存档`);
    }
    const parsed = GlobalOperationDetail.parse(raw);
    await this.writeProfileFile(active, parsed);
    return parsed;
  }

  /** 新建/覆盖一份用户存档（内置存档名不可用）。detail 省略时复制当前生效的那份。 */
  async saveProfile(name: string, raw?: unknown): Promise<{ active: string; names: string[] }> {
    const trimmed = name.trim();
    if (trimmed === BUILTIN_PROFILE_NAME) throw new Error(`「${BUILTIN_PROFILE_NAME}」是内置只读存档，换一个名字`);
    this.profileFileName(trimmed); // 校验名字可用
    const detail = raw === undefined ? await this.getAppGlobalOperationDetail() : GlobalOperationDetail.parse(raw);
    await this.writeProfileFile(trimmed, detail);
    await this.writeActivePointer(trimmed);
    return this.listProfiles();
  }

  async activateProfile(name: string): Promise<{ active: string; names: string[] }> {
    const names = await this.listProfileNames();
    if (name !== BUILTIN_PROFILE_NAME && !names.includes(name)) throw new Error(`没有名为「${name}」的存档`);
    await this.writeActivePointer(name);
    return this.listProfiles();
  }

  /** 删除存档：文件移进 exports/trash/（不直接删，误删可捞回来）。 */
  async deleteProfile(name: string): Promise<{ active: string; names: string[] }> {
    if (name === BUILTIN_PROFILE_NAME) throw new Error(`「${BUILTIN_PROFILE_NAME}」是内置只读存档，不能删除`);
    const names = await this.listProfileNames();
    if (!names.includes(name)) throw new Error(`没有名为「${name}」的存档`);
    const source = join(this.profilesDir(), this.profileFileName(name));
    const trash = join(this.profilesDir(), 'trash');
    await fs.mkdir(trash, { recursive: true });
    await fs.rename(source, join(trash, `${this.profileFileName(name).replace(/\.json$/, '')}-${Date.now()}.json`));
    const active = await this.activeProfileName(await this.listProfileNames());
    if (active === name) await this.writeActivePointer(BUILTIN_PROFILE_NAME);
    return this.listProfiles();
  }

  /** 把当前生效的存档复制一份到存档目录（带时间戳），返回路径。 */
  async exportActiveProfile(): Promise<{ path: string; name: string }> {
    const { active } = await this.listProfiles();
    const detail = await this.getAppGlobalOperationDetail();
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    // 备份放子目录：不参与存档列表，避免下拉里堆满时间戳副本
    const backupDir = join(this.profilesDir(), 'backup');
    await fs.mkdir(backupDir, { recursive: true });
    const target = join(backupDir, `操作细节-${active}-${stamp}.json`);
    await fs.writeFile(target, `${JSON.stringify({ kind: 'dsh-agent-workflow/operation-detail', version: 1, name: active, detail }, null, 2)}\n`, 'utf8');
    return { path: target, name: active };
  }

  /**
   * 导入一份存档：接受 `{ name, detail }` 包装，或直接一份 A/B/C/D。
   * @returns 导入后的存档名与列表（不自动切换，避免导入即改全局行为）。
   */
  async importProfile(name: string, json: string): Promise<{ imported: string; names: string[] }> {
    let raw: any;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new Error('不是合法 JSON：请粘贴导出的文件内容');
    }
    const detail = GlobalOperationDetail.parse(raw?.detail ?? raw);
    const trimmed = name.trim() !== '' ? name.trim() : (typeof raw?.name === 'string' ? raw.name : '导入的存档');
    if (trimmed === BUILTIN_PROFILE_NAME) throw new Error(`「${BUILTIN_PROFILE_NAME}」是内置只读存档，换一个名字再导入`);
    await this.writeProfileFile(trimmed, detail);
    const { names } = await this.listProfiles();
    return { imported: trimmed, names };
  }

  /** 覆盖某个 workflow 的全局操作细节（A + B/C/D），用 zod 校验后落盘。 */
  async updateGlobalOperationDetail(
    id: string,
    raw: unknown,
  ): Promise<WorkflowSnapshot['settings']['global_operation_detail']> {
    const snapshot = await this.storage.load(id);
    if (snapshot === null) throw new Error('找不到该 workflow');
    const parsed = GlobalOperationDetail.parse(raw);
    const updated: WorkflowSnapshot = {
      ...snapshot,
      settings: { ...snapshot.settings, global_operation_detail: parsed },
    };
    await this.storage.save(updated);
    return parsed;
  }

  /**
   * 设置节点级「附加说明」（纯增量，不覆盖全局）。
   * 传空串 = 删除该状态的附加说明；三个都空则把字段整个去掉。
   */
  async setNodeNote(input: { id: string; nodeId: string; state: string; text: string }): Promise<WorkflowSnapshot> {
    return this.serial(input.id, async () => {
      const snapshot = await this.storage.load(input.id);
      if (snapshot === null) throw new Error('找不到该 workflow');
      const state = input.state;
      if (!['global', 'discussing', 'implementing', 'verifying'].includes(state)) throw new Error('非法状态');
      const exists = snapshot.nodes.some((node) => node.node_id === input.nodeId);
      if (!exists) throw new Error('找不到节点');
      const text = input.text.trim();
      const updated: WorkflowSnapshot = {
        ...snapshot,
        nodes: snapshot.nodes.map((node) => {
          if (node.node_id !== input.nodeId) return node;
          const next: Record<string, string> = { ...(node.additional_detail ?? {}) };
          if (text === '') delete next[state];
          else next[state] = text;
          const hasAny = Object.keys(next).length > 0;
          const { additional_detail: _previous, ...rest } = node;
          return hasAny ? { ...rest, additional_detail: next } : rest;
        }),
      };
      await this.storage.save(updated);
      return updated;
    });
  }

  /**
   * 按绑定的会话 id 反查节点（输入框旁的状态徽标用）。
   * workflow 数量很少，逐个文件扫一遍足够；单文件损坏就跳过。
   */
  async findBySession(sessionId: string): Promise<{
    workflowId: string;
    nodeId: string;
    title: string;
    current_state: string;
  } | null> {
    const dir = join(this.baseDir, 'workflows');
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const id = name.slice(0, -'.json'.length);
      try {
        const snapshot = await this.storage.load(id);
        if (snapshot === null) continue;
        const node = snapshot.nodes.find((candidate) => candidate.session_id === sessionId);
        if (node !== undefined) {
          return {
            workflowId: id,
            nodeId: node.node_id,
            title: node.title ?? '',
            current_state: node.current_state,
          };
        }
      } catch {
        // 单个快照损坏时跳过，不影响其它 workflow。
      }
    }
    return null;
  }

  /**
   * 删除整份 workflow 快照（宿主工作区被删除时同步清理，避免留下孤儿行）。
   * **不真删**：移到 workflows-trash/<id>.<时间戳>.json，便于误删后恢复。
   */
  async remove(id: string): Promise<void> {
    const source = join(this.baseDir, 'workflows', `${id}.json`);
    const trashDir = join(this.baseDir, 'workflows-trash');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      await fs.mkdir(trashDir, { recursive: true });
      await fs.rename(source, join(trashDir, `${id}.${stamp}.json`));
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      // 移动失败（跨盘/权限）时退回真删，保证删除动作本身不会卡住。
      try {
        await fs.unlink(source);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw unlinkError;
      }
    }
  }

  /** 列出回收站里的快照（按文件名倒序 = 最近删除优先）。 */
  async listTrash(): Promise<Array<{ id: string; file: string; deletedAt: string }>> {
    const trashDir = join(this.baseDir, 'workflows-trash');
    let names: string[] = [];
    try {
      names = await fs.readdir(trashDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    return names
      .filter((name) => name.endsWith('.json'))
      .sort()
      .reverse()
      .map((name) => {
        const match = /^(.+)\.(\d{4}-\d{2}-\d{2}T[^.]+)\.json$/.exec(name);
        return {
          id: match?.[1] ?? name.slice(0, -'.json'.length),
          file: name,
          deletedAt: match?.[2] ?? '',
        };
      });
  }

  /**
   * 从回收站恢复（取该 id 最近一次删除的那份）。
   * 已存在同名快照时不覆盖，直接返回 false。
   */
  async restoreFromTrash(id: string): Promise<boolean> {
    const trashDir = join(this.baseDir, 'workflows-trash');
    const target = join(this.baseDir, 'workflows', `${id}.json`);
    try {
      await fs.access(target);
      return false;
    } catch {
      // 目标不存在，可以恢复。
    }
    let names: string[] = [];
    try {
      names = await fs.readdir(trashDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
    const newest = names
      .filter((name) => name.startsWith(`${id}.`) && name.endsWith('.json'))
      .sort()
      .reverse()[0];
    if (newest === undefined) return false;
    await fs.mkdir(join(this.baseDir, 'workflows'), { recursive: true });
    await fs.rename(join(trashDir, newest), target);
    return true;
  }

  /**
   * 把宿主目录工作区 id 写回快照（一次性迁移用：旧快照只有 working_directory）。
   * 已写过就不重复写；传空串等于清空。
   */
  async linkWorkspace(input: { id: string; hostWorkspaceId: string }): Promise<WorkflowSnapshot> {
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error('找不到该 workflow');
    const hostWorkspaceId = input.hostWorkspaceId.trim();
    const updated: WorkflowSnapshot = hostWorkspaceId === ''
      ? (() => {
          const { host_workspace_id: _removed, ...rest } = snapshot;
          return rest as WorkflowSnapshot;
        })()
      : { ...snapshot, host_workspace_id: hostWorkspaceId };
    await this.storage.save(updated);
    return updated;
  }

  /** 置顶 / 取消置顶（只影响侧栏排序，不碰宿主的工作区置顶集合）。 */
  async setPinned(input: { id: string; pinned: boolean }): Promise<WorkflowSnapshot> {
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error('找不到该 workflow');
    const updated: WorkflowSnapshot = { ...snapshot, pinned: input.pinned === true };
    await this.storage.save(updated);
    return updated;
  }

  /** 把某个节点推进到下一状态；附状态迁移时间线（history）。 */
  async transitionNode(input: { id: string; nodeId: string; to: string; by?: string }): Promise<WorkflowSnapshot> {
    return this.serial(input.id, async () => {
      const snapshot = await this.storage.load(input.id);
      if (snapshot === null) throw new Error('找不到该 workflow');
      const validStates = ['discussing', 'implementing', 'verifying', 'completed'];
      if (!validStates.includes(input.to)) throw new Error('非法状态');
      const node = snapshot.nodes.find((candidate) => candidate.node_id === input.nodeId);
      if (node === undefined) throw new Error('找不到节点');
      const from = node.current_state;
      const updated: WorkflowSnapshot = {
        ...snapshot,
        nodes: snapshot.nodes.map((candidate) =>
          candidate.node_id === input.nodeId
            ? {
                ...candidate,
                current_state: input.to as AgentNode['current_state'],
                history: [...(candidate.history ?? []), {
                  at: new Date().toISOString(),
                  from,
                  to: input.to,
                  ...(typeof input.by === 'string' && input.by !== '' ? { by: input.by } : {}),
                }],
              }
            : candidate,
        ),
      };
      await this.storage.save(updated);
      return updated;
    });
  }

  /**
   * 把节点绑定到一个 dsh 会话（点节点时打开）。
   * 传空字符串表示解绑；只改我们自己的快照，不碰宿主的会话存储。
   */
  async bindSession(input: { id: string; nodeId: string; sessionId: string }): Promise<WorkflowSnapshot> {
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error('找不到该 workflow');
    if (typeof input.sessionId !== 'string') throw new Error('缺少 sessionId');
    const exists = snapshot.nodes.some((node) => node.node_id === input.nodeId);
    if (!exists) throw new Error('找不到节点');
    const sessionId = input.sessionId.trim();
    const updated: WorkflowSnapshot = {
      ...snapshot,
      nodes: snapshot.nodes.map((node) => {
        if (node.node_id !== input.nodeId) return node;
        if (sessionId === '') {
          const { session_id: _removed, ...rest } = node;
          return rest;
        }
        return { ...node, session_id: sessionId };
      }),
    };
    await this.storage.save(updated);
    return updated;
  }

  /** 按工作目录反查 workflow 快照。 */
  private async findByWorkingDirectory(workingDirectory: string): Promise<WorkflowSnapshot | null> {
    const dir = join(this.baseDir, 'workflows');
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const id = name.slice(0, -'.json'.length);
      try {
        const snapshot = await this.storage.load(id);
        if (snapshot !== null && snapshot.working_directory === workingDirectory) return snapshot;
      } catch {
        // 跳过损坏文件。
      }
    }
    return null;
  }

  /** 侧栏批量用：返回某工作区所有会话节点的状态映射（sessionId → current_state）。 */
  async getNodeStatesByDirectory(workingDirectory: string): Promise<Record<string, string>> {
    const snapshot = await this.findByWorkingDirectory(workingDirectory);
    if (snapshot === null) return {};
    const map: Record<string, string> = {};
    for (const node of snapshot.nodes) {
      if (typeof node.session_id === 'string' && node.session_id !== '') {
        map[node.session_id] = node.current_state;
      }
    }
    return map;
  }

  /** 确保工作区根目录有项目手册（项目总览 / 决策 / 要点）。 */
  private async ensureGlobalManual(workingDirectory: string): Promise<void> {
    if (typeof workingDirectory !== 'string' || workingDirectory === '') return;
    const wfDir = join(workingDirectory, WORKFLOW_SUBDIR);
    await fs.mkdir(wfDir, { recursive: true });
    await writeIfMissing(join(wfDir, globalManualFileName()), GLOBAL_MANUAL_TEMPLATE);
    await appendGitignore(workingDirectory);
  }

  /** 确保某目录是一个 workflow 工作区（没有快照就建，含根节点），返回快照。 */
  private async ensureWorkflow(workingDirectory: string, title: string): Promise<WorkflowSnapshot> {
    const existing = await this.findByWorkingDirectory(workingDirectory);
    if (existing !== null) return existing;
    const id = randomUUID();
    const snapshot: WorkflowSnapshot = {
      version: 2,
      workspace_id: id,
      title: title !== '' ? title : basename(workingDirectory),
      working_directory: workingDirectory,
      settings: DEFAULT_SETTINGS,
      nodes: [buildRootNode(id, DEFAULT_SETTINGS.default_max_depth, DEFAULT_SETTINGS.default_max_steps)],
    };
    await this.storage.save(snapshot);
    await this.ensureGlobalManual(workingDirectory);
    return snapshot;
  }

  /**
   * 自动认领：确保某会话已经是 workflow 节点（没有就建），返回节点摘要。
   * 会话所属工作区 = workingDirectory；工作区还不是 workflow 就顺带建快照 + 项目手册。
   */
  async ensureNode(input: { sessionId: string; workingDirectory: string }): Promise<{
    workflowId: string;
    nodeId: string;
    title: string;
    current_state: string;
  }> {
    const workingDirectory = input.workingDirectory.trim();
    if (workingDirectory === '') throw new Error('缺少工作目录');
    // 按工作目录串行：并发自动认领同一目录时，避免重复建 workflow / 重复建节点。
    return this.serial(`dir:${workingDirectory}`, async () => {
      const snapshot = await this.ensureWorkflow(workingDirectory, '');
      const existing = snapshot.nodes.find((node) => node.session_id === input.sessionId);
      if (existing !== undefined) {
        return {
          workflowId: snapshot.workspace_id,
          nodeId: existing.node_id,
          title: existing.title ?? '',
          current_state: existing.current_state,
        };
      }
      const nodeId = randomUUID();
      const title = '新会话';
      const wfDir = join(workingDirectory, WORKFLOW_SUBDIR);
      await fs.mkdir(wfDir, { recursive: true });
      await writeIfMissing(join(wfDir, sessionManualFileName(nodeId)), SESSION_MANUAL_TEMPLATE);
      const child: AgentNode = {
        ...buildRootNode(nodeId, DEFAULT_SETTINGS.default_max_depth, DEFAULT_SETTINGS.default_max_steps),
        parent_id: null,
        title,
        node_type: 'task',
        session_id: input.sessionId,
        depth: 0,
        // 新会话直接进「讨论中」：状态机里已经没有"未开始"这一态，也就没有"自动迁移"这条记录。
        current_state: 'discussing',
      };
      const updated: WorkflowSnapshot = { ...snapshot, nodes: [...snapshot.nodes, child] };
      await this.storage.save(updated);
      return { workflowId: snapshot.workspace_id, nodeId, title, current_state: child.current_state };
    });
  }

  /** 读会话手册全文 + 实施清单（供只读 UI 展示）；notesDir 指向 .workflow 根目录。 */
  async readNodeManual(workflowId: string, nodeId: string): Promise<{ manual: string; notesDir: string; checklist: Array<{ label: string; done: boolean }> } | null> {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) return null;
    const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
    if (node === undefined) return null;
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== 'string' || workingDir === '') return null;
    const wfDir = join(workingDir, WORKFLOW_SUBDIR);
    const manual = await readTextCapped(join(wfDir, sessionManualFileName(nodeId)), MANUAL_MAX_BYTES);
    return { manual, notesDir: wfDir, checklist: parseChecklist(manual) };
  }

  /** 读工作区项目手册（项目总览 / 决策 / 要点）。 */
  async readGlobalManual(workflowId: string): Promise<string> {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) return '';
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== 'string' || workingDir === '') return '';
    return readTextCapped(join(workingDir, WORKFLOW_SUBDIR, globalManualFileName()), GLOBAL_MANUAL_MAX_BYTES);
  }

  /**
   * 轻量取「实施清单 + 方案是否已写」：会话输入区每 3s 轮询用，带 mtime 缓存，
   * 文件没变就不重新读盘/解析。
   */
  async getManualMeta(workflowId: string, nodeId: string): Promise<{ checklist: Array<{ label: string; done: boolean }>; hasPlan: boolean } | null> {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) return null;
    const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
    if (node === undefined) return null;
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== 'string' || workingDir === '') return null;
    const file = join(workingDir, WORKFLOW_SUBDIR, sessionManualFileName(nodeId));
    let mtimeMs = 0;
    try {
      mtimeMs = (await fs.stat(file)).mtimeMs;
    } catch {
      // 文件不存在：mtime 保持 0，下面读到空串。
    }
    const key = `${workflowId}:${nodeId}`;
    const cached = this.manualMetaCache.get(key);
    if (cached !== undefined && cached.mtimeMs === mtimeMs) {
      return { checklist: cached.checklist, hasPlan: cached.hasPlan };
    }
    const manual = await readTextCapped(file, MANUAL_MAX_BYTES);
    const meta = { mtimeMs, checklist: parseChecklist(manual), hasPlan: parseHasPlan(manual) };
    this.manualMetaCache.set(key, meta);
    return { checklist: meta.checklist, hasPlan: meta.hasPlan };
  }

  /** 应用级设置（目前只有"切换状态时是否自动发送默认输入"）。存在 <baseDir>/app-settings.json。 */
  private appSettingsPath(): string {
    return join(this.baseDir, 'app-settings.json');
  }

  async getAppSettings(): Promise<{ autoSendEnterTrigger: boolean }> {
    try {
      const raw = JSON.parse(await fs.readFile(this.appSettingsPath(), 'utf8'));
      return { autoSendEnterTrigger: raw?.autoSendEnterTrigger === true };
    } catch {
      // 文件不存在或损坏：退回默认（不自动发送）。
      return { autoSendEnterTrigger: false };
    }
  }

  async updateAppSettings(patch: { autoSendEnterTrigger?: boolean }): Promise<{ autoSendEnterTrigger: boolean }> {
    const current = await this.getAppSettings();
    const next = {
      autoSendEnterTrigger: patch.autoSendEnterTrigger === undefined
        ? current.autoSendEnterTrigger
        : patch.autoSendEnterTrigger === true,
    };
    await fs.mkdir(this.baseDir, { recursive: true });
    const target = this.appSettingsPath();
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
    await fs.rename(tmp, target);
    return next;
  }

  /**
   * 读项目手册并按四类内容拆开，供注入按优先级取用。
   * 旧标题「要点 / 疑难杂症」也算「坑与防线」。
   */
  async readGlobalManualSections(workflowId: string): Promise<{
    overview: string;
    decisions: string;
    constraints: string;
    pitfalls: string;
  }> {
    const manual = await this.readGlobalManual(workflowId);
    const sections = splitManualSections(manual);
    const pick = (prefixes: string[]): string => sections
      .find((section) => prefixes.some((prefix) => section.title.startsWith(prefix)))
      ?.body ?? '';
    return {
      overview: pick(['项目总览']),
      decisions: pick(['决策记录']),
      constraints: pick(['约束']),
      pitfalls: pick(['坑与防线', '要点']),
    };
  }

  /**
   * 读手册全文（AI 专用工具的 read 动作）。
   * nodeId 为 null 时读项目手册；否则读该会话的会话手册。
   */
  async readManual(workflowId: string, nodeId: string | null): Promise<string> {
    if (nodeId === null) return this.readGlobalManual(workflowId);
    const manual = await this.readNodeManual(workflowId, nodeId);
    return manual === null ? '' : manual.manual;
  }

  /**
   * 按小节替换手册正文（AI 专用工具的唯一写入口）。
   * 只改指定 `## 小节` 的正文，标题与其它小节原样保留；路径由这里拼，调用方不能指定。
   */
  async replaceManualSection(input: {
    workflowId: string;
    nodeId: string | null;
    section: string;
    content: string;
  }): Promise<{ bytes: number; section: string }> {
    const { file, isSession } = await this.resolveManualFile(input.workflowId, input.nodeId);
    const maxBytes = isSession ? MANUAL_MAX_BYTES : GLOBAL_MANUAL_MAX_BYTES;
    const current = await this.readFileOrTemplate(file, isSession);
    let next: string;
    try {
      next = replaceSectionBody(current, input.section, input.content, MANUAL_SECTION_ALIASES[input.section] ?? []);
    } catch (error) {
      // 旧版项目手册没有「约束 / 坑与防线」这类新小节：追加而不是报错（只对项目手册生效）。
      if (isSession) throw error;
      next = appendSection(current, input.section, input.content);
    }
    const bytes = Buffer.byteLength(next, 'utf8');
    if (bytes > maxBytes) {
      throw new Error(`写入后手册会变成 ${bytes} 字节，超过上限 ${maxBytes} 字节；请精简内容`);
    }
    await writeTextAtomic(file, next);
    this.manualMetaCache.delete(`${input.workflowId}:${input.nodeId ?? ''}`);
    return { bytes, section: input.section };
  }

  /**
   * 勾选 / 取消勾选「实施顺序」里的一条（按条目文字精确匹配，不许新增或改写条目）。
   * @returns 勾选后的完整清单，方便模型确认进度。
   */
  async setChecklistItem(input: {
    workflowId: string;
    nodeId: string;
    label: string;
    done: boolean;
    /** 勾选时必填：这一层怎么验的、结果是什么。 */
    evidence?: string;
  }): Promise<Array<{ label: string; done: boolean }>> {
    const evidence = typeof input.evidence === 'string' ? input.evidence.trim() : '';
    if (input.done === true && evidence === '') {
      throw new Error('勾选需要 evidence：写清这一层怎么验的、结果是什么（例：跑 node test.mjs，12 项全过）。');
    }
    const { file } = await this.resolveManualFile(input.workflowId, input.nodeId);
    const current = await this.readFileOrTemplate(file, true);
    const items = parseChecklist(current);
    if (items.length === 0) throw new Error('这本手册的「实施顺序」里还没有条目，先用 workflow_manual 写入');
    const target = input.label.trim();
    const match = items.find((item) => item.label === target);
    if (match === undefined) {
      throw new Error(`「实施顺序」里没有「${target}」这条；可勾选的条目：${items.map((item) => item.label).join(' / ')}`);
    }
    const next = toggleChecklistLine(current, target, input.done, evidence);
    await writeTextAtomic(file, next);
    this.manualMetaCache.delete(`${input.workflowId}:${input.nodeId}`);
    return parseChecklist(next);
  }

  /** 会话/项目手册的绝对路径与"是不是会话手册"。 */
  private async resolveManualFile(workflowId: string, nodeId: string | null): Promise<{ file: string; isSession: boolean }> {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) throw new Error('找不到该 workflow');
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== 'string' || workingDir === '') throw new Error('该 workflow 没有工作目录');
    if (nodeId !== null) {
      const exists = snapshot.nodes.some((node) => node.node_id === nodeId);
      if (!exists) throw new Error('找不到节点');
    }
    const wfDir = join(workingDir, WORKFLOW_SUBDIR);
    await fs.mkdir(wfDir, { recursive: true });
    return {
      file: join(wfDir, nodeId === null ? globalManualFileName() : sessionManualFileName(nodeId)),
      isSession: nodeId !== null,
    };
  }

  private async readFileOrTemplate(file: string, isSession: boolean): Promise<string> {
    try {
      return await fs.readFile(file, 'utf8');
    } catch {
      return isSession ? SESSION_MANUAL_TEMPLATE : GLOBAL_MANUAL_TEMPLATE;
    }
  }
}
