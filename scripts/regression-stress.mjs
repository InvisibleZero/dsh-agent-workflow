/**
 * dsh-agent-workflow 宿主 HTTP 接口回归 + 压力测试。
 *
 * 用法：node scripts/regression-stress.mjs [port]
 * 不传 port 则按候选列表自动探测；每步用独立的临时工作目录，不碰真实数据。
 *
 * 覆盖：
 *   回归 —— ensure-node 认领幂等、五态推进、返工、非法态、手册/清单/侧栏批量、回收站。
 *   压力 —— 200 会话批量认领、50 并发侧栏批量读、20 节点并发推进。
 */
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

const CANDIDATE_PORTS = [12031, 10766, 1606, 8326, 9230, 4709, 2340];
const PORT = Number(process.argv[2] || 0);

let base = '';
let pass = 0;
let fail = 0;
const failures = [];
/** 本次跑测的元信息与逐项结果：落盘用，跑一半崩了也要能写出去。 */
const RUN = { startedAt: new Date().toISOString(), port: null, rows: [] };

function report(name, cond, detail = '') {
  const ok = cond === true;
  RUN.rows.push({ name, ok, detail: String(detail ?? '') });
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${name}${detail ? `  ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? `  ${detail}` : ''}`);
  }
}

const pad2 = (value) => String(value).padStart(2, '0');
const datePart = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const timePart = (date) => `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;

/**
 * 落一份结果文件：`logs/probe/<日期>_<时分秒>.json`，只增不改。
 *
 * 为什么必须有：台账跑测协议要求「一份能跟上一版直接比的结果文件」。
 * 只打控制台等于这次跑完就没了，下一次没法比。落盘失败不影响退出码。
 */
async function writeResultFile(port) {
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const finishedAt = new Date();
    const dir = join(root, 'logs', 'probe');
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${datePart(finishedAt)}_${timePart(finishedAt)}.json`);
    const payload = {
      tool: 'regression-stress',
      plugin: typeof pkg.name === 'string' ? pkg.name : 'dsh-agent-workflow',
      version: typeof pkg.version === 'string' ? pkg.version : 'unknown',
      port: port ?? RUN.port ?? null,
      started_at: RUN.startedAt,
      finished_at: finishedAt.toISOString(),
      wall_s: Number(((finishedAt.getTime() - new Date(RUN.startedAt).getTime()) / 1000).toFixed(3)),
      pass,
      fail,
      valid: pass > 0 && fail === 0,
      summary: `${pass} 通过 / ${fail} 失败`,
      failures,
      rows: RUN.rows,
    };
    await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`\n# 结果文件：${file}`);
    return file;
  } catch (error) {
    console.error('# 结果落盘失败（不影响退出码）：', error);
    return null;
  }
}

async function discoverPort() {
  if (PORT > 0) return PORT;
  for (const p of CANDIDATE_PORTS) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/dsh-agent-workflow/list`);
      const j = await r.json().catch(() => null);
      if (j?.ok === true) return p;
    } catch {
      // 试下一个。
    }
  }
  return null;
}

function api(port, path, { method = 'GET', body } = {}) {
  return fetch(`http://127.0.0.1:${port}/dsh-agent-workflow/${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(port, path, opts) {
  const r = await api(port, path, opts);
  return r.json().catch(() => null);
}

const time = (label, fn) => {
  const t0 = Date.now();
  return fn().then((v) => ({ label, ms: Date.now() - t0, v }));
};

