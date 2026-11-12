/**
 * 验收七项：固定条目（对应全局「七项体检」）。
 *
 * 只放常量与类型，**不引 zod**：客户端徽标要读条目名，客户端包里不能出现 zod
 * （client-bundle-purity 会拦）。
 *
 * 七项的顺序与名称是协议的一部分：报备按 id 落标记，不按文本匹配——
 * 文本是人写的，改一个字就再也勾不上（和手册「实施顺序」按文本匹配相反）。
 */
export interface VerifyCheckDefinition {
    id: number;
    name: string;
    /** 测试类必须带复跑命令：不写命令的「跑过了」等于没说怎么验。 */
    needs_command: boolean;
    /** 一句话判据：注入给模型看，也当菜单提示。 */
    judge: string;
}
export declare const VERIFY_CHECKS: readonly VerifyCheckDefinition[];
/** 条目状态：○ 待处理 / ✓ 通过 / ？ 问询（查出问题但本轮不修）。 */
export type VerifyMark = 'pending' | 'pass' | 'deferred';
/** 证据锚点：工作目录内的相对路径 + 可选行号。程序只校验它存在，不校验内容。 */
export interface VerifyAnchor {
    file: string;
    line?: number;
}
/** 问询项的发现：位置 / 问题 / 为什么不修 / 影响什么。四条都是文字，只校验非空。 */
export interface VerifyFinding {
    location: string;
    problem: string;
    why_not_fixed: string;
    impact: string;
}
export interface VerifyReport {
    /** 报备所属验收轮次：轮次不匹配的报备自动失效（重进验收要重报）。 */
    round: number;
    result: 'pass' | 'deferred';
    summary: string;
    anchors: VerifyAnchor[];
    command?: string;
    findings?: VerifyFinding[];
    /** 服务端时间戳，客户端不传。 */
    at: string;
}
export interface VerifyItem {
    id: number;
    mark: VerifyMark;
    report: VerifyReport | null;
}
export interface VerificationState {
    /** 第几次进「验收中」：每进一次 +1，旧报备凭轮次失效。 */
    round: number;
    items: VerifyItem[];
}
/** 标记的显示符号：徽标、菜单、注入文本共用一套，避免三处各写一份。 */
export declare function verifyMarkSymbol(mark: VerifyMark): string;
/** 按当前轮次造一份全空清单（七项固定顺序）。 */
export declare function createVerification(round: number): VerificationState;
//# sourceMappingURL=verify-checks.d.ts.map