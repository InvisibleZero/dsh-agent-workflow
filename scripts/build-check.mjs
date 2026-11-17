#!/usr/bin/env node
/**
 * 构建与冒烟检查（check_build 的 autoRun 脚本）。
 *
 * 跑 `npm run build`，成功再跑 `npm run smoke`，把结果落 `.workflow/evidence/build.json`。
 * 脚本本身总是正常退出：判合格由 check_build 的 check 读 build.json 做，不靠脚本退出码。
 */
import { spawn } from 'node:child_process';
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
  const build = await run('npm run build');
  const smoke = build.exit === 0 ? await run('npm run smoke') : { exit: null, tail: '' };
  let bytes = 0;
  try { bytes = (await readFile(join('dist', 'client-bundle.js'))).length; } catch { /* 读不到就 0 */ }
  const payload = {
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
