/**
 * 手册写入的字数上限。
 *
 * 口径是**字符数**，不是字节：人和 AI 数得清的是字，而注入预算算的是字节。
 * 两个口径分开，报错时两个数都给，才不会被"工具说没超、注入却截了"糊弄。
 *
 * 单独一个无依赖模块：数据层（仓储写入口）要判、接口层（工具报错）要引、
 * 客户端设置页还要显示默认值；不能把 zod 或仓储实现带进客户端包。
 */
export const DEFAULT_MANUAL_LIMITS = {
    constraints_chars: 300,
    plan_chars: 500,
    slice_pitfalls_chars: 300,
    session_total_chars: 2000,
};
/** 合法区间：太小会把模板本身卡死，太大会把系统提示撑爆。 */
export const MANUAL_LIMIT_MIN_CHARS = 20;
export const MANUAL_LIMIT_MAX_CHARS = 20000;
/** 清单行里「自检证据」的分隔标记：- [x] 条目 ｜ 自检：<证据> */
export const CHECK_EVIDENCE_MARK = ' ｜ 自检：';
/** 清单行里可选的「实施范围」分隔标记：- [ ] 条目 ｜ 范围：src/a,src/b。
 *  用于实现中的越界拦截：改动路径不在声明范围内就拒绝（没声明范围则不做范围限制）。 */
export const CHECK_SCOPE_MARK = ' ｜ 范围：';
/**
 * 按字符（码点）计数。
 *
 * 不用 `text.length`：那是 UTF-16 代码单元数，一个 emoji 会算成 2 个字，
 * 和用户/AI 数出来的字数对不上，报错就会显得在瞎说。
 */
export function countManualChars(text) {
    return Array.from(text).length;
}
/** 剥掉每行「｜ 自检：」之后的证据：证据是执行记录，不该占手册字数配额。 */
export function stripManualEvidence(text) {
    return text
        .split(/\r?\n/)
        .map((line) => {
        const cut = line.indexOf(CHECK_EVIDENCE_MARK);
        return cut === -1 ? line : line.slice(0, cut);
    })
        .join('\n');
}
/** 把外部传入的上限收成合法值：缺省用默认、非整数四舍五入、越界夹到区间内。 */
export function sanitizeManualLimits(raw) {
    const source = (raw ?? {});
    const read = (value, fallback) => {
        const number = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(number))
            return fallback;
        const rounded = Math.round(number);
        return Math.min(MANUAL_LIMIT_MAX_CHARS, Math.max(MANUAL_LIMIT_MIN_CHARS, rounded));
    };
    return {
        constraints_chars: read(source.constraints_chars, DEFAULT_MANUAL_LIMITS.constraints_chars),
        plan_chars: read(source.plan_chars, DEFAULT_MANUAL_LIMITS.plan_chars),
        slice_pitfalls_chars: read(source.slice_pitfalls_chars, DEFAULT_MANUAL_LIMITS.slice_pitfalls_chars),
        session_total_chars: read(source.session_total_chars, DEFAULT_MANUAL_LIMITS.session_total_chars),
    };
}
/** 有独立字数上限的小节 → 上限字段。没有映射的小节只受整本上限约束。 */
const SECTION_LIMIT_FIELD = {
    约束: 'constraints_chars',
    方案: 'plan_chars',
    垂直切片坑: 'slice_pitfalls_chars',
};
/** 超限时给的具体删法：报错要能照着改，不能只说"请精简"。 */
const SECTION_TRIM_HINTS = {
    约束: '删掉已被测试或代码固化验证过的条目、只对某个分支成立的临时约定；同类禁令合并成一条。',
    方案: '把已落地的实现细节挪回代码，方案里只留目标、分层和层间契约；长篇论证换成一句"不这么做会怎样"。',
    垂直切片坑: '只留「做完再改就贵」的坑（依赖方向 / 跨层 / 契约不一致），细节实现坑写项目手册，别塞这里。',
};
/** 超限错误：带 code，调用方（工具埋点）靠它把"被闸门拒"和"参数错"分开。 */
class ManualLimitError extends Error {
    code = 'manual-limit';
    constructor(message) {
        super(message);
        this.name = 'ManualLimitError';
    }
}
/**
 * 写入前的硬校验：超了直接抛错。
 *
 * 「方案」按层判：每个 `### ` 子节（除「目标与验收」）各自 ≤ plan_chars；
 * 「目标与验收」只受整本上限（它承担总述，不该被单层 500 卡）。
 * @returns 实际计入的字数（已剥离勾选证据）。
 */
export function assertSectionLimit(section, content, limits) {
    const chars = countManualChars(stripManualEvidence(content));
    const field = SECTION_LIMIT_FIELD[section];
    if (field === undefined)
        return chars;
    const limit = limits[field];
    const hint = SECTION_TRIM_HINTS[section] ?? '';
    if (section === '方案') {
        const subsections = splitPlanSubsections(content);
        if (subsections.length === 0) {
            // 没有 ### 分节（裸文本）：退回整份判 plan_chars，避免无结构的方案无上限。
            if (chars > limit) {
                throw new ManualLimitError(`「方案」现在 ${chars} 字，上限 ${limit} 字，超 ${chars - limit} 字。${hint}（强制上限，先精简再写）`);
            }
            return chars;
        }
        for (const subsection of subsections) {
            if (subsection.title.includes('目标'))
                continue;
            const subChars = countManualChars(stripManualEvidence(subsection.body));
            if (subChars > limit) {
                throw new ManualLimitError(`「方案 / ${subsection.title}」现在 ${subChars} 字，上限 ${limit} 字，超 ${subChars - limit} 字。${hint}（强制上限，先精简再写）`);
            }
        }
        return chars;
    }
    if (chars > limit) {
        throw new ManualLimitError(`「${section}」现在 ${chars} 字，上限 ${limit} 字，超 ${chars - limit} 字。${hint}（强制上限，先精简再写）`);
    }
    return chars;
}
/** 按 `### [N. ]标题` 切「方案」正文成子节（只给按层判字数用）。 */
function splitPlanSubsections(content) {
    const sections = [];
    let current = null;
    for (const line of content.split(/\r?\n/)) {
        const heading = /^###\s*(?:(\d+)\.\s*)?(.+?)\s*$/.exec(line);
        if (heading !== null) {
            if (current !== null)
                sections.push({ title: current.title, body: current.lines.join('\n').trim() });
            current = { title: heading[2] ?? '', lines: [] };
            continue;
        }
        if (current !== null)
            current.lines.push(line);
    }
    if (current !== null)
        sections.push({ title: current.title, body: current.lines.join('\n').trim() });
    return sections;
}
/**
 * 整本会话手册的字数校验（勾选证据不计入）。
 * @returns 实际计入的字数。
 */
export function assertSessionManualTotal(manual, limits) {
    const chars = countManualChars(stripManualEvidence(manual));
    const limit = limits.session_total_chars;
    if (chars > limit) {
        throw new ManualLimitError(`会话手册整本现在 ${chars} 字，上限 ${limit} 字，超 ${chars - limit} 字。`
            + '先合并同类条目、删掉已被新决策推翻的旧内容；勾选证据（｜ 自检：…）不计入字数，不用为了字数删证据。');
    }
    return chars;
}
//# sourceMappingURL=manual-limits.js.map