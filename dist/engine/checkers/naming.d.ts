/**
 * 命名审查检查器（第 5 项协助型 / check_naming：只判封杀词）。
 *
 * 跑插件自带脚本 naming-scan.mjs 扫 src/ 的封杀词，读 naming.json 判定：
 * 有封杀词违规就报不合格。语义部分（反向冗长 / 跨模块暴露 / 前缀越界）由 AI 判，不挂检查器。
 */
import { type Checker } from './types';
export declare const namingChecker: Checker;
//# sourceMappingURL=naming.d.ts.map