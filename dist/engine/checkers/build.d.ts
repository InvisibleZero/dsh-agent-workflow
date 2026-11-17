/**
 * 构建与冒烟检查（表现层小验收 / check_build）。
 *
 * 跑插件自带脚本 build-check.mjs（npm run build + npm run smoke），读 build.json 判定：
 * build 或 smoke 退出码非 0 都不合格。
 */
import { type Checker } from './types';
export declare const buildChecker: Checker;
//# sourceMappingURL=build.d.ts.map