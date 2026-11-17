/**
 * 验收七项的纯规则：解析条目、校验报备形状、汇总进度。
 *
 * 全是字符串/数组处理、不读盘：盘上的锚点校验在仓储（数据层），
 * 这里只判「报备本身是否说得清」——分层跟手册那套一致。
 */
import { type CheckerResult, type VerificationState, type VerifyAnchor, type VerifyCheckDefinition, type VerifyFinding } from '../schema/verify-checks';
/** 报备里允许模型填写的那部分（round / at 由服务端补）。 */
export interface VerifyReportInput {
    result: 'pass' | 'deferred';
    summary: string;
    anchors: VerifyAnchor[];
    command?: string;
    findings?: VerifyFinding[];
    /** 检查器结果：第一层门禁读它，第二层门禁（兜底）靠它区分「跑失败」。 */
    checker?: CheckerResult;
}
/** 数字或名称 → 条目 id；两种都认不出时抛错，并把可选项列出来。 */
export declare function resolveVerifyCheckId(raw: unknown): number;
/** 证据路径的形状限制：只允许工作目录内的相对路径，挡绝对路径与 ../。 */
export declare function assertAnchorPathShape(file: string): void;
/** 有检查器的验收项现在从 VERIFY_CHECKS 的 checker.enforcement 推导，不再硬编码 id 集合。 */
/** 从报备入参里解析检查器结果：缺字段给 undefined，形状坏了抛错。 */
export declare function parseCheckerResult(raw: unknown): CheckerResult | undefined;
/**
 * 两层门禁判定（纯函数，不读盘）：
 * 第一层：有检查器的项报 pass 前必须带检查器结果，且 checker.ok=true（跑成且证据非空）。
 * 第二层：检查器失败（报错/非0/证据空，即 ok=false）才准 AI 兜底，但兜底必须可复跑（带 command）。
 * 返回 undefined = 通过；否则返回拒报理由。
 */
export declare function validateCheckerGate(check: VerifyCheckDefinition, checker: CheckerResult | undefined, result: 'pass' | 'deferred', command: string): string | undefined;
/**
 * 校验报备的「说得清」部分，通过则返回规范化后的输入。
 *
 * 分档口径：这里只判字段齐不齐、格式对不对；文件在不在、行号越不越界由仓储判
 * （要读盘）。两处都过，才算一份可落标记的报备。
 */
export declare function validateVerifyReportInput(check: VerifyCheckDefinition, raw: any): VerifyReportInput;
/**
 * 把快照里的未知值收成合法状态：缺字段 / 坏字段一律回落到七项全空。
 * 旧快照没有 verification 字段，走的就是这里——不做数据迁移。
 */
export declare function pickVerification(raw: unknown): VerificationState;
export interface VerificationSummary {
    total: number;
    pass: number;
    deferred: number;
    pending: number;
    complete: boolean;
}
export declare function summarizeVerification(state: VerificationState): VerificationSummary;
/** 未处理项的展示文本：报错与注入共用，避免两处措辞各写一套。 */
export declare function describePendingItems(state: VerificationState): string;
//# sourceMappingURL=verify-rules.d.ts.map