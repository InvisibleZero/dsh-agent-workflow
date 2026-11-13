/**
 * 第 7 项：回归与压测。
 *
 * 用 autocannon 跑压测（随插件分发），结果落 `.workflow/evidence/regression.json`。
 * 压测目标没有合理默认，所以调用时必须传 target（形如 http://127.0.0.1:3000）。
 *
 * 两种证据格式都认：
 *   1. autocannon 原始结果（`requests.total` / `errors` / `timeouts` / `duration`）
 *   2. 约定格式（`total` / `failed` / `durationMs`）——项目自己跑压测时按这个落盘
 *
 * 致谢：autocannon（MIT）—— https://github.com/mcollina/autocannon
 */
import { type Checker } from './types';
export declare const regressionChecker: Checker;
//# sourceMappingURL=regression.d.ts.map