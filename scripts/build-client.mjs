import { build } from 'esbuild';
import { promises as fs } from 'node:fs';

/**
 * 把 src/client/dsh-plugin.tsx 打包成 dsh 期望的 lazy-CJS 单文件：
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ...; return module.exports } })
 * 外部依赖（react / react-dom / react/jsx-runtime）由 dsh 的模块表提供，保持 external。
 */
const result = await build({
  entryPoints: ['src/client/dsh-plugin.tsx'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  write: false,
  jsx: 'automatic',
  logLevel: 'silent',
});

const code = result.outputFiles[0].text;
const out = `window.__ModuleLoader__.load({
  id: "dsh-agent-workflow",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports;
  }
});
`;

await fs.mkdir('dist', { recursive: true });
await fs.writeFile('dist/client-bundle.js', out);
console.log('written dist/client-bundle.js', out.length, 'bytes');
