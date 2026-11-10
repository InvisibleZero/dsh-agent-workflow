import { build } from 'esbuild';

/**
 * 把宿主半 src/host.ts 打成单文件 dist/host.js。
 *
 * 为什么要单文件：tsc 产出的 dist/host.js 里是「不带扩展名」的相对 import
 * （`./host/workflow-repository`），Node 的 ESM 解析不了（ERR_MODULE_NOT_FOUND）。
 * 用 esbuild 把相对模块内联，node 内置模块与 zod 保持 external（运行时能从
 * node_modules 解析），这样宿主半在 dsh 的 Node 进程里一定能加载。
 */
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

console.log('written dist/host.js (single-file host bundle)');
