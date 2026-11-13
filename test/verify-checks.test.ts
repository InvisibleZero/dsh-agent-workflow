import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { registerWorkflowTools } from '../src/host/workflow-tools';
import { ToolRegistryStore } from '../src/host/tool-registry';
import { recordToolEvent } from '../src/host/tool-ledger';
import {
  assertAnchorPathShape,
  resolveVerifyCheckId,
  summarizeVerification,
  validateVerifyReportInput,
} from '../src/engine/verify-rules';
import { VERIFY_CHECKS, createVerification } from '../src/schema/verify-checks';

const SESSION = 'session-verify-test';

/** 最小运行环境：注册工具、记下推进请求；状态由 stateRef 提供（门禁前置用它）。 */
function makeRuntime(repository: WorkflowRepository, stateRef: { value: string | undefined }) {
  const tools = new Map<string, any>();
  const requests: Array<{ sessionId: string; to: string; reason?: string }> = [];
  const logger = { info: () => {}, warn: () => {} };
  const ctx = {
    logger,
    inject: (_names: string[], callback: (scoped: any) => unknown) => callback({
      effect: (factory: () => unknown) => factory(),
      tools: {
        register: (definition: any) => { tools.set(definition.name, definition); return () => {}; },
        guard: () => () => {},
      },
    }),
  };
  registerWorkflowTools(ctx as any, {
    repository,
    registryStore: new ToolRegistryStore(join(tmpdir(), 'wf-verify-registry-unused')),
    recordToolEvent,
    stateContext: { refreshNow: async () => '' },
    isPresetSession: () => true,
    getState: () => stateRef.value,
    refreshState: async () => {},
    setState: () => {},
    logger,
    requestAdvance: (input) => requests.push(input),
    pendingAdvanceOf: () => null,
    clearPendingAdvance: () => {},
  } as any);
  // 五个基础工具现在只能经网关调用：这里给测试保留「按名字执行」的薄壳。
  const gateway = tools.get('workflow_tool_call');
  return {
    tool: (name: string) => ({
      execute: (args: any, execArg: any) => gateway.execute({ name, args }, execArg),
    }),
    requests,
  };
}

const exec = { agent: { session: { id: SESSION } } } as any;

describe('验收七项：规则与门禁', () => {
  let dir: string;
  let workDir: string;
  let repo: WorkflowRepository;
  let stateRef: { value: string | undefined };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-verify-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-verify-work-'));
    repo = new WorkflowRepository(dir);
    stateRef = { value: 'verifying' };
    await writeFile(join(workDir, 'evidence.md'), 'first\nsecond\nthird\n', 'utf8');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  async function seedAt(state: string) {
    const node = await repo.ensureNode({ sessionId: SESSION, workingDirectory: workDir });
    if (node.current_state !== state) {
      await repo.transitionNode({ id: node.workflowId, nodeId: node.nodeId, to: state });
    }
    return node;
  }

  async function reportAll(workflowId: string, nodeId: string) {
    for (const check of VERIFY_CHECKS) {
      await repo.submitVerifyReport({
        workflowId,
        nodeId,
        itemId: check.id,
        report: { result: 'pass', summary: `第 ${check.id} 项通过`, anchors: [{ file: 'evidence.md' }] },
      });
    }
  }

  describe('领域层规则', () => {
    it('条目可以按 id 或名称解析', () => {
      expect(resolveVerifyCheckId(3)).toBe(3);
      expect(resolveVerifyCheckId('死代码扫描')).toBe(3);
      expect(() => resolveVerifyCheckId('不存在的项')).toThrow(/不是验收项/);
    });

    it('证据路径挡绝对路径与 ..', () => {
      expect(() => assertAnchorPathShape('/etc/passwd')).toThrow(/相对路径/);
      expect(() => assertAnchorPathShape('..\\outside.txt')).toThrow(/\.\./);
      expect(() => assertAnchorPathShape('src/a.ts')).not.toThrow();
    });

    it('报备必须给锚点、测试类必须给命令', () => {
      const contract = VERIFY_CHECKS[0]!;
      expect(() => validateVerifyReportInput(contract, { result: 'pass', summary: '过了', anchors: [] })).toThrow(/锚点/);
      expect(() => validateVerifyReportInput(contract, {
        result: 'pass', summary: '过了', anchors: [{ file: 'evidence.md' }],
      })).toThrow(/复跑命令/);
    });

    it('deferred 必须带四条 findings', () => {
      const deadCode = VERIFY_CHECKS[2]!;
      expect(() => validateVerifyReportInput(deadCode, {
        result: 'deferred', summary: '有 2 个无用导出', anchors: [{ file: 'evidence.md' }],
      })).toThrow(/findings/);
      expect(() => validateVerifyReportInput(deadCode, {
        result: 'deferred',
        summary: '有 2 个无用导出',
        anchors: [{ file: 'evidence.md' }],
        findings: [{ location: 'a.ts:3', problem: '无用导出', why_not_fixed: '下轮统一删', impact: '无' }],
      })).not.toThrow();
    });

    it('汇总把 pending 当成未完成', () => {
      const progress = summarizeVerification(createVerification(1));
      expect(progress).toMatchObject({ pass: 0, deferred: 0, pending: 7, complete: false });
    });
  });

  describe('数据层：轮次与锚点', () => {
    it('旧快照没有 verification 字段时回落到七项全空', async () => {
      const node = await seedAt('implementing');
      const state = await repo.getVerification(node.workflowId, node.nodeId);
      expect(state.round).toBe(0);
      expect(state.items).toHaveLength(7);
      expect(state.items.every((item) => item.mark === 'pending')).toBe(true);
    });

    it('进「验收中」开新一轮并清空旧标记', async () => {
      const node = await seedAt('verifying');
      await reportAll(node.workflowId, node.nodeId);
      const before = await repo.getVerification(node.workflowId, node.nodeId);
      expect(before.items.every((item) => item.mark === 'pass')).toBe(true);

      await repo.transitionNode({ id: node.workflowId, nodeId: node.nodeId, to: 'implementing' });
      await repo.transitionNode({ id: node.workflowId, nodeId: node.nodeId, to: 'verifying' });
      const after = await repo.getVerification(node.workflowId, node.nodeId);
      expect(after.round).toBe(before.round + 1);
      expect(after.items.every((item) => item.mark === 'pending')).toBe(true);
    });

    it('锚点文件不存在 / 行号越界 / 跑出目录都被拒', async () => {
      const node = await seedAt('verifying');
      const base = { workflowId: node.workflowId, nodeId: node.nodeId, itemId: 3 };
      await expect(repo.submitVerifyReport({
        ...base,
        report: { result: 'pass', summary: 'x', anchors: [{ file: 'nope.md' }] },
      })).rejects.toThrow(/不存在/);
      await expect(repo.submitVerifyReport({
        ...base,
        report: { result: 'pass', summary: 'x', anchors: [{ file: 'evidence.md', line: 99 }] },
      })).rejects.toThrow(/行号/);
      await expect(repo.submitVerifyReport({
        ...base,
        report: { result: 'pass', summary: 'x', anchors: [{ file: '../outside.md' }] },
      })).rejects.toThrow(/工作目录/);
    });

    it('deferred 落 ？，取消勾回到 ○ 并作废报备', async () => {
      const node = await seedAt('verifying');
      const { item } = await repo.submitVerifyReport({
        workflowId: node.workflowId,
        nodeId: node.nodeId,
        itemId: 3,
        report: {
          result: 'deferred',
          summary: '查出 2 个无用导出，本轮不删',
          anchors: [{ file: 'evidence.md', line: 2 }],
          findings: [{ location: 'evidence.md:2', problem: '无用导出', why_not_fixed: '下一轮统一清理', impact: '无' }],
        },
      });
      expect(item.mark).toBe('deferred');

      const { item: cancelled } = await repo.cancelVerifyMark({
        workflowId: node.workflowId,
        nodeId: node.nodeId,
        itemId: 3,
      });
      expect(cancelled.mark).toBe('pending');
      expect(cancelled.report).toBeNull();
    });
  });

  describe('接口层：工具与已完结前置', () => {
    it('报备落 ✓，并返回进度', async () => {
      const node = await seedAt('verifying');
      const { tool } = makeRuntime(repo, stateRef);
      const value = await tool('workflow_verify_report').execute({
        item: '1',
        result: 'pass',
        summary: '契约测试 12 项全过',
        anchors: [{ file: 'evidence.md', line: 1 }],
        command: 'node test.mjs',
      }, exec);
      expect(value.value.item).toMatchObject({ id: 1, mark: 'pass' });
      expect(value.value.progress.pending).toBe(6);
      expect(node.nodeId).toBeTruthy();
    });

    it('AI 不能直接打勾，只能取消', async () => {
      const node = await seedAt('verifying');
      const { tool } = makeRuntime(repo, stateRef);
      await expect(tool('workflow_verify_check').execute({ item: 1, done: true }, exec))
        .rejects.toThrow(/不能直接打验收勾/);

      await repo.submitVerifyReport({
        workflowId: node.workflowId,
        nodeId: node.nodeId,
        itemId: 1,
        report: { result: 'pass', summary: '通过', anchors: [{ file: 'evidence.md' }] },
      });
      const value = await tool('workflow_verify_check').execute({ item: 1, done: false }, exec);
      expect(value.value.item.mark).toBe('pending');
    });

    it('不在「验收中」时拒绝报备', async () => {
      await seedAt('implementing');
      stateRef.value = 'implementing';
      const { tool } = makeRuntime(repo, stateRef);
      await expect(tool('workflow_verify_report').execute({
        item: 1, result: 'pass', summary: 'x', anchors: [{ file: 'evidence.md' }], command: 'node x',
      }, exec)).rejects.toThrow(/不允许调用|只能在「验收中」/);
    });

    it('七项没处理完不能进「已完结」，全处理后放行', async () => {
      const node = await seedAt('verifying');
      stateRef.value = 'verifying';
      const { tool, requests } = makeRuntime(repo, stateRef);

      await expect(tool('workflow_advance').execute({ to: 'completed' }, exec)).rejects.toThrow(/没处理/);

      await reportAll(node.workflowId, node.nodeId);
      const value = await tool('workflow_advance').execute({ to: 'completed' }, exec);
      expect(value.value.requested).toBe('completed');
      expect(requests[0]).toMatchObject({ sessionId: SESSION, to: 'completed' });
    });
  });
});
