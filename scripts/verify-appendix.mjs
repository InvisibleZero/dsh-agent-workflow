/**
 * 附表功能的可复跑自检（验收用）。
 *
 * 用法：
 *   node scripts/verify-appendix.mjs            # 三段全跑
 *   node scripts/verify-appendix.mjs parser     # 边界：模板解析
 *   node scripts/verify-appendix.mjs route      # 契约：GET /appendix 的返回与拒绝分支
 *   node scripts/verify-appendix.mjs bundle     # 客户端包结构
 *
 * 依赖已构建的 dist（先 npm run build）。全通过 exit 0，任一失败 exit 1。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const mode = process.argv[2] ?? 'all';
const runParser = mode === 'all' || mode === 'parser';
const runRoute = mode === 'all' || mode === 'route';
const runBundle = mode === 'all' || mode === 'bundle';
const runDeps = mode === 'all' || mode === 'deps';
const runDead = mode === 'all' || mode === 'dead';

/** 递归列出 src 下的 ts/tsx 源文件（相对仓库根，正斜杠）。 */
async function listSources() {
  const { readdir } = await import('node:fs/promises');
  const out = [];
  const walk = async (absolute) => {
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const child = join(absolute, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(child.slice(root.length + 1).replace(/\\/g, '/'));
    }
  };
  await walk(join(root, 'src'));
  return out.sort();
}

// —— 依赖检查：只在层内单向，且无环 ——
if (runDeps) {
  const files = await listSources();
  const graph = new Map();
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    const specs = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    const targets = [];
    for (const spec of specs) {
      if (!spec.startsWith('.')) continue;
      const base = join(dirname(join(root, file)), spec).replace(/\\/g, '/');
      const candidate = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((path) => {
        try { readFileSync(path); return true; } catch { return false; }
      });
      if (candidate !== undefined) targets.push(candidate.slice(root.length + 1).replace(/\\/g, '/'));
    }
    graph.set(file, targets);
  }

  const cycles = [];
  const state = new Map();
  const stack = [];
  const visit = (file) => {
    if (state.get(file) === 'done') return;
    if (state.get(file) === 'open') {
      const start = stack.indexOf(file);
      cycles.push([...stack.slice(start), file].join(' -> '));
      return;
    }
    state.set(file, 'open');
    stack.push(file);
    for (const next of graph.get(file) ?? []) visit(next);
    stack.pop();
    state.set(file, 'done');
  };
  for (const file of files) visit(file);

  // 分层：客户端不准反向摸宿主；schema / engine 不准碰客户端与宿主实现。
  const violations = [];
  for (const [file, targets] of graph) {
    for (const target of targets) {
      if (file.startsWith('src/client/') && /^src\/(host|engine)/.test(target)) violations.push(`${file} -> ${target}（客户端依赖宿主/引擎）`);
      if (/^src\/(schema|engine)\//.test(file) && /^src\/(client|host)\//.test(target)) violations.push(`${file} -> ${target}（底层依赖上层）`);
    }
  }

  check(cycles.length === 0, `存在循环依赖：${cycles.join(' ; ')}`);
  check(violations.length === 0, `跨层引用：${violations.join(' ; ')}`);
  const appendixUsers = files.filter((file) => (graph.get(file) ?? []).includes('src/engine/plan-sections.ts'));
  check(appendixUsers.length === 1 && appendixUsers[0] === 'src/host.ts', `plan-sections 只应被 host.ts 引用，实际 ${appendixUsers.join(', ') || '无人引用'}`);
  const planImports = graph.get('src/engine/plan-sections.ts') ?? [];
  check(planImports.length === 0, `plan-sections 不应有内部依赖，实际 ${planImports.join(', ')}`);
  console.log(`[deps] 文件 ${files.length} | 环 ${cycles.length} | 跨层 ${violations.length} | plan-sections 引用方 ${appendixUsers.join(',')}`);
}