async function main() {
  const port = await discoverPort();
  if (port === null) {
    console.error('未找到 DSH 宿主端口（试过：' + CANDIDATE_PORTS.join(', ') + '）');
    // 连宿主都没连上也是一次「失败路径」：照样落一份结果，别让它无声消失。
    RUN.rows.push({ name: '发现宿主端口', ok: false, detail: CANDIDATE_PORTS.join(', ') });
    failures.push('发现宿主端口');
    fail += 1;
    await writeResultFile(null);
    process.exit(2);
  }
  RUN.port = port;
  console.log(`# 端口 ${port}\n`);

  // ---------------- 回归 ----------------
  console.log('## 回归');
  const dir = await mkdtemp(join(tmpdir(), 'dsw-reg-'));
  const sidA = 'reg-a-' + Date.now();
  const sidB = 'reg-b-' + Date.now();

  // 1. 自动认领
  const e1 = await json(port, 'ensure-node', { method: 'POST', body: { sessionId: sidA, workingDirectory: dir } });
  report('ensure-node 认领新会话', e1?.ok === true && e1?.node?.current_state === 'discussing', `node=${e1?.node?.nodeId?.slice(0, 8)}`);
  const wfId = e1?.node?.workflowId;
  const nodeA = e1?.node?.nodeId;

  // 2. 幂等
  const e2 = await json(port, 'ensure-node', { method: 'POST', body: { sessionId: sidA, workingDirectory: dir } });
  report('ensure-node 幂等（同会话返回同节点）', e2?.node?.nodeId === nodeA);

  // 3. 第二个会话
  const e3 = await json(port, 'ensure-node', { method: 'POST', body: { sessionId: sidB, workingDirectory: dir } });
  report('第二个会话认领', e3?.ok === true && e3?.node?.current_state === 'discussing');

  // 4. 推进前置：方案没写不能进实现中
  const noPlan = await json(port, 'transition', { method: 'POST', body: { id: wfId, nodeId: nodeA, to: 'implementing' } });
  report('方案为空时拒绝进入实现中', noPlan?.ok === false && String(noPlan?.error ?? '').includes('方案'), String(noPlan?.error ?? '').slice(0, 40));

  const manualPath = join(dir, '.workflow', `会话手册-${nodeA}.md`);
  const writeManual = async (checked) => writeFile(manualPath, [
    '# 会话手册',
    '',
    '## 方案（上层 → 下层）',
    '### 1. 目标与验收',
    '回归用方案：验证推进前置。',
    '',
    '## 实施顺序',
    `- [${checked ? 'x' : ' '}] 1. 第一步`,
    `- [${checked ? 'x' : ' '}] 2. 第二步`,
    '',
  ].join('\n'), 'utf8');
  await writeManual(false);

  // 5. 推进 + 时间线
  const chain = ['implementing', 'verifying', 'completed'];
  let last = 'discussing';
  let chainOk = true;
  const toImplementing = await json(port, 'transition', { method: 'POST', body: { id: wfId, nodeId: nodeA, to: 'implementing' } });
  if (toImplementing?.ok !== true) chainOk = false;
  else last = 'implementing';

  // 6. 清单没勾完不能进验收中
  const uncheckedTry = await json(port, 'transition', { method: 'POST', body: { id: wfId, nodeId: nodeA, to: 'verifying' } });
  report('清单未勾完时拒绝进入验收中', uncheckedTry?.ok === false && String(uncheckedTry?.error ?? '').includes('没勾完'), String(uncheckedTry?.error ?? '').slice(0, 40));

  await writeManual(true);
  for (const to of ['verifying', 'completed']) {
    const r = await json(port, 'transition', { method: 'POST', body: { id: wfId, nodeId: nodeA, to } });
    const detail = await json(port, `node-detail?id=${wfId}&nodeId=${nodeA}`);
    if (r?.ok !== true || detail?.node?.current_state !== to) chainOk = false;
    last = to;
  }
  report('四态正向推进 讨论中→已完结', chainOk, `末态=${last}`);

  const dAfter = await json(port, `node-detail?id=${wfId}&nodeId=${nodeA}`);
  report('推进生成时间线', (dAfter?.node?.history?.length ?? 0) === 3, `条数=${dAfter?.node?.history?.length}`);

  // 5. 返工（条件流转）
  const rb = await json(port, 'transition', { method: 'POST', body: { id: wfId, nodeId: nodeA, to: 'implementing' } });
  const dRb = await json(port, `node-detail?id=${wfId}&nodeId=${nodeA}`);
  report('返工 已完结→实现中', dRb?.node?.current_state === 'implementing', `history=${dRb?.node?.history?.length}`);

  // 6. 非法状态被拒，并把 trace 回给调用方（失败时调用方也有钥匙）
  const bad = await json(port, 'transition', { method: 'POST', body: { id: wfId, nodeId: nodeA, to: 'bogus' } });
  report('非法状态被拒绝，且响应带 traceId', bad?.ok === false && typeof bad?.traceId === 'string', `trace=${bad?.traceId ?? '(无)'}`);

  // 7. 手册 / 清单 / 侧栏批量 / 同意流程
  const manual = await json(port, `node-manual?id=${wfId}&nodeId=${nodeA}`);
  report('node-manual 返回会话手册+项目手册', manual?.manual?.manual !== undefined && typeof manual?.globalManual === 'string');
  const chk = await json(port, `node-checklist?id=${wfId}&nodeId=${nodeA}`);
  report('node-checklist 返回清单结构', chk?.ok === true && Array.isArray(chk?.checklist) && typeof chk?.hasPlan === 'boolean', `清单=${chk?.checklist?.length} 条`);
  const side = await json(port, `sidebar-nodes?path=${encodeURIComponent(dir)}`);
  report('sidebar-nodes 返回两个节点', side?.ok === true && Object.keys(side?.nodes ?? {}).length === 2, `节点=${Object.keys(side?.nodes ?? {}).length}`);
  // 模型只能"请求"推进：没有请求时同意接口必须拒绝。
  const noPending = await json(port, 'approve-advance', { method: 'POST', body: { sessionId: sidA, accept: true } });
  report('没有待确认请求时 approve-advance 被拒', noPending?.ok === false, String(noPending?.error ?? '').slice(0, 30));

  // 8. 回收站往返
  await json(port, 'delete', { method: 'POST', body: { id: wfId } });
  const trash = await json(port, 'trash-list');
  const inTrash = (trash?.items ?? []).some((t) => t.id === wfId);
  report('删除进入回收站', inTrash === true);
  await json(port, 'trash-restore', { method: 'POST', body: { id: wfId } });
  const back = await json(port, `node-by-session?sessionId=${sidA}`);
  report('回收站恢复', back?.ok === true && back?.node !== null);
  await json(port, 'delete', { method: 'POST', body: { id: wfId } });
  await rm(dir, { recursive: true, force: true });

  // 9. 埋点可观测（/events 接口）+ 失败链路能按 trace 串起来
  const evts = await json(port, 'events?limit=200');
  const evList = Array.isArray(evts?.events) ? evts.events : [];
  const transOkCount = evList.filter((e) => typeof e.message === 'string' && e.message.includes('transition ok')).length;
  const transFailEvents = evList.filter((e) => typeof e.message === 'string' && e.message.includes('transition failed'));
  const routeFailEvents = evList.filter((e) => typeof e.message === 'string' && e.message.includes('route failed (route=transition'));
  // 同一跳失败会留两条（路由级 + 业务级），两条必须共享同一个 trace，否则排查时对不上。
  const tracesPaired = transFailEvents.length > 0
    && routeFailEvents.length === transFailEvents.length
    && transFailEvents.every((event) => typeof event.trace === 'string'
      && routeFailEvents.some((routeEvent) => routeEvent.trace === event.trace));
  report(
    '埋点可观测（/events）且失败可按 trace 串起',
    evList.length > 0 && transOkCount >= 1 && transFailEvents.length >= 1 && tracesPaired
      && evList.some((e) => typeof e.trace === 'string'),
    `ok=${transOkCount}, failed=${transFailEvents.length}, routeFailed=${routeFailEvents.length}, tracePaired=${tracesPaired}`,
  );


  console.log('');
  // ---------------- 压力 ----------------
  console.log('## 压力');

  // A. 批量认领 200 会话
  const big = await mkdtemp(join(tmpdir(), 'dsw-stress-'));
  const N = 200;
  let bigStart = Date.now();
  const ids = [];
  for (let i = 0; i < N; i++) ids.push('stress-' + i + '-' + Date.now());
  for (let i = 0; i < N; i++) {
    await json(port, 'ensure-node', { method: 'POST', body: { sessionId: ids[i], workingDirectory: big } });
  }
  const bigMs = Date.now() - bigStart;
  const bigSide = await json(port, `sidebar-nodes?path=${encodeURIComponent(big)}`);
  report(`批量认领 ${N} 会话`, Object.keys(bigSide?.nodes ?? {}).length === N, `${bigMs}ms，平均 ${(bigMs / N).toFixed(1)}ms/个`);

  // B. 50 并发 sidebar-nodes
  const CONC = 50;
  const lat = [];
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONC }, async () => {
    const s = Date.now();
    const r = await json(port, `sidebar-nodes?path=${encodeURIComponent(big)}`);
    lat.push(Date.now() - s);
    if (r?.ok !== true || Object.keys(r?.nodes ?? {}).length !== N) throw new Error('并发读返回异常');
  }));
  const concMs = Date.now() - t0;
  lat.sort((a, b) => a - b);
  const p50 = lat[Math.floor(lat.length * 0.5)];
  const p95 = lat[Math.floor(lat.length * 0.95)];
  report(`50 并发 sidebar-nodes`, true, `总 ${concMs}ms，p50=${p50}ms，p95=${p95}ms，错误 0`);

  // C. 20 节点并发推进
  const transNodes = [];
  for (let i = 0; i < 20; i++) {
    const e = await json(port, 'ensure-node', { method: 'POST', body: { sessionId: 'trans-' + i + '-' + Date.now(), workingDirectory: big } });
    transNodes.push(e.node);
  }
  const wfBig = (await json(port, 'ensure-node', { method: 'POST', body: { sessionId: ids[0], workingDirectory: big } })).node.workflowId;
  const transResults = await Promise.all(transNodes.map((n) =>
    json(port, 'transition', { method: 'POST', body: { id: wfBig, nodeId: n.nodeId, to: 'discussing' } })
  ));
  const transOk = transResults.every((r) => r?.ok === true);
  // 回读抽查
  let verifyOk = true;
  for (const n of transNodes.slice(0, 5)) {
    const d = await json(port, `node-detail?id=${wfBig}&nodeId=${n.nodeId}`);
    if (d?.node?.current_state !== 'discussing') verifyOk = false;
  }
  report('20 节点并发推进到讨论中', transOk && verifyOk, `成功 ${transResults.filter((r) => r?.ok).length}/20`);

  // 清理
  await json(port, 'delete', { method: 'POST', body: { id: wfBig } });
  await rm(big, { recursive: true, force: true });

  await writeResultFile(port);
  console.log('');
  console.log(`# 结果：${pass} 通过 / ${fail} 失败`);
  if (failures.length > 0) {
    console.log('失败项：' + failures.join('、'));
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error('测试脚本异常：', e);
  // 脚本自己崩了也要留证据：否则「跑不通」和「没跑」在结果目录里长得一样。
  RUN.rows.push({ name: '脚本异常', ok: false, detail: String(e?.message ?? e) });
  failures.push('脚本异常');
  fail += 1;
  await writeResultFile(RUN.port);
  process.exit(2);
});
