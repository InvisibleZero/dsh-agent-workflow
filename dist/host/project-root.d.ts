import { type Stack } from '../engine/checkers/stack';
export interface ProjectRef {
    /** 项目根（绝对路径）。 */
    root: string;
    /** 该项目根探测到的技术栈。 */
    stack: Stack;
}
export interface ProjectResolution {
    projects: ProjectRef[];
    /** 找不到项目根时的候选目录（绝对路径）；找到项目时为 []。 */
    candidates: string[];
}
/** 从某个路径向上找最近的 marker 目录 + 栈；一路到根都没有 → null。 */
export declare function nearestProject(path: string): Promise<ProjectRef | null>;
/** 工作目录下一级里带 marker 的目录（含工作目录自己），作为「找不到项目」时的候选。 */
export declare function listCandidateProjects(workingDirectory: string): Promise<string[]>;
/** 范围 → 项目根列表；范围为空 / 没命中时退回「工作目录所属的项目」；连这个都没有才给候选。 */
export declare function resolveProjects(workingDirectory: string, scope: string[]): Promise<ProjectResolution>;
//# sourceMappingURL=project-root.d.ts.map