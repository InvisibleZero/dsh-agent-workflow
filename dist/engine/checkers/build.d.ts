/**
 * 构建与冒烟检查（表现层小验收 / check_build）。
 *
 * 跑插件自带脚本 build-check.mjs，读 build.json 判定：
 * - JS 栈：build 或 smoke 退出码非 0 都不合格。
 * - 非 JS 栈（Python 等）：没有构建步骤，脚本写 skipped，这里判「通过 + 说明」，不报垃圾退出码。
 */
import { type Checker } from './types';
export declare const buildChecker: Checker;
//# sourceMappingURL=build.d.ts.map