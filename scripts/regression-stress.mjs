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
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

const CANDIDATE_PORTS = [12031, 10766, 1606, 8326, 9230, 4709, 2340];
const PORT = Number(process.argv[2] || 0);

let base = '';
let pass = 0;
let fail = 0;
const failures = [];

function report(name, cond, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}${detail ? `  ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? `  ${detail}` : ''}`);
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
    process.exit(2);
  }
  console.log(`# 端口 ${port}\n`);

  // ---------------- 回归 ----------------
  console.log('## 回归');
  const dir = await mkdtemp(join(tmpdir(), 'dsw-reg-'));
  const sidA = 'reg-a-' + Date.now();
  const sidB = 'reg-b-' + Date.now();

  // 1. 自动认领
  const e1 = await json(port, 'ensure-node', { method: 'POST', body: { sessionId: sidA, workingDirectory: dir } });
  report('ensure-node 认领新会话', e1?.ok === true && e1?.node?.current_state === 'not_started', `node=${e1?.node?.nodeId?.slice(0, 8)}`);
  const wfId = e1?.node?.workflowId;
  const nodeA = e1?.node?.nodeId;

  // 2. 幂等
  const e2 = await json(port, 'ensure-node', { method: 'POST', body: { sessionId: sidA, workingDirectory: dir } });
  report('ensure-node 幂等（同会话返回同节点）', e2?.node?.nodeId === nodeA);

  // 3. 第二个会话
  const e3 = await json(port, 'ensure-node', { method: 'POST', body: { sessionId: sidB, workingDirectory: dir } });
  report('第二个会话认领', e3?.ok === true && e3?.node?.current_state === 'not_started');

  // 4. 五态推进 + 时间线
  const chain = ['discussing', 'implementing', 'verifying', 'completed'];
  let last = 'not_started';
  let chainOk = true;
  for (const to of chain) {
    const r = await json(port, 'transition', { method: 'POST', body: { id: wfId, nodeId: nodeA, to } });
    const detail = await json(port, `node-detail?id=${wfId}&nodeId=${nodeA}`);
    if (detail?.node?.current_state !== to) chainOk = false;
    last = to;
  }
  report('五态正向推进 未开始→已完结', chainOk, `末态=${last}`);

  const dAfter = await json(port, `node-detail?id=${wfId}&nodeId=${nodeA}`);
  report('推进生成时间线', (dAfter?.node?.history?.length ?? 0) === 4, `条数=${dAfter?.node?.history?.length}`);

  // 5. 返工（条件流转）
  const rb = await json(port, 'transition', { method: 'POST', body: { id: wfId, nodeId: nodeA, to: 'implementing' } });
  const dRb = await json(port, `node-detail?id=${wfId}&nodeId=${nodeA}`);
  report('返工 已完结→实现中', dRb?.node?.current_state === 'implementing', `history=${dRb?.node?.history?.length}`);

  // 6. 非法状态被拒
  const bad = await json(port, 'transition', { method: 'POST', body: { id: wfId, nodeId: nodeA, to: 'bogus' } });
  report('非法状态被拒绝', bad?.ok === false);

  // 7. 手册 / 清单 / 侧栏批量
  const manual = await json(port, `node-manual?id=${wfId}&nodeId=${nodeA}`);
  report('node-manual 返回会话手册+项目手册', manual?.manual?.manual !== undefined && typeof manual?.globalManual === 'string');
  const chk = await json(port, `node-checklist?id=${wfId}&nodeId=${nodeA}`);
  report('node-checklist 返回清单结构', chk?.ok === true && Array.isArray(chk?.checklist) && typeof chk?.hasPlan === 'boolean', `清单=${chk?.checklist?.length} 条`);
  const side = await json(port, `sidebar-nodes?path=${encodeURIComponent(dir)}`);
  report('sidebar-nodes 返回两个节点', side?.ok === true && Object.keys(side?.nodes ?? {}).length === 2, `节点=${Object.keys(side?.nodes ?? {}).length}`);

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

  console.log('');
  console.log(`# 结果：${pass} 通过 / ${fail} 失败`);
  if (failures.length > 0) {
    console.log('失败项：' + failures.join('、'));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('测试脚本异常：', e);
  process.exit(2);
});
