import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

/**
 * 把宿主半 src/host.ts 打成单文件 dist/host.js。
 *
 * 为什么要单文件：tsc 产出的 dist/host.js 里是「不带扩展名」的相对 import
 * （`./host/workflow-repository`），Node 的 ESM 解析不了（ERR_MODULE_NOT_FOUND）。
 * 用 esbuild 把相对模块内联，node 内置模块与 zod 保持 external（运行时能从
 * node_modules 解析），这样宿主半在 dsh 的 Node 进程里一定能加载。
 *
 * 为什么优先走 CLI：esbuild 的 JS API 会用管道 stdio 拉起子进程，
 * 在受限沙箱里这一步会被 EPERM 拦掉；CLI 直接跑、继承当前 stdio 就没这问题。
 */
const args = [
  'src/host.ts',
  '--bundle',
  '--format=esm',
  '--platform=node',
  '--target=node20',
  '--outfile=dist/host.js',
  '--packages=external',
  '--log-level=warning',
];

const require = createRequire(import.meta.url);

function resolveBinary() {
  const platformPackage = `@esbuild/${process.platform}-${process.arch}`;
  try {
    const manifestPath = require.resolve(`${platformPackage}/package.json`);
    return manifestPath.replace(/package\.json$/, process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild');
  } catch {
    return undefined;
  }
}

const binary = resolveBinary();
const result = binary === undefined
  ? { status: undefined }
  : spawnSync(binary, args, { stdio: 'inherit' });

if (result.status !== 0) {
  // 找不到本地平台二进制时退回 JS API（非沙箱环境可用）。
  const { build } = await import('esbuild');
  await build({
    entryPoints: ['src/host.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/host.js',
    packages: 'external',
    logLevel: 'silent',
  });
}

console.log('written dist/host.js (single-file host bundle)');
