#!/usr/bin/env node
/**
 * 把 Python 三件套（pytest / pytest-json-report / import-linter / vulture）离线装进 DSH 自带的 Python。
 *
 * 设计：
 *   - 只认 `python-wheels/` 里的本地 wheel（纯 Python，一套跨平台），`pip install --no-index`，
 *     运行时不碰网络 —— 用户 clone / 安装插件即用。
 *   - 没设 DSH_PYTHON、没 wheel 目录、装失败：一律 warn 后正常退出，绝不阻断 npm install。
 *     工具缺了，checker 会走「工具缺失 → 降级 AI 证据」，不会卡死。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(fileURLToPath(import.meta.url), '..', '..');
const wheelsDir = join(packageRoot, 'python-wheels');

const python = (process.env.DSH_PYTHON ?? '').trim();
if (python === '') {
  console.warn('[setup-python-tools] 未设置 DSH_PYTHON，跳过（Python 检查器会降级 AI 证据）');
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
