/**
 * 第 3 项：死代码扫描。
 *
 * 在工作目录跑 knip，再读它的 JSON 产物。
 * 判据：未使用文件 / 导出 / 类型 / 依赖一个都没有。
 *
 * 字段以 knip 6 的真实产物为准（2026-11-13 实测）：
 *   { issues: [{ file, files: [{name}], exports: [], types: [], dependencies: [], devDependencies: [], unlisted: [] }] }
 * 注意未使用文件在 `issues[].files[]`，不在顶层——按顶层读会漏报。
 *
 * 致谢：knip（ISC）—— https://github.com/webpro-nl/knip
 */
import { type Checker } from './types';
export declare const deadcodeChecker: Checker;
//# sourceMappingURL=deadcode.d.ts.map