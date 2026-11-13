export interface CommandResult {
    ok: boolean;
    exit_code: number | null;
    timed_out: boolean;
    ms: number;
    tail: string;
}
export declare function runCommand(input: {
    cwd: string;
    command: string;
    timeoutMs?: number;
    /** 插件的 node_modules/.bin 绝对路径：加进 PATH 前面，让命令用插件自带的工具，不触发 npx 下载。 */
    binDir?: string;
}): Promise<CommandResult>;
//# sourceMappingURL=command-runner.d.ts.map