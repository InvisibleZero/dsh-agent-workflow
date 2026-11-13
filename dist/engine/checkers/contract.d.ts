/**
 * 第 1 项：契约测试。
 *
 * 只读测试运行结果（vitest `--reporter=json` 的产物），不自己跑测试。
 * 判据：有用例、没有失败；空跑不算数——「0 个用例」和「全过」是两回事。
 */
import { type CheckResult, type Checker } from './types';
/** 第 1 / 4 项共用的判定：测试结果证据怎么判。 */
export declare function checkTestEvidence(data: unknown, evidence: string, command: string): CheckResult;
export declare const contractChecker: Checker;
//# sourceMappingURL=contract.d.ts.map