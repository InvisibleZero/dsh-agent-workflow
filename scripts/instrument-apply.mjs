#!/usr/bin/env node
/**
 * 埋点应用脚本（第 6 项「埋点检测」的 autoRun 命令）。
 *
 * 读 `.workflow/evidence/instrumentation.json`（计划：tree + 节点 KV），
 * 扫源码里已有的 logEvent( / clientLog( 调用，按树节点锚点（函数名）补插缺失的埋点，
 * 插完重扫，把结果落 `instrumentation-existing.json` 与 `instrumentation-apply.json`。
 *
 * 保守原则（2026-11-17 定，方案 A）：定位不唯一 / 找不到函数 / 没有可照抄的调用形态
 * 一律不猜，记进 skipped，由 AI 看报告决定。脚本只改源码，不动 instrumentation.json。
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const EVIDENCE_DIR = join('.workflow', 'evidence');
const PLAN_FILE = 'instrumentation.json';
const EXISTING_FILE = 'instrumentation-existing.json';
const APPLY_FILE = 'instrumentation-apply.json';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'build', '.workflow']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const MAX_FILES = 3000;

/** 事件名取稳定前缀：第一个字符串参数截到第一个 ( 或 : 之前。 */
export function stableEvent(message) {
  const text = String(message ?? '').trim();
  const cut = text.search(/[(（:：]/);
  return (cut === -1 ? text : text.slice(0, cut)).trim();
}

/** 在一段文本里找 logEvent( / clientLog( 调用；返回 {name, argsRaw, start}。跳过注释与字符串里的同名字样。 */
export function findCalls(text) {
  const calls = [];
  const length = text.length;
  let i = 0;
  const isWord = (ch) => /[A-Za-z0-9_$]/.test(ch ?? '');
  while (i < length) {
    const c = text[i];
    // 行注释
    if (c === '/' && text[i + 1] === '/') {
      i += 2;
      while (i < length && text[i] !== '\n') i += 1;
      continue;
    }
    // 块注释
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    // 字符串 / 模板字面量（正则或字符串里写 logEvent( 不算调用）
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i += 1;
      while (i < length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === quote) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    // 调用名边界：前面不能是标识符字符（拦掉 xlogEvent(）
    if (isWord(text[i - 1])) { i += 1; continue; }
    const rest = text.slice(i);
    const match = /^(logEvent|clientLog)\s*\(/.exec(rest);
    if (match !== null) {
      const open = i + match[0].length;
      let depth = 1;
      let quote = null;
      let j = open;
      for (; j < length; j += 1) {
        const cc = text[j];
        if (quote !== null) {
          if (cc === '\\') j += 1;
          else if (cc === quote) quote = null;
          continue;
        }
        if (cc === "'" || cc === '"' || cc === '`') { quote = cc; continue; }
        if (cc === '(') depth += 1;
        else if (cc === ')') { depth -= 1; if (depth === 0) break; }
      }
      calls.push({ name: match[1], argsRaw: text.slice(open, j), start: i });
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return calls;
}

/** 从参数串里取第一个字符串字面量（'…' / "…" / `…`）。 */
export function firstStringLiteral(text) {
  const re = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/;
  const match = re.exec(text);
  return match === null ? '' : match[2];
}

/** 按顶层逗号切参数。 */
export function splitArgs(argsRaw) {
  const args = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (let i = 0; i < argsRaw.length; i += 1) {
    const c = argsRaw[i];
    if (quote !== null) {
      current += c;
      if (c === '\\') { current += argsRaw[i + 1] ?? ''; i += 1; }
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; current += c; continue; }
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    if (c === ',' && depth === 0) { args.push(current.trim()); current = ''; continue; }
    current += c;
  }
  if (current.trim() !== '') args.push(current.trim());
  return args;
}

/**
 * 从调用参数里取事件名：消息在最后一个参数（logEvent(logger, level, message)），
 * 取最后一个参数里的字符串字面量，再取稳定前缀。取不到返回空串。
 */
export function eventFromArgs(argsRaw) {
  const args = splitArgs(argsRaw);
  const last = args[args.length - 1] ?? '';
  return stableEvent(firstStringLiteral(last));
}

/** 照抄调用形态：把新事件塞进消息位（参数表的最后一位）。 */
export function buildCall(shape, event) {
  const literal = `'${String(event).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const args = shape.args;
  if (args.length >= 3) return `${shape.name}(${args[0]}, ${args[1]}, ${literal})`;
  if (args.length === 2) return `${shape.name}(${args[0]}, ${literal})`;
  return `${shape.name}(${literal})`;
}

async function walkFiles(root) {
  const files = [];
  const queue = [root];
  while (queue.length > 0 && files.length < MAX_FILES) {
    const dir = queue.shift();
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(join(dir, entry.name));
        continue;
      }
      if (entry.isFile() && EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
        files.push(join(dir, entry.name));
      }
    }
  }
  return files;
}

/** 扫源码，返回 { items: [{event, location}], firstShape }。 */
export async function scanSource(root) {
  const files = await walkFiles(root);
  const items = [];
  let firstShape = null;
  for (const file of files) {
    let text;
    try { text = await readFile(file, 'utf8'); } catch { continue; }
    const rel = relative(root, file).replaceAll('\\', '/');
    for (const call of findCalls(text)) {
      const event = eventFromArgs(call.argsRaw);
      const line = text.slice(0, call.start).split('\n').length;
      items.push({ event, location: `${rel}:${line}` });
      if (firstShape === null) firstShape = { name: call.name, args: splitArgs(call.argsRaw) };
    }
  }
  return { items, firstShape };
}

function escapeName(name) {
  return String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 找函数定义锚点：返回 {file, braceLine, shape} 或 null（不唯一 / 找不到）。 */
export function findFunctionAnchor(files, name) {
  const escaped = escapeName(name);
  const patterns = [
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escaped}\\b`),
    new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*(?::[^=]+)?=>)`),
  ];
  const hits = [];
  for (const file of files.files) {
    const lines = file.text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (patterns.some((pattern) => pattern.test(lines[i]))) {
        // 从定义行往下找第一个 `{`（最多看 5 行），当作函数体开头。
        for (let j = i; j < Math.min(i + 5, lines.length); j += 1) {
          const col = lines[j].indexOf('{');
          if (col !== -1) { hits.push({ file: file.rel, braceLine: j, shape: file.firstShape }); break; }
        }
      }
    }
  }
  return hits.length === 1 ? hits[0] : null;
}

/**
 * 应用计划：给每个树节点埋点，已有事件回填、缺失则插。
 * files 为 [{rel, text, firstShape}]。返回 {inserted, skipped}，并就地更新 files[].text。
 */
export function applyPlan(plan, scan, files) {
  const inserted = [];
  const skipped = [];
  const existingEvents = new Set(scan.items.map((item) => item.event).filter((event) => event !== ''));
  const nodes = plan !== null && typeof plan === 'object' ? plan.nodes ?? {} : {};
  for (const key of Object.keys(nodes)) {
    const node = nodes[key];
    if (node === undefined || node.event === '') continue;
    if (existingEvents.has(node.event)) continue; // 回填：已有埋点不重复埋
    const anchor = findFunctionAnchor(files, node.function);
    if (anchor === null) { skipped.push({ key, reason: `找不到唯一函数锚点：${node.function}` }); continue; }
    const shape = anchor.shape ?? scan.firstShape;
    if (shape === null) { skipped.push({ key, reason: '没有可照抄的现有 logEvent 调用形态' }); continue; }
    const target = files.files.find((file) => file.rel === anchor.file);
    if (target === undefined) { skipped.push({ key, reason: `锚点文件读不到：${anchor.file}` }); continue; }
    const lines = target.text.split(/\r?\n/);
    const call = `  ${buildCall(shape, node.event)};`;
    lines.splice(anchor.braceLine + 1, 0, call);
    target.text = lines.join('\n');
    existingEvents.add(node.event);
    inserted.push({ key, file: anchor.file, line: anchor.braceLine + 2 });
  }
  return { inserted, skipped };
}

/** CLI 入口：读计划、扫描、应用、重扫、落报告。 */
async function main(root) {
  const evidenceDir = join(root, EVIDENCE_DIR);
  await mkdir(evidenceDir, { recursive: true });
  const result = { scanned: 0, existing: 0, inserted: [], skipped: [], errors: [] };
  let plan = null;
  try {
    plan = JSON.parse(await readFile(join(evidenceDir, PLAN_FILE), 'utf8'));
  } catch (error) {
    if ((error instanceof Error) && error.code !== 'ENOENT') result.errors.push(`读计划失败：${error.message}`);
  }

  const filePaths = await walkFiles(root);
  const files = { files: [] };
  for (const file of filePaths) {
    let text;
    try { text = await readFile(file, 'utf8'); } catch { continue; }
    const rel = relative(root, file).replaceAll('\\', '/');
    const calls = findCalls(text);
    const firstShape = calls.length > 0 ? { name: calls[0].name, args: splitArgs(calls[0].argsRaw) } : null;
    files.files.push({ rel, text, firstShape });
  }

  const scan = { items: [], firstShape: null };
  for (const file of files.files) {
    for (const call of findCalls(file.text)) {
      const event = eventFromArgs(call.argsRaw);
      const line = file.text.slice(0, call.start).split('\n').length;
      scan.items.push({ event, location: `${file.rel}:${line}` });
      if (scan.firstShape === null) scan.firstShape = { name: call.name, args: splitArgs(call.argsRaw) };
    }
  }
  result.scanned = files.files.length;
  result.existing = scan.items.filter((item) => item.event !== '').length;

  if (plan !== null) {
    const applied = applyPlan(plan, scan, files);
    result.inserted = applied.inserted;
    result.skipped = applied.skipped;
    // 写回改过的文件
    for (const file of files.files) {
      try { await writeFile(join(root, file.rel), file.text, 'utf8'); } catch (error) {
        result.errors.push(`写回失败 ${file.rel}：${error.message}`);
      }
    }
    // 重扫自证：插过的 key 应能在新源码里找到
    const after = await scanSource(root);
    const afterEvents = new Set(after.items.map((item) => item.event).filter((event) => event !== ''));
    for (const item of applied.inserted) {
      const node = plan.nodes?.[item.key];
      if (node !== undefined && !afterEvents.has(node.event)) {
        result.skipped.push({ key: item.key, reason: '插入后重扫仍未找到该事件' });
      }
    }
  }

  await writeFile(join(evidenceDir, EXISTING_FILE), `${JSON.stringify(scan.items, null, 2)}\n`, 'utf8');
  await writeFile(join(evidenceDir, APPLY_FILE), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.cwd()).catch((error) => {
    process.stderr.write(`instrument-apply failed: ${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
