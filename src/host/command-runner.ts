// @ts-nocheck
/**
 * 命令执行器：跑「插件内置」的检查命令（vitest / depcruise / knip）。
 *
 * 安全边界：命令来自检查器定义（代码里的常量），调用方只能选跑哪几项，
 * 不能传命令、不能拼参数——所以这里不会执行模型给的任意字符串。
 *
 * 约束：
 *   - cwd = 工作目录（被检查的项目）
 *   - 超时 120 秒，到点 SIGKILL
 *   - 输出只留尾部 4KB，失败时给调用方看
 *   - 走 shell 是为了支持 `> .workflow/evidence/x.json` 这类重定向；命令本身是常量
 */
import { spawn } from 'node:child_process';
import { delimiter } from 'node:path';

export interface CommandResult {
  ok: boolean;
  exit_code: number | null;
  timed_out: boolean;
  ms: number;
  tail: string;
}

const COMMAND_TIMEOUT_MS = 120_000;
const TAIL_LIMIT = 4096;

export function runCommand(input: {
  cwd: string;
  command: string;
  timeoutMs?: number;
  /** 插件的 node_modules/.bin 绝对路径：加进 PATH 前面，让命令用插件自带的工具，不触发 npx 下载。 */
  binDir?: string;
}): Promise<CommandResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timeoutMs = typeof input.timeoutMs === 'number' && input.timeoutMs > 0
      ? input.timeoutMs
      : COMMAND_TIMEOUT_MS;
    let tail = '';
    let timedOut = false;
    let settled = false;

    const finish = (result: CommandResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;
    try {
      // 把插件自带的工具目录加进 PATH 前面：命令里直接用 depcruise / vitest / knip 这类
      // 插件自带的二进制，而不是 npx 从被检查的项目目录去解析（找不到会触发下载）。
      const env = typeof input.binDir === 'string' && input.binDir !== ''
        ? { ...process.env, PATH: `${input.binDir}${delimiter}${process.env.PATH ?? ''}` }
        : undefined;
      child = spawn(input.command, {
        cwd: input.cwd,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env,
      });
    } catch (error) {
      finish({
        ok: false,
        exit_code: null,
        timed_out: false,
        ms: Date.now() - startedAt,
        tail: `[spawn failed] ${String((error as Error)?.message ?? error)}`,
      });
      return;
    }

    const collect = (chunk: unknown): void => {
      tail += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      if (tail.length > TAIL_LIMIT) tail = tail.slice(-TAIL_LIMIT);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        // shell 模式下 child 是 cmd.exe / sh，只杀它不会带走真正的子进程，
        // 所以 Windows 用 taskkill /T 杀整棵树，其他平台杀进程组。
        const pid = child.pid;
        if (typeof pid === 'number') {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
          } else {
            child.kill('SIGKILL');
          }
        }
      } catch {
        // 已经退出：交给 close 收尾。
      }
    }, timeoutMs);

    child.on('error', (error: unknown) => {
      clearTimeout(timer);
      finish({
        ok: false,
        exit_code: null,
        timed_out: timedOut,
        ms: Date.now() - startedAt,
        tail: `${tail}\n[spawn failed] ${String((error as Error)?.message ?? error)}`.trim(),
      });
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      const exitCode = typeof code === 'number' ? code : null;
      finish({
        ok: !timedOut && exitCode === 0,
        exit_code: exitCode,
        timed_out: timedOut,
        ms: Date.now() - startedAt,
        tail,
      });
    });
  });
}