// —— 死代码扫描：新增符号的引用计数 ——
if (runDead) {
  const files = await listSources();
  const all = files.map((file) => readFileSync(join(root, file), 'utf8')).join('\n');
  const count = (pattern) => (all.match(pattern) ?? []).length;
  const expectations = [
    ['plan_sections_from_template', /plan_sections_from_template/g, 3], // 定义 + import + 调用
    ['readSessionManualTemplate', /readSessionManualTemplate/g, 2], // 定义 + 路由调用
    ['APPENDIX_TAB', /APPENDIX_TAB/g, 2], // 定义 + 页签数组引用
    ['AppendixPanel', /AppendixPanel/g, 2], // 定义 + 渲染
    ['PlanSection', /PlanSection\b/g, 3], // interface + 返回类型 + 变量类型
  ];
  for (const [name, pattern, expected] of expectations) {
    const actual = count(pattern);
    // 多算不算错（可能出现在注释里），少算才是死代码或漏改。
    check(actual >= expected, `${name} 引用 ${actual} 次，少于预期 ${expected}（可能未接上）`);
    console.log(`[dead] ${name} = ${actual}`);
  }
}

// —— 边界：模板 → 五小节 ——
if (runParser) {
  const { plan_sections_from_template } = await import(pathToFileURL(join(root, 'dist/engine/plan-sections.js')).href);
  const template = [
    '## 方案（自底向上）',
    '### 1. 目标与验收',
    '<!-- 要解决什么 -->',
    '### 2. 数据层',
    '<!-- 模型 / 迁移 -->',
    '### 3. 领域层',
    '<!-- 规则 -->',
    '### 4. 接口层',
    '<!-- 契约 -->',
    '### 5. 表现层',
    '<!-- UI -->',
  ].join('\n');
  const full = plan_sections_from_template(template);
  check(full.length === 5, `完整模板应得 5 节，实际 ${full.length}`);
  check(full[1]?.title === '数据层', `第 2 节标题应解析为「数据层」，实际 ${String(full[1]?.title)}`);
  check(full[1]?.hint === '模型 / 迁移', `第 2 节提示应取注释正文，实际 ${String(full[1]?.hint)}`);

  // 标题少一节 → 凑不齐，返回空数组（由路由回退原文）
  const missing = plan_sections_from_template(template.replace('### 5. 表现层\n<!-- UI -->', ''));
  check(missing.length === 0, `少一节应返回空数组，实际 ${missing.length}`);

  // 标题写法被改（## 而不是 ###）→ 识别不到，返回空数组
  const renamed = plan_sections_from_template(template.replace(/^### /gm, '## '));
  check(renamed.length === 0, `标题降级应返回空数组，实际 ${renamed.length}`);

  // 空输入 / 乱文本不抛错
  check(plan_sections_from_template('').length === 0, '空模板应返回空数组');
  check(plan_sections_from_template('随便写点什么').length === 0, '非模板文本应返回空数组');

  // 某节没有注释：仍解析出该节，hint 为空串
  const noHint = plan_sections_from_template(template.replace('<!-- 规则 -->', ''));
  check(noHint.length === 5 && noHint[2]?.hint === '', `缺注释节应保留且 hint 为空，实际 ${noHint[2]?.hint}`);

  console.log(`[parser] 5 节 ${full.length} | 少节 ${missing.length} | 改写法 ${renamed.length} | 缺注释 ${noHint[2]?.hint === ''}`);
}

// —— 契约：路由返回与两条拒绝分支 ——
if (runRoute) {
  const { apply } = await import(pathToFileURL(join(root, 'dist/host.js')).href);
  const routes = new Map();
  const logger = { info() {}, warn() {}, error() {} };
  const fakeWeb = {
    effect(fn) { fn(); },
    webServer: { register(definition) { routes.set(definition.path, definition.handler); return {}; } },
  };
  const fakeTools = { effect(fn) { fn(); }, tools: { register() { return {}; }, guard() {} } };
  const fakePrompt = {
    effect(fn) { fn(); return () => {}; },
    systemPrompt: { context() { return () => {}; } },
  };
  const ctx = {
    logger,
    on() {},
    get() { return undefined; },
    inject(deps, callback) {
      const names = Array.isArray(deps) ? deps : [];
      if (names.includes('systemPrompt')) callback(fakePrompt);
      else if (names.includes('tools')) callback(fakeTools);
      else callback(fakeWeb);
    },
    effect(fn) { fn(); },
    tools: fakeTools.tools,
    slots: { inject() {}, register() {} },
  };
  apply(ctx);

  const handler = routes.get('/dsh-agent-workflow/appendix');
  check(handler !== undefined, '没有注册 /dsh-agent-workflow/appendix');
  if (handler !== undefined) {
    const call = async (request) => {
      const response = { statusCode: 0, body: '' };
      const res = {
        writeHead(status) { response.statusCode = status; },
        end(chunk) { response.body += chunk ?? ''; },
        set statusCode(value) { response.statusCode = value; },
      };
      await handler(request, res);
      const text = response.body;
      return { status: response.statusCode, body: text.trim().startsWith('{') ? JSON.parse(text) : text };
    };

    const ok = await call({ method: 'GET', url: '/dsh-agent-workflow/appendix', headers: { host: '127.0.0.1:64206' } });
    check(ok.status === 200, `GET 应 200，实际 ${ok.status}`);
    check(ok.body?.ok === true, '返回体 ok 应为 true');
    check(typeof ok.body?.traceId === 'string' && ok.body.traceId !== '', '返回体应带 traceId');
    check(Array.isArray(ok.body?.planSections) && ok.body.planSections.length === 5, `planSections 应为 5 条，实际 ${ok.body?.planSections?.length}`);
    check(Array.isArray(ok.body?.verifyItems) && ok.body.verifyItems.length === 7, `verifyItems 应为 7 条，实际 ${ok.body?.verifyItems?.length}`);
    check(ok.body?.planFallback === '', '解析成功时 planFallback 应为空串');
    const needs = ok.body?.verifyItems?.filter((item) => item.needsCommand).map((item) => item.id).join(',');
    check(needs === '1,4,7', `needsCommand 应为 1,4,7，实际 ${needs}`);
    check(ok.body?.verifyItems?.every((item) => typeof item.judge === 'string' && item.judge !== ''), '每项都要带非空判据');
    check(ok.body?.planSections?.every((section, index) => section.id === index + 1 && section.title !== ''), '五项序号应为 1..5 且标题非空');

    const wrongMethod = await call({ method: 'POST', url: '/dsh-agent-workflow/appendix', headers: { host: '127.0.0.1:64206' } });
    check(wrongMethod.status === 405, `POST 应 405，实际 ${wrongMethod.status}`);

    const foreign = await call({ method: 'GET', url: '/dsh-agent-workflow/appendix', headers: { host: '10.0.0.2:64206' } });
    check(foreign.status === 403, `非回环 Host 应 403，实际 ${foreign.status}`);

    console.log(`[route] 200: plan=${ok.body?.planSections?.length} verify=${ok.body?.verifyItems?.length} 需命令=${needs} | POST=${wrongMethod.status} | 非回环=${foreign.status}`);
  }
}

// —— 客户端包：页签、请求点、三态、纯度 ——
if (runBundle) {
  const bundle = readFileSync(join(root, 'dist/client-bundle.js'), 'utf8');
  check(bundle.includes('附表'), '客户端包里没有「附表」页签文案');
  check((bundle.match(/\/dsh-agent-workflow\/appendix/g) ?? []).length === 1, `附表请求点应只有 1 处，实际 ${(bundle.match(/\/dsh-agent-workflow\/appendix/g) ?? []).length}`);
  check(bundle.includes('[...STATE_TABS, APPENDIX_TAB]'), '附表页签应接在 STATE_TABS 之后');
  check(bundle.includes("activeTab === 'appendix'"), '设置页主体缺少附表分支');
  // JSX 文本在产物里会被转成 \uXXXX，按状态 token 断言更稳。
  check(bundle.includes("setStatus('loading')"), '缺少加载态（setStatus loading）');
  check(bundle.includes("setStatus('error')"), '缺少失败态（setStatus error）');
  check(bundle.includes('setAttempt'), '缺少重试入口（setAttempt）');
  check(bundle.includes('[appendix] 读取失败'), '失败路径缺少浏览器侧埋点');
  check(!/require\(["']zod["']\)/.test(bundle), '客户端包不应 require zod');
  console.log('[bundle] 附表文案/单个请求点/三态/埋点/纯度 均匹配');
}

if (failures.length > 0) {
  console.error('[verify-appendix] 失败：');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('[verify-appendix] OK');
