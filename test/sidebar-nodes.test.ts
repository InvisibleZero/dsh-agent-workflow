import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { readSidebarNodes } from '../src/host/sidebar-nodes';

describe('侧栏状态点数据源（不依赖进程内名单）', () => {
  let dir: string;
  let workA: string;
  let workB: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-side-'));
    workA = await mkdtemp(join(tmpdir(), 'wf-a-'));
    workB = await mkdtemp(join(tmpdir(), 'wf-b-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workA, { recursive: true, force: true });
    await rm(workB, { recursive: true, force: true });
  });

  it('不带目录返回全量；带目录只返回该目录', async () => {
    const repo = new WorkflowRepository(dir);
    await repo.ensureNode({ sessionId: 's-a', workingDirectory: workA });
    await repo.ensureNode({ sessionId: 's-b', workingDirectory: workB });

    expect(await readSidebarNodes(repo, null)).toEqual({ 's-a': 'discussing', 's-b': 'discussing' });
    expect(await readSidebarNodes(repo, '')).toEqual({ 's-a': 'discussing', 's-b': 'discussing' });
    expect(await readSidebarNodes(repo, `  ${workA}  `)).toEqual({ 's-a': 'discussing' });
    expect(await readSidebarNodes(repo, workB)).toEqual({ 's-b': 'discussing' });
  });

  it('换一个仓库实例（模拟重启后的新进程）仍能读到全部已绑定会话', async () => {
    const repo = new WorkflowRepository(dir);
    await repo.ensureNode({ sessionId: 's-a', workingDirectory: workA });
    await repo.ensureNode({ sessionId: 's-b', workingDirectory: workB });

    // 新实例没有任何认领记录：读到的内容必须只来自磁盘快照。
    const freshProcess = new WorkflowRepository(dir);
    expect(await readSidebarNodes(freshProcess, null)).toEqual({ 's-a': 'discussing', 's-b': 'discussing' });
  });

  it('状态推进后全量接口跟着变（读的是同一份快照）', async () => {
    const repo = new WorkflowRepository(dir);
    const node = await repo.ensureNode({ sessionId: 's-a', workingDirectory: workA });
    await repo.transitionNode({ id: node.workflowId, nodeId: node.nodeId, to: 'implementing' });
    expect((await readSidebarNodes(repo, null))['s-a']).toBe('implementing');
  });

  it('不依赖文件系统：传桩仓库也能返回（外部依赖可替换）', async () => {
    const stub = {
      getAllNodeStates: async () => ({ 's-x': 'implementing' }),
      getNodeStatesByDirectory: async (path: string) => ({ [`s-${path}`]: 'discussing' }),
    } as unknown as WorkflowRepository;

    expect(await readSidebarNodes(stub, null)).toEqual({ 's-x': 'implementing' });
    expect(await readSidebarNodes(stub, 'D:/x')).toEqual({ 's-D:/x': 'discussing' });
  });
});
