#!/usr/bin/env node
/**
 * 命名扫描脚本（check_naming 的 autoRun 脚本，垂直切片最小版：只扫封杀词）。
 *
 * 扫 src/ 下的标识符，抓「独立出现的封杀词」（system/data/info/manager/util/utils/common/helper），
 * 跳过注释与字符串（避免把注释/文案里的同名字样误报），产出 `.workflow/evidence/naming.json`。
 * 复合词（dataset / userData / managerFoo 这类）不算违规：只认「整标识符就是封杀词」。
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const EVIDENCE_DIR = join('.workflow', 'evidence');
const EVIDENCE = join(EVIDENCE_DIR, 'naming.json');
const SCAN_ROOT = 'src';
const BANNED = ['system', 'data', 'info', 'manager', 'util', 'utils', 'common', 'helper'];
const BANNED_RE = new RegExp(`\\b(${BANNED.join('|')})\\b`, 'g');
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'build', '.workflow']);
const MAX_FILES = 2000;

async function walk(dir, files) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (files.length >= MAX_FILES) return;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(full, files);
      continue;
    }
    if (entry.isFile() && EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) files.push(full);
  }
}

/** 把注释/字符串替换成空格（保留换行，行号不变），返回可安全 grep 的文本。 */
export function stripCommentsAndStrings(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  const blank = (ch) => (ch === '\n' ? '\n' : ' ');
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') { out += blank(text[i]); i += 1; }
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) { out += blank(text[i]); i += 1; }
      out += '  ';
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += ' ';
      i += 1;
      while (i < n) {
        if (text[i] === '\\') { out += '  '; i += 2; continue; }
        if (text[i] === quote) { out += ' '; i += 1; break; }
        out += blank(text[i]);
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const files = [];
  await walk(SCAN_ROOT, files);
  const violations = [];
  let scanned = 0;
  for (const file of files) {
    let text;
    try { text = await readFile(file, 'utf8'); } catch { continue; }
    scanned += 1;
    const clean = stripCommentsAndStrings(text);
    const rel = relative('.', file).replaceAll('\\', '/');
    BANNED_RE.lastIndex = 0;
    let match;
    while ((match = BANNED_RE.exec(clean)) !== null) {
      violations.push({ word: match[1], file: rel, line: lineOf(clean, match.index) });
    }
  }
  const payload = { scanned, violations };
  await writeFile(EVIDENCE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(String(error?.stack ?? error));
    process.exitCode = 1;
  });
}
