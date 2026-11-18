export interface LocateDeps {
    env?: NodeJS.ProcessEnv;
    home?: string;
    platform?: NodeJS.Platform;
    exists?: (file: string) => Promise<boolean>;
}
/** DSH 自带的 Python：环境变量 → dsh-runtimes 已知位置 → null（不退回裸 python，避免误用别的环境）。 */
export declare function resolvePython(deps?: LocateDeps): Promise<string | null>;
/** 从 Python 解释器路径推出 console script 目录：Win 是 `<python>/Scripts`，Unix 是 `<python>/bin`。 */
export declare function pythonScriptsDir(pythonPath: string): string;
/**
 * import-linter 没有 `__main__`（`python -m importlinter` 跑不起来），只能用 console script `lint-imports`。
 * 给它绝对路径，避免依赖 PATH。
 */
export declare function lintImportsPath(pythonPath: string): string;
/**
 * 项目自己的虚拟环境 Python（有项目依赖）：`.venv` / `venv` 优先，找不到返回 null。
 * 跑项目测试（pytest）必须用它——DSH 自带的 Python 只有插件工具，没有项目依赖（jieba / pyyaml 等）。
 */
export declare function resolveProjectPython(projectRoot: string, deps?: LocateDeps): Promise<string | null>;
//# sourceMappingURL=tool-locate.d.ts.map