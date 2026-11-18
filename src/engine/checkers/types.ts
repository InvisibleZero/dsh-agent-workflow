/**
 * 检查器的契约：纯函数、不读盘、不碰 DOM。
 *
 * 检查器只做一件事：拿一份已经解析好的证据 JSON，判断合格不合格，把不合格项列出来。
 * 跑命令、读文件、传参、审计都在接口层（invokeChecker），这一层可以脱离文件系统单测。
 *
 * 证据文件是接口层「先跑命令、再读产物」的中间物：autoRun 的检查器会先执行插件自带的
 * 工具（vitest / depcruise / knip）生成证据，再读它判定。检查器本身不碰文件系统、
 * 不碰项目源码，只判接口层喂进来的 JSON。
 */

import type { Stack } from './stack';

/** 检查器跑命令时用到的工具绝对路径（非 JS 栈）。缺省 = 该工具没找到。 */
export interface CheckerTools {
  /** DSH 自带 Python（插件工具装在这里：vulture / lint-imports）。 */
  python?: string;
  /** 项目自己的 Python（`.venv` / `venv`，带项目依赖）：跑 pytest 用它。 */
  projectPython?: string;
  /** import-linter 没有 __main__，只能用 console script `lint-imports`。 */
  lintImports?: string;
}

export interface CheckerFinding {
  /** 违规位置：`文件:行` 或模块名；缺产物时写证据文件路径。 */
  location: string;
  /** 一句话说清哪里不合格。 */
  problem: string;
}

export interface CheckResult {
  ok: boolean;
  findings: CheckerFinding[];
  /** 关键数字（用例数、违规数、耗时），进审计与返回值，便于事后核对。 */
  stats: Record<string, number>;
}

export interface Checker {
  /** 注册表 id：工具定义里的 run.checker 就是它。 */
  id: string;
  /** 设置页与目录里显示的一句话说明。 */
  name: string;
  /** 证据文件（相对 `.workflow/evidence/`）。 */
  evidence: string;
  /** 默认目标：目录或测试路径；不需要目标的工具给空串。 */
  defaultTarget: string;
  /** 是否由插件直接执行命令；false = 只读现成产物。 */
  autoRun: boolean;
  /** 是否必须由调用方提供 target（压测地址这类没有合理默认值的）。 */
  requiresTarget?: boolean;
  /**
   * 插件自带脚本（相对 `scripts/`）：和 buildCommand 二选一。
   * 用脚本时宿主直接 `node <packageRoot>/scripts/<script>`，不经过 cmd 拼参数，
   * 适合「读证据 + 改项目源码 + 重扫」这类多步动作（埋点检测）。
   */
  script?: string;
  /**
   * 各技术栈的取证命令（栈 → 命令模板）。缺省栈或未提供时退回 buildCommand。
   * tools 是宿主定位到的工具绝对路径（Python / go），命令用绝对路径不靠 PATH。
   */
  buildCommands?: Partial<Record<Stack, (target: string, tools: CheckerTools) => string>>;
  /**
   * 各技术栈的证据归一化：工具原生产物（原始文本）→ 判据认识的统一 JSON。
   * 缺省栈、或没有对应归一化时，原样喂给 check()（JS 产物直接是判据形状）。
   */
  normalizers?: Partial<Record<Stack, (raw: string) => unknown>>;
  /**
   * 拼命令：只把 target 填进模板，不做别的拼接。
   * 命令模板是代码里的常量，调用方不能传命令本身——这是执行边界。
   * script 型检查器可不实现。
   */
  buildCommand?(target: string): string;
  /** 纯函数：evidence_json 为 null 表示证据文件不存在。 */
  check(evidence_json: unknown): CheckResult;
}

/** 缺产物时的统一结果：告诉调用方缺哪个文件、用什么命令生成。 */
export function missingEvidence(evidence: string, command: string): CheckResult {
  return {
    ok: false,
    findings: [{ location: evidence, problem: `缺证据文件：先跑 \`${command}\` 生成 .workflow/evidence/${evidence}` }],
    stats: {},
  };
}

/** 从任意 JSON 里安全取对象；不是对象就当空对象。 */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** 从任意 JSON 里安全取数组。 */
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** 安全取数字，取不到给 0。 */
export function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 安全取字符串。 */
export function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
