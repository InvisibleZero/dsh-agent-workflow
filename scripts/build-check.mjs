#!/usr/bin/env node
/**
 * 构建与冒烟检查（check_build 的 autoRun 脚本）。
 *
 * 按技术栈分流：
 *   - JS（根有 package.json）：跑 `npm run build`，成功再 `npm run smoke`。
 *   - Python（根有 pyproject.toml）：本栈没有 build 步骤 → 写 skipped + 原因，不跑 npm。
 *   - 其它 / 空目录：写 skipped + 原因。
 * 脚本本身总是正常退出：判合格由 check_build 的 check 读 build.json 做，不靠脚本退出码。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const EVIDENCE_DIR = join('.workflow', 'evidence');
const EVIDENCE = join(EVIDENCE_DIR, 'build.json');

/** 跑一条命令，收退出码 + 尾部输出。 */
function run(command) {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd: process.cwd(), shell: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let tail = '';
    const collect = (chunk) => {
      tail += String(chunk);
      if (tail.length > 1000) tail = tail.slice(-1000);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', (error) => resolve({ exit: null, tail: `${tail}\n[spawn failed] ${String(error?.message ?? error)}` }));
    child.on('close', (code) => resolve({ exit: code, tail }));
  });
}

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  // 非 JS 项目没有 npm 构建步骤：明确写 skipped，别跑 npm 拿一个垃圾退出码（如 4294963238）。
  if (!existsSync('package.json')) {
    const stack = existsSync('pyproject.toml') ? 'python' : 'unknown';
    const reason = stack === 'python'
      ? '本栈没有 build 步骤（Python 无构建产物），跳过 check_build'
      : '找不到 package.json / pyproject.toml，无法判断构建命令，跳过 check_build';
    await writeFile(EVIDENCE, `${JSON.stringify({ stack, skipped: true, reason }, null, 2)}\n`, 'utf8');
    return;
  }

  const build = await run('npm run build');
  const smoke = build.exit === 0 ? await run('npm run smoke') : { exit: null, tail: '' };
  let bytes = 0;
  try { bytes = (await readFile(join('dist', 'client-bundle.js'))).length; } catch { /* 读不到就 0 */ }
  const payload = {
    stack: 'js',
    build_exit: build.exit,
    smoke_exit: smoke.exit,
    ok: build.exit === 0 && smoke.exit === 0,
    bytes,
    build_tail: build.tail,
    smoke_tail: smoke.tail,
  };
  await writeFile(EVIDENCE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(String(error?.stack ?? error));
    process.exitCode = 1;
  });
}
