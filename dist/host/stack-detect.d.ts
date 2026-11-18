import { type Stack } from '../engine/checkers/stack';
/** 读工作目录根 marker，返回技术栈；目录为空 / 读不到返回 null。 */
export declare function detectStack(workingDirectory: string): Promise<Stack | null>;
//# sourceMappingURL=stack-detect.d.ts.map