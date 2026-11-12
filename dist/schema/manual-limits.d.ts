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
export declare const DEFAULT_MANUAL_LIMITS: ManualLimits;
/** 合法区间：太小会把模板本身卡死，太大会把系统提示撑爆。 */
export declare const MANUAL_LIMIT_MIN_CHARS = 20;
export declare const MANUAL_LIMIT_MAX_CHARS = 20000;
/** 清单行里「自检证据」的分隔标记：- [x] 条目 ｜ 自检：<证据> */
export declare const CHECK_EVIDENCE_MARK = " \uFF5C \u81EA\u68C0\uFF1A";
/**
 * 按字符（码点）计数。
 *
 * 不用 `text.length`：那是 UTF-16 代码单元数，一个 emoji 会算成 2 个字，
 * 和用户/AI 数出来的字数对不上，报错就会显得在瞎说。
 */
export declare function countManualChars(text: string): number;
/** 剥掉每行「｜ 自检：」之后的证据：证据是执行记录，不该占手册字数配额。 */
export declare function stripManualEvidence(text: string): string;
/** 把外部传入的上限收成合法值：缺省用默认、非整数四舍五入、越界夹到区间内。 */
export declare function sanitizeManualLimits(raw: unknown): ManualLimits;
/** 超限错误：带 code，调用方（工具埋点）靠它把"被闸门拒"和"参数错"分开。 */
export declare class ManualLimitError extends Error {
    readonly code = "manual-limit";
    constructor(message: string);
}
/**
 * 写入前的硬校验：超了直接抛错。
 * @returns 实际计入的字数（已剥离勾选证据）。
 */
export declare function assertSectionLimit(section: string, content: string, limits: ManualLimits): number;
/**
 * 整本会话手册的字数校验（勾选证据不计入）。
 * @returns 实际计入的字数。
 */
export declare function assertSessionManualTotal(manual: string, limits: ManualLimits): number;
//# sourceMappingURL=manual-limits.d.ts.map