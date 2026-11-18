import { type Stack } from '../engine/checkers/stack';
export interface StackDetection {
    /** 探测到的技术栈；null = 一路向上都没有 marker。 */
    stack: Stack | null;
    /** 命中 marker 的项目根目录；null = 没命中。 */
    root: string | null;
}
/** 从工作目录向上逐级找 marker，返回技术栈 + 项目根。 */
export declare function detectStack(workingDirectory: string): Promise<StackDetection>;
//# sourceMappingURL=stack-detect.d.ts.map