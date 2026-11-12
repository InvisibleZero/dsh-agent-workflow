import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { assemblePromptLayers, pickSessionManualParts } from '../src/engine/prompt-layers';

/**
 * 压测（脚本级、可重复）：装配是每轮模型请求都要跑的纯函数，取手册是每轮都要解析一次。
 * 阈值给得宽（不追毫秒级波动），只拦"退化成 O(n²) 或每轮读盘"这类结构性劣化。
 */
describe('压测：装配与取手册', () => {
  const manual = [
    '# 会话手册',
    '## 方案（自底向上）',
    ...Array.from({ length: 40 }, (_, index) => `### ${index + 1}. 层\n${'契约'.repeat(20)}`),
    '## 实施顺序',
    ...Array.from({ length: 12 }, (_, index) => `- [${index % 2 === 0 ? ' ' : 'x'}] 第 ${index + 1} 层 —— 完成标准：${'证据'.repeat(10)}`),
  ].join('\n');

  const layers = [
    { name: 'header', text: 'a'.repeat(300) },
    { name: 'hard-rules', text: 'b'.repeat(700) },
    { name: 'shared-detail', text: 'c'.repeat(300) },
    { name: 'state-detail', text: 'd'.repeat(400) },
    { name: 'node-addition', text: 'e'.repeat(200) },
    { name: 'constraints', text: 'f'.repeat(900) },
    { name: 'manual-cue', text: 'g'.repeat(200) },
    { name: 'session-manual', text: 'h'.repeat(3000) },
  ];

  it('2 万次装配 < 2 秒（纯函数、无 IO）', () => {
    const startedAt = performance.now();
    for (let index = 0; index < 20000; index += 1) {
      assemblePromptLayers(layers, 8000);
    }
    const elapsed = performance.now() - startedAt;
    console.log(`[perf] assemblePromptLayers ×20000 = ${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(2000);
  });

  it('1 万次手册解析 < 2 秒', () => {
    const startedAt = performance.now();
    for (let index = 0; index < 10000; index += 1) {
      pickSessionManualParts(manual);
    }
    const elapsed = performance.now() - startedAt;
    console.log(`[perf] pickSessionManualParts ×10000 = ${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('压测：真机注入链路（含读盘）', () => {
  let dir: string;
  let workDir: string;
  let repo: WorkflowRepository;
  let workflowId: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-perf-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-perf-work-'));
    repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: workDir });
    workflowId = created.id;
    await repo.bindSession({ id: workflowId, nodeId: workflowId, sessionId: 'session-perf' });
    await repo.replaceManualSection({
      workflowId, nodeId: workflowId, section: '方案', content: '方案正文'.repeat(100),
    });
    await repo.replaceManualSection({
      workflowId, nodeId: workflowId, section: '实施顺序',
      content: Array.from({ length: 8 }, (_, index) => `- [ ] 第 ${index + 1} 层 —— 完成标准：单测过`).join('\n'),
    });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('连续 30 轮重算（每轮含读盘）< 3 秒，且并发 10 次不出错', async () => {
    const { registerWorkflowStateContext } = await import('../src/host/workflow-state-context');
    const logs: string[] = [];
    const handlers = new Map<string, any>();
    const ctx = {
      logger: { info: (message: string) => logs.push(message), warn: (message: string) => logs.push(message) },
      on: (event: string, handler: any) => { handlers.set(event, handler); },
      inject: (_names: string[], callback: (scoped: any) => any) => callback({
        effect: (factory: () => any) => factory(),
        systemPrompt: { context: () => () => {} },
      }),
    };
    const api = registerWorkflowStateContext(ctx, repo, () => true);

    const startedAt = performance.now();
    for (let index = 0; index < 30; index += 1) {
      const text = await api.refreshNow('session-perf');
      expect(text).toContain('方案正文');
    }
    const elapsed = performance.now() - startedAt;
    console.log(`[perf] refreshNow ×30 = ${elapsed.toFixed(1)}ms（每轮 ${(elapsed / 30).toFixed(1)}ms）`);
    expect(elapsed).toBeLessThan(3000);

    const results = await Promise.all(Array.from({ length: 10 }, () => api.refreshNow('session-perf')));
    expect(results.every((text) => text.includes('【本阶段硬规则】'))).toBe(true);
  });
});
