#!/usr/bin/env node
/**
 * 命名扫描脚本（check_naming 的 autoRun 脚本，垂直切片最小版：只扫封杀词）。
 *
 * 扫 src/ 下的标识符，抓「独立出现的封杀词」（system/data/info/manager/util/utils/common/helper），
 * 跳过注释与字符串（避免把注释/文案里的同名字样误报），产出 `.workflow/evidence/naming.json`。
 * 复合词（dataset / userData / managerFoo 这类）不算违规：只认「整标识符就是封杀词」。
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const EVIDENCE_DIR = join('.workflow', 'evidence');
const EVIDENCE = join(EVIDENCE_DIR, 'naming.json');
// 扫项目根（不是写死 src/）：根目录的入口文件（panel.py 等）与 src/ 都覆盖。
// 写死 src/ 时，改动落在根目录的项目会「扫了 333 条全是上游、本轮改动一条没扫到」。
const SCAN_ROOT = '.';
const BANNED = ['system', 'data', 'info', 'manager', 'util', 'utils', 'common', 'helper'];
const BANNED_RE = new RegExp(`\\b(${BANNED.join('|')})\\b`, 'g');
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go']);
const SKIP_DIRS = new Set([
  // 工具产物 / 依赖
  'node_modules', '.git', 'dist', 'coverage', 'build', '.workflow',
  // Python 虚拟环境与缓存
  '.venv', 'venv', '.pixi', '.tox', '.mypy_cache', '.pytest_cache', '.ruff_cache', '__pycache__',
  // 数据 / 模型 / 日志（不是源码）
  'models', 'cache', 'assets', 'logs', 'chat_history', 'live2d-models', 'live_profiles_archive', 'z_Temp',
]);
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
    // Python 行注释：#（JS 的 #private 字段极少，误判可接受）
    if (c === '#') {
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
    // Python 三引号字符串（docstring）："""...""" 或 '''...'''
    if ((c === '"' && text[i + 1] === '"' && text[i + 2] === '"') || (c === "'" && text[i + 1] === "'" && text[i + 2] === "'")) {
      const q = c;
      out += '   ';
      i += 3;
      while (i < n) {
        if (text[i] === q && text[i + 1] === q && text[i + 2] === q) { out += '   '; i += 3; break; }
        out += blank(text[i]);
        i += 1;
      }
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

/**
 * 本次改动的**行范围**（git：未提交 + 最近一次提交），file → [[start, end], ...]，用于按行标 new / existing。
 * 用 `git diff -U0` 解析 hunk 头 `@@ -a,b +c,d @@` 的新文件行范围；拿不到返回 null（不标）。
 */
function changedRanges() {
  try {
    const map = new Map();
    const add = (output) => {
      let file = '';
      for (const line of String(output).split('\n')) {
        if (line.startsWith('+++ b/')) {
          file = line.slice(6).trim().replaceAll('\\', '/');
          if (file !== '' && !map.has(file)) map.set(file, []);
          continue;
        }
        const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (hunk !== null && file !== '') {
          const start = Number(hunk[1]);
          const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
          if (count > 0) {
            const ranges = map.get(file) ?? [];
            ranges.push([start, start + count - 1]);
            map.set(file, ranges);
          }
        }
      }
    };
    add(execFileSync('git', ['diff', '-U0', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    try {
      add(execFileSync('git', ['diff', '-U0', 'HEAD~1', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    } catch { /* 没有 HEAD~1（首次提交）无所谓 */ }
    return map;
  } catch {
    return null;
  }
}

/** 某行是否属于本次改动：ranges 为 null（拿不到 git）→ null；文件不在改动集 → false。 */
export function lineIsNew(ranges, file, line) {
  if (ranges === null) return null;
  const fileRanges = ranges.get(file);
  if (fileRanges === undefined) return false;
  return fileRanges.some(([start, end]) => line >= start && line <= end);
}

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const ranges = changedRanges();
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
      const lineNo = lineOf(clean, match.index);
      const isNew = lineIsNew(ranges, rel, lineNo);
      violations.push({
        word: match[1],
        file: rel,
        line: lineNo,
        ...(isNew === null ? {} : { new: isNew }),
      });
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
