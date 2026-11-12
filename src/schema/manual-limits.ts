/**
 * 手册写入的字数上限。
 *
 * 口径是**字符数**，不是字节：人和 AI 数得清的是字，而注入预算算的是字节。
 * 两个口径分开，报错时两个数都给，才不会被"工具说没超、注入却截了"糊弄。
 *
 * 单独一个无依赖模块：数据层（仓储写入口）要判、接口层（工具报错）要引、
 * 客户端设置页还要显示默认值；不能把 zod 或仓储实现带进客户端包。
 */

/** 三档上限：约束 / 红线、方案、会话手册整本。 */
export interface ManualLimits {
  /** 项目手册「约束 / 红线」的字符上限。 */
  constraints_chars: number;
  /** 会话手册「方案」小节的字符上限。 */
  plan_chars: number;
  /** 会话手册整本的字符上限（勾选证据不计入）。 */
  session_total_chars: number;
}

export const DEFAULT_MANUAL_LIMITS: ManualLimits = {
  constraints_chars: 300,
  plan_chars: 1200,
  session_total_chars: 2000,
};

/** 合法区间：太小会把模板本身卡死，太大会把系统提示撑爆。 */
export const MANUAL_LIMIT_MIN_CHARS = 20;
export const MANUAL_LIMIT_MAX_CHARS = 20000;

/** 清单行里「自检证据」的分隔标记：- [x] 条目 ｜ 自检：<证据> */
export const CHECK_EVIDENCE_MARK = ' ｜ 自检：';

/**
 * 按字符（码点）计数。
 *
 * 不用 `text.length`：那是 UTF-16 代码单元数，一个 emoji 会算成 2 个字，
 * 和用户/AI 数出来的字数对不上，报错就会显得在瞎说。
 */
export function countManualChars(text: string): number {
  return Array.from(text).length;
}

/** 剥掉每行「｜ 自检：」之后的证据：证据是执行记录，不该占手册字数配额。 */
export function stripManualEvidence(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const cut = line.indexOf(CHECK_EVIDENCE_MARK);
      return cut === -1 ? line : line.slice(0, cut);
    })
    .join('\n');
}

/** 把外部传入的上限收成合法值：缺省用默认、非整数四舍五入、越界夹到区间内。 */
export function sanitizeManualLimits(raw: unknown): ManualLimits {
  const source = (raw ?? {}) as Record<string, unknown>;
  const read = (value: unknown, fallback: number): number => {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return fallback;
    const rounded = Math.round(number);
    return Math.min(MANUAL_LIMIT_MAX_CHARS, Math.max(MANUAL_LIMIT_MIN_CHARS, rounded));
  };
  return {
    constraints_chars: read(source.constraints_chars, DEFAULT_MANUAL_LIMITS.constraints_chars),
    plan_chars: read(source.plan_chars, DEFAULT_MANUAL_LIMITS.plan_chars),
    session_total_chars: read(source.session_total_chars, DEFAULT_MANUAL_LIMITS.session_total_chars),
  };
}

/** 有独立字数上限的小节 → 上限字段。没有映射的小节只受整本上限约束。 */
const SECTION_LIMIT_FIELD: Record<string, keyof ManualLimits> = {
  约束: 'constraints_chars',
  方案: 'plan_chars',
};

/** 超限时给的具体删法：报错要能照着改，不能只说"请精简"。 */
const SECTION_TRIM_HINTS: Record<string, string> = {
  约束: '删掉已被测试或代码固化验证过的条目、只对某个分支成立的临时约定；同类禁令合并成一条。',
  方案: '把已落地的实现细节挪回代码，方案里只留目标、分层和层间契约；长篇论证换成一句"不这么做会怎样"。',
};

/** 超限错误：带 code，调用方（工具埋点）靠它把"被闸门拒"和"参数错"分开。 */
export class ManualLimitError extends Error {
  readonly code = 'manual-limit';

  constructor(message: string) {
    super(message);
    this.name = 'ManualLimitError';
  }
}

/**
 * 写入前的硬校验：超了直接抛错。
 * @returns 实际计入的字数（已剥离勾选证据）。
 */
export function assertSectionLimit(section: string, content: string, limits: ManualLimits): number {
  const chars = countManualChars(stripManualEvidence(content));
  const field = SECTION_LIMIT_FIELD[section];
  if (field === undefined) return chars;
  const limit = limits[field];
  if (chars > limit) {
    const hint = SECTION_TRIM_HINTS[section] ?? '';
    throw new ManualLimitError(
      `「${section}」现在 ${chars} 字，上限 ${limit} 字，超 ${chars - limit} 字。${hint}（强制上限，先精简再写）`,
    );
  }
  return chars;
}

/**
 * 整本会话手册的字数校验（勾选证据不计入）。
 * @returns 实际计入的字数。
 */
export function assertSessionManualTotal(manual: string, limits: ManualLimits): number {
  const chars = countManualChars(stripManualEvidence(manual));
  const limit = limits.session_total_chars;
  if (chars > limit) {
    throw new ManualLimitError(
      `会话手册整本现在 ${chars} 字，上限 ${limit} 字，超 ${chars - limit} 字。`
      + '先合并同类条目、删掉已被新决策推翻的旧内容；勾选证据（｜ 自检：…）不计入字数，不用为了字数删证据。',
    );
  }
  return chars;
}
