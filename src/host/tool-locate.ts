// @ts-nocheck
/**
 * 工具定位：非 JS 工具不靠 PATH —— DSH 宿主进程的 PATH 可能跟用户 shell 不一致
 * （GUI 启动不读 .zshrc，Linux/macOS 上装的命令就不在宿主 PATH 里）。
 * 所以主动定位 DSH 自带的 Python（+ 它的 console script 目录）。Go 支持已撤，不再探测 go / staticcheck。
 *
 * 只负责「找到路径」，跑不跑得动由接口层决定（找不到就降级 AI 证据）。
 * deps 可注入，纯逻辑可单测。
 */
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface LocateDeps {
  env?: NodeJS.ProcessEnv;
  home?: string;
  platform?: NodeJS.Platform;
  exists?: (file: string) => Promise<boolean>;
}

async function defaultExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** DSH 自带的 Python：环境变量 → dsh-runtimes 已知位置 → null（不退回裸 python，避免误用别的环境）。 */
export async function resolvePython(deps: LocateDeps = {}): Promise<string | null> {
  const env = deps.env ?? process.env;
  const home = deps.home ?? homedir();
  const platform = deps.platform ?? process.platform;
  const exists = deps.exists ?? defaultExists;

  const fromEnv = typeof env.DSH_PYTHON === 'string' ? env.DSH_PYTHON.trim() : '';
  if (fromEnv !== '' && await exists(fromEnv)) return fromEnv;

  const candidates = platform === 'win32'
    ? [join(home, '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'python.exe')]
    : [join(home, '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'bin', 'python3')];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

/** 从 Python 解释器路径推出 console script 目录：Win 是 `<python>/Scripts`，Unix 是 `<python>/bin`。 */
export function pythonScriptsDir(pythonPath: string): string {
  const dir = dirname(pythonPath);
  return process.platform === 'win32' ? join(dir, 'Scripts') : dir;
}

/**
 * import-linter 没有 `__main__`（`python -m importlinter` 跑不起来），只能用 console script `lint-imports`。
 * 给它绝对路径，避免依赖 PATH。
 */
export function lintImportsPath(pythonPath: string): string {
  return join(pythonScriptsDir(pythonPath), process.platform === 'win32' ? 'lint-imports.exe' : 'lint-imports');
}

/**
 * 项目自己的虚拟环境 Python（有项目依赖）：`.venv` / `venv` 优先，找不到返回 null。
 * 跑项目测试（pytest）必须用它——DSH 自带的 Python 只有插件工具，没有项目依赖（jieba / pyyaml 等）。
 */
export async function resolveProjectPython(projectRoot: string, deps: LocateDeps = {}): Promise<string | null> {
  const platform = deps.platform ?? process.platform;
  const exists = deps.exists ?? defaultExists;
  if (typeof projectRoot !== 'string' || projectRoot === '') return null;
  const candidates = platform === 'win32'
    ? [
      join(projectRoot, '.venv', 'Scripts', 'python.exe'),
      join(projectRoot, 'venv', 'Scripts', 'python.exe'),
    ]
    : [
      join(projectRoot, '.venv', 'bin', 'python3'),
      join(projectRoot, 'venv', 'bin', 'python3'),
    ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}
