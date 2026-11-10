import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 客户端包纯度：浏览器模块表只提供 react 家族，任何裸包（zod、node:fs…）都会在
 * 物化时抛错 → entry failed → 桌面端「应用无法使用」。这个测试把那条规矩钉在源码上，
 * 不用先构建就能拦住。
 *
 * 规则：
 * - 裸说明符只允许 react / react-dom / react/jsx-runtime 这类 react 家族；
 * - 相对说明符允许同层客户端文件（./…）；
 * - 跨层只允许显式白名单（且白名单模块自身必须是零 zod 的纯常量文件）；
 * - `import type` / `export type` 编译后消失，一律放行。
 */
const CLIENT_DIR = fileURLToPath(new URL('../src/client', import.meta.url));
const ZOD_FREE_ALLOWLIST = new Set(['../schema/node-state-label']);
const REACT_FAMILY = /^(react|react-dom)(\/[\w-]+)*$/;
/** dsh 自带客户端模块（由宿主模块表提供），不是 node 依赖。 */
const DSH_CLIENT_MODULES = new Set(['@deepseek-ai/dsh-client-ui-primitives']);

function clientSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return clientSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** 抽出编译后仍然存在的 import/export 说明符（跳过 type-only）。 */
function valueSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('import ') && !line.startsWith('export ')) continue;
    if (/^(import|export)\s+type\b/.test(line)) continue;
    const from = /\bfrom\s+['"]([^'"]+)['"]/.exec(line);
    if (from !== null) {
      specifiers.push(from[1]);
      continue;
    }
    const bare = /^import\s+['"]([^'"]+)['"]/.exec(line);
    if (bare !== null) specifiers.push(bare[1]);
  }
  return specifiers;
}

function isAllowed(specifier: string): boolean {
  if (specifier.startsWith('./')) return true;
  if (ZOD_FREE_ALLOWLIST.has(specifier)) return true;
  if (DSH_CLIENT_MODULES.has(specifier)) return true;
  return REACT_FAMILY.test(specifier);
}

describe('客户端包的运行时依赖', () => {
  it('除 react 家族与白名单外，不允许任何裸依赖', () => {
    const violations: string[] = [];
    for (const file of clientSourceFiles(CLIENT_DIR)) {
      const relative = file.slice(CLIENT_DIR.length + 1).replaceAll('\\', '/');
      for (const specifier of valueSpecifiers(readFileSync(file, 'utf8'))) {
        if (!isAllowed(specifier)) violations.push(`${relative} → ${specifier}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('白名单模块自身必须是零 zod 的纯常量文件', () => {
    const labelPath = join(CLIENT_DIR, '..', 'schema', 'node-state-label.ts');
    const source = readFileSync(labelPath, 'utf8');
    expect(valueSpecifiers(source)).toEqual([]);
  });
});
