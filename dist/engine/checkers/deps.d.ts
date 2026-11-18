/**
 * 第 2 项：依赖检查。
 *
 * 在工作目录跑 dependency-cruiser，再读它的 JSON 产物。
 * 判据：severity=error 的违规为空（循环依赖、跨层引用都算违规）。
 *
 * 致谢：dependency-cruiser（MIT）——
 * https://github.com/sverweij/dependency-cruiser
 */
import { type Checker } from './types';
import type { Stack } from './stack';
/** 按技术栈选依赖取证命令。 */
export declare function depsCommandFor(stack: Stack, target: string): string;
export declare const depsChecker: Checker;
//# sourceMappingURL=deps.d.ts.map