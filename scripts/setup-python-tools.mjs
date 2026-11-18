#!/usr/bin/env node
/**
 * 把 Python 三件套（pytest / pytest-json-report / import-linter / vulture）离线装进 DSH 自带的 Python。
 *
 * 设计：
 *   - 运行时不碰网络：只认 `python-wheels/` 里的本地 wheel（`pip install --no-index`）。
 *   - Python 解释器：优先 `DSH_PYTHON` 环境变量；没设就按 dsh-runtimes 已知路径找
 *     （官方商店装包不一定设环境变量，不能因此直接跳过）。
 *   - 没 wheel 目录 / 找不到 Python / 装失败：一律 warn 后正常退出，绝不阻断 npm install。
 *     工具缺了，checker 会走「工具缺失 → 降级 AI 证据」，不会卡死。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(fileURLToPath(import.meta.url), '..', '..');
const wheelsDir = join(packageRoot, 'python-wheels');

/** 找 DSH 自带的 Python：环境变量 → dsh-runtimes 已知位置 → null（不退回裸 python）。 */
function resolvePython() {
  const fromEnv = (process.env.DSH_PYTHON ?? '').trim();
  if (fromEnv !== '' && existsSync(fromEnv)) return fromEnv;
  const candidates = process.platform === 'win32'
    ? [join(homedir(), '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'python.exe')]
    : [join(homedir(), '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'bin', 'python3')];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const python = resolvePython();
if (python === null) {
  console.warn('[setup-python-tools] 没找到 DSH 自带的 Python（DSH_PYTHON 未设且 dsh-runtimes 下没有），跳过（Python 检查器会降级 AI 证据）');
  process.exit(0);
}
if (!existsSync(wheelsDir)) {
  console.warn('[setup-python-tools] 未找到 python-wheels/，跳过（Python 检查器会降级 AI 证据）');
  process.exit(0);
}
const wheels = readdirSync(wheelsDir).filter((name) => name.endsWith('.whl'));
if (wheels.length === 0) {
  console.warn('[setup-python-tools] python-wheels/ 是空的，跳过（Python 检查器会降级 AI 证据）');
  process.exit(0);
}

const packages = ['pytest', 'pytest-json-report', 'import-linter', 'vulture'];
console.log(`[setup-python-tools] 离线安装 ${packages.join(' / ')} → ${python}`);
const result = spawnSync(
  python,
  ['-m', 'pip', 'install', '--no-index', '--find-links', wheelsDir, ...packages],
  { stdio: 'inherit' },
);
if (result.status !== 0) {
  console.warn('[setup-python-tools] 安装失败，Python 检查器会降级 AI 证据（不影响插件其它功能）');
}
