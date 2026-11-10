import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * mini bundler：把 dist/client-cjs（CommonJS）里的相对 require 内联，
 * 包装成 dsh 期望的 lazy-CJS 单文件。
 * 外部依赖（react / react-dom / react/jsx-runtime）保持 require，由 dsh 模块表提供。
 */
const ROOT = 'dist/client-cjs';
const ENTRY = 'client/dsh-plugin.js';

const modules = new Map();

function resolveDep(fromKey, req) {
  const dir = path.posix.dirname(fromKey);
  let target = path.posix.normalize(path.posix.join(dir, req));
  if (!target.endsWith('.js')) target += '.js';
  return target;
}

async function load(key) {
  if (modules.has(key)) return;
  const code = await fs.readFile(path.join(ROOT, key), 'utf8');
  const deps = [];
  const re = /require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    deps.push({ req: m[1], key: resolveDep(key, m[1]) });
  }
  modules.set(key, code);
  for (const d of deps) await load(d.key);
  let out = code;
  for (const d of deps) {
    out = out.split(`require("${d.req}")`).join(`__req("${d.key}")`);
    out = out.split(`require('${d.req}')`).join(`__req("${d.key}")`);
  }
  modules.set(key, out);
}

await load(ENTRY);

const indent = (code) => code.split('\n').map((l) => '    ' + l).join('\n');

let modsCode = '';
for (const [k, v] of modules) {
  modsCode += `    ${JSON.stringify(k)}: function(__req, module, exports) {\n${indent(v)}\n    },\n`;
}

const out = `window.__ModuleLoader__.load({
  id: "dsh-agent-workflow",
  factory: (require) => {
    var __mods = {
${modsCode}    };
    var __cache = {};
    function __req(key) {
      if (__cache[key]) return __cache[key].exports;
      var m = { exports: {} };
      __cache[key] = m;
      __mods[key](__req, m, m.exports);
      return m.exports;
    }
    return __req(${JSON.stringify(ENTRY)});
  }
});
`;

await fs.mkdir('dist', { recursive: true });
await fs.writeFile('dist/client-bundle.js', out);
console.log('written dist/client-bundle.js', out.length, 'bytes, modules:', modules.size);
