import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository, buildRootNode } from '../src/host/workflow-repository';

describe('WorkflowRepository（自己的 workflow 存储，与 dsh workspace 无关）', () => {
  let dir: string;
  let workDir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-repo-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-work-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('空仓库 list 返回 []', async () => {
    const repo = new WorkflowRepository(dir);
    expect(await repo.list()).toEqual([]);
  });

  it('create 自动建根节点并落盘，list 能读回摘要', async () => {
    const repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: workDir });
    expect(created.title).toBe(workDir.split(/[\\/]/).pop());
    expect(created.path).toBe(workDir);

    const items = await repo.list();
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(created.id);
    expect(items[0]?.path).toBe(workDir);
  });

  it('传了非空 title 就用它，并去掉首尾空白', async () => {
    const repo = new WorkflowRepository(dir);
    const created = await repo.create({ title: '  复盘  ', path: workDir });
    expect(created.title).toBe('复盘');
  });

  it('get 读回快照：根节点是 workspace 类型、parent 为 null、初始态 discussing', async () => {
    const repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: workDir });
    const snapshot = await repo.get(created.id);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.nodes).toHaveLength(1);
    const root = snapshot?.nodes[0];
    expect(root?.node_id).toBe(created.id);
    expect(root?.node_type).toBe('workspace');
    expect(root?.parent_id).toBeNull();
    expect(root?.current_state).toBe('discussing');
    expect(root?.child_ids).toEqual([]);
  });

  it('get 找不到时返回 null', async () => {
    const repo = new WorkflowRepository(dir);
    expect(await repo.get('no-such-id')).toBeNull();
  });

  it('buildRootNode 直接产出合法根节点', () => {
    const node = buildRootNode('r', 8, 200);
    expect(node).toMatchObject({
      node_id: 'r',
      parent_id: null,
      node_type: 'workspace',
      current_state: 'discussing',
      child_ids: [],
      flags: [],
      depth: 0,
      max_depth: 8,
      step_count: 0,
      max_steps: 200,
    });
  });
});

describe('WorkflowRepository：会话自动认领（ensure-node）', () => {
  let dir: string;
  let workDir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-repo-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-work-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('首次认领建 workflow + 节点，并铺出两层手册文件', async () => {
    const repo = new WorkflowRepository(dir);
    const node = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });

    expect(node.current_state).toBe('discussing');
    expect(node.title).toBe('新会话');

    const snapshot = await repo.get(node.workflowId);
    expect(snapshot?.working_directory).toBe(workDir);
    expect(snapshot?.nodes.some((candidate) => candidate.session_id === 's-1')).toBe(true);

    const sessionManual = await readFile(join(workDir, '.workflow', `会话手册-${node.nodeId}.md`), 'utf8');
    expect(sessionManual).toContain('## 实施顺序');
    const globalManual = await readFile(join(workDir, '.workflow', '项目手册.md'), 'utf8');
    expect(globalManual).toContain('## 项目总览');
  });

  it('同一会话再次认领返回同一节点（幂等）', async () => {
    const repo = new WorkflowRepository(dir);
    const first = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });
    const second = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });
    expect(second.nodeId).toBe(first.nodeId);
    expect(second.workflowId).toBe(first.workflowId);

    const snapshot = await repo.get(first.workflowId);
    expect(snapshot?.nodes.filter((candidate) => candidate.session_id === 's-1')).toHaveLength(1);
  });

  it('同目录的两个会话共用同一个 workflow，各自一个节点', async () => {
    const repo = new WorkflowRepository(dir);
    const first = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });
    const second = await repo.ensureNode({ sessionId: 's-2', workingDirectory: workDir });
    expect(second.workflowId).toBe(first.workflowId);
    expect(second.nodeId).not.toBe(first.nodeId);
  });

  it('findBySession 能按会话反查节点，未知会话返回 null', async () => {
    const repo = new WorkflowRepository(dir);
    const created = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });
    const found = await repo.findBySession('s-1');
    expect(found?.nodeId).toBe(created.nodeId);
    expect(found?.workflowId).toBe(created.workflowId);
    expect(await repo.findBySession('nope')).toBeNull();
  });

  it('sidebar-nodes 按目录批量给出会话状态映射', async () => {
    const repo = new WorkflowRepository(dir);
    await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });
    await repo.ensureNode({ sessionId: 's-2', workingDirectory: workDir });
    const map = await repo.getNodeStatesByDirectory(workDir);
    expect(Object.keys(map).sort()).toEqual(['s-1', 's-2']);
    expect(map['s-1']).toBe('discussing');
    expect(await repo.getNodeStatesByDirectory('D:\\no\\such\\dir')).toEqual({});
  });

  it('缺少工作目录时报错', async () => {
    const repo = new WorkflowRepository(dir);
    await expect(repo.ensureNode({ sessionId: 's-1', workingDirectory: '   ' })).rejects.toThrow('缺少工作目录');
  });

  it('getAllNodeStates 跨工作区汇总全部已绑定会话（不依赖进程内名单）', async () => {
    const repo = new WorkflowRepository(dir);
    const otherDir = await mkdtemp(join(tmpdir(), 'wf-work-'));
    try {
      await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });
      await repo.ensureNode({ sessionId: 's-2', workingDirectory: otherDir });
      // 直接新建一个仓库实例读盘：模拟重启后新进程，内存里没有任何认领记录。
      const fresh = new WorkflowRepository(dir);
      expect(await fresh.getAllNodeStates()).toEqual({ 's-1': 'discussing', 's-2': 'discussing' });
    } finally {
      await rm(otherDir, { recursive: true, force: true });
    }
  });

  it('getAllNodeStates 跳过损坏快照，空目录返回空表', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'wf-empty-'));
    try {
      expect(await new WorkflowRepository(empty).getAllNodeStates()).toEqual({});
    } finally {
      await rm(empty, { recursive: true, force: true });
    }

    const repo = new WorkflowRepository(dir);
    await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });
    await mkdir(join(dir, 'workflows'), { recursive: true });
    await writeFile(join(dir, 'workflows', 'broken.json'), '{ not json', 'utf8');

    const onBroken = vi.fn();
    const map = await repo.getAllNodeStates(onBroken);
    expect(Object.keys(map)).toEqual(['s-1']);
    expect(map['s-1']).toBe('discussing');
    // 坏快照被跳过时要把文件名交出来：否则「没有这个会话」和「快照读坏了」分不开。
    expect(onBroken).toHaveBeenCalledTimes(1);
    expect(onBroken.mock.calls[0]?.[0]).toBe('broken.json');
  });
});

describe('WorkflowRepository：状态推进与时间线', () => {
  let dir: string;
  let workDir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-repo-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-work-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('五态正向推进每次都落一条时间线', async () => {
    const repo = new WorkflowRepository(dir);
    const node = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });

    // 新节点一建出来就在「讨论中」，推三次到完结；每次一条时间线。
    for (const to of ['implementing', 'verifying', 'completed']) {
      await repo.transitionNode({ id: node.workflowId, nodeId: node.nodeId, to });
    }

    const snapshot = await repo.get(node.workflowId);
    const moved = snapshot?.nodes.find((candidate) => candidate.node_id === node.nodeId);
    expect(moved?.current_state).toBe('completed');
    expect(moved?.history).toHaveLength(3);
    expect(moved?.history?.[0]).toMatchObject({ from: 'discussing', to: 'implementing' });
    expect(moved?.history?.[2]).toMatchObject({ from: 'verifying', to: 'completed' });
  });

  it('返工（退回上一阶段）同样记时间线', async () => {
    const repo = new WorkflowRepository(dir);
    const node = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });
    await repo.transitionNode({ id: node.workflowId, nodeId: node.nodeId, to: 'implementing' });
    await repo.transitionNode({ id: node.workflowId, nodeId: node.nodeId, to: 'verifying' });
    const snapshot = await repo.transitionNode({ id: node.workflowId, nodeId: node.nodeId, to: 'implementing' });
    const moved = snapshot.nodes.find((candidate) => candidate.node_id === node.nodeId);
    expect(moved?.current_state).toBe('implementing');
    expect(moved?.history?.[2]).toMatchObject({ from: 'verifying', to: 'implementing' });
  });

  it('非法状态被拒，且不改动落盘内容', async () => {
    const repo = new WorkflowRepository(dir);
    const node = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });
    await expect(repo.transitionNode({ id: node.workflowId, nodeId: node.nodeId, to: 'bogus' })).rejects.toThrow('非法状态');
    const moved = (await repo.get(node.workflowId))?.nodes.find((candidate) => candidate.node_id === node.nodeId);
    expect(moved?.current_state).toBe('discussing');
    expect(moved?.history).toBeUndefined();
  });

  it('节点不存在时报错', async () => {
    const repo = new WorkflowRepository(dir);
    const node = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });
    await expect(repo.transitionNode({ id: node.workflowId, nodeId: 'nope', to: 'discussing' })).rejects.toThrow('找不到节点');
  });
});

describe('WorkflowRepository：会话绑定 / 回收站 / 手册读取', () => {
  let dir: string;
  let workDir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-repo-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-work-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('bind-session 能绑也能解绑', async () => {
    const repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: workDir });
    const bound = await repo.bindSession({ id: created.id, nodeId: created.id, sessionId: '  s-9  ' });
    expect(bound.nodes[0]?.session_id).toBe('s-9');
    const unbound = await repo.bindSession({ id: created.id, nodeId: created.id, sessionId: '' });
    expect('session_id' in (unbound.nodes[0] ?? {})).toBe(false);
  });

  it('删进回收站、能列出来、能还原', async () => {
    const repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: workDir });
    await repo.remove(created.id);
    expect(await repo.get(created.id)).toBeNull();

    const trash = await repo.listTrash();
    expect(trash.some((item) => item.id === created.id)).toBe(true);

    expect(await repo.restoreFromTrash(created.id)).toBe(true);
    expect(await repo.get(created.id)).not.toBeNull();
  });

  it('readNodeManual / getManualMeta 读得到会话手册与实施清单', async () => {
    const repo = new WorkflowRepository(dir);
    const node = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });

    const manual = await repo.readNodeManual(node.workflowId, node.nodeId);
    expect(manual?.manual).toContain('## 方案');
    expect(manual?.notesDir).toBe(join(workDir, '.workflow'));

    const meta = await repo.getManualMeta(node.workflowId, node.nodeId);
    expect(meta?.checklist).toHaveLength(4);
    expect(meta?.hasPlan).toBe(false);
  });

  it('「默认存档」只读：直接改会被拒绝，另存为之后才能改', async () => {
    const repo = new WorkflowRepository(dir);

    // 内置存档只读
    await expect(repo.updateAppGlobalOperationDetail({
      shared_detail: '公共细节',
      discussing: { operation_detail: '讨论细节', enter_trigger: null },
      implementing: { operation_detail: '实现细节', enter_trigger: '开始实现' },
      verifying: { operation_detail: '验收细节', enter_trigger: null },
    })).rejects.toThrow(/不可修改/);

    // 另存为一份自己的存档，切过去之后就能改
    const saved = await repo.saveProfile('我的存档');
    expect(saved.active).toBe('我的存档');
    expect(saved.names).toContain('默认存档');
    expect(saved.names).toContain('我的存档');

    const updated = await repo.updateAppGlobalOperationDetail({
      shared_detail: '公共细节',
      discussing: { operation_detail: '讨论细节', enter_trigger: null },
      implementing: { operation_detail: '实现细节', enter_trigger: '开始实现' },
      verifying: { operation_detail: '验收细节', enter_trigger: null },
    });
    expect(updated.implementing.enter_trigger).toBe('开始实现');
    expect((await repo.getAppGlobalOperationDetail()).shared_detail).toBe('公共细节');
  });

  it('存档可以切换、删除；切回「默认存档」读到的是出厂值', async () => {
    const repo = new WorkflowRepository(dir);
    await repo.saveProfile('前端项目');
    const names = (await repo.listProfiles()).names;
    expect(names[0]).toBe('默认存档');

    // 内置存档不可删、不可被覆盖
    await expect(repo.deleteProfile('默认存档')).rejects.toThrow(/不能删除/);
    await expect(repo.saveProfile('默认存档')).rejects.toThrow(/内置/);

    await repo.activateProfile('默认存档');
    expect((await repo.getAppGlobalOperationDetail()).discussing.operation_detail)
      .toContain('先对齐');

    await repo.deleteProfile('前端项目');
    expect((await repo.listProfiles()).names).toEqual(['默认存档']);
  });

  it('导出的存档能再导入（不自动切换）', async () => {
    const repo = new WorkflowRepository(dir);
    await repo.saveProfile('待导出');
    await repo.activateProfile('默认存档');

    const exported = await repo.exportActiveProfile();
    const json = await readFile(exported.path, 'utf8');
    const imported = await repo.importProfile('导入副本', json);
    expect(imported.imported).toBe('导入副本');
    expect(imported.names).toContain('导入副本');
    // 导入不改变当前生效的存档
    expect((await repo.listProfiles()).active).toBe('默认存档');
  });
});

describe('WorkflowRepository：手册编辑与勾选（AI 工具的实现）', () => {
  let dir: string;
  let workDir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-repo-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-work-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('按小节替换「方案」，其它小节原样保留', async () => {
    const repo = new WorkflowRepository(dir);
    const node = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });

    await repo.replaceManualSection({
      workflowId: node.workflowId,
      nodeId: node.nodeId,
      section: '方案',
      content: '### 1. 目标与验收\n\n做一个计算器',
    });

    const manual = await repo.readManual(node.workflowId, node.nodeId);
    expect(manual).toContain('做一个计算器');
    // 结构没被破坏：标题与「实施顺序」都还在。
    expect(manual).toContain('## 方案');
    expect(manual).toContain('## 实施顺序');
    expect(manual).toContain('- [ ] 数据层');

    const meta = await repo.getManualMeta(node.workflowId, node.nodeId);
    expect(meta?.hasPlan).toBe(true);
  });

  it('替换不存在的小节时报错并列出可用小节', async () => {
    const repo = new WorkflowRepository(dir);
    const node = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });
    await expect(repo.replaceManualSection({
      workflowId: node.workflowId,
      nodeId: node.nodeId,
      section: '乱七八糟',
      content: 'x',
    })).rejects.toThrow(/可用小节/);
  });

  it('项目手册也能按小节写入并读回', async () => {
    const repo = new WorkflowRepository(dir);
    const node = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });
    await repo.replaceManualSection({
      workflowId: node.workflowId,
      nodeId: null,
      section: '坑与防线',
      content: '- 坑一：别在讨论中动手',
    });
    const project = await repo.readManual(node.workflowId, null);
    expect(project).toContain('坑一');
    expect(project).toContain('## 项目总览');
  });

  it('旧版项目手册缺新小节时追加，不报错', async () => {
    const repo = new WorkflowRepository(dir);
    const node = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });
    // 覆盖成旧模板（只有总览 / 决策 / 要点），模拟历史数据。
    const projectPath = join(workDir, '.workflow', '项目手册.md');
    await writeFile(projectPath, ['# 项目手册', '', '## 项目总览', '老项目', '', '## 决策记录', '', '## 要点 / 疑难杂症', '- 老坑', ''].join('\n'), 'utf8');

    await repo.replaceManualSection({
      workflowId: node.workflowId,
      nodeId: null,
      section: '约束',
      content: '- 不许写生产库',
    });
    const sections = await repo.readGlobalManualSections(node.workflowId);
    expect(sections.constraints).toContain('不许写生产库');
    expect(sections.overview).toContain('老项目');

    // 「坑与防线」在旧手册里叫「要点」，写入要命中旧标题而不是另起一节。
    await repo.replaceManualSection({
      workflowId: node.workflowId,
      nodeId: null,
      section: '坑与防线',
      content: '- 现象 → 根因 → 防线',
    });
    const after = await repo.readGlobalManualSections(node.workflowId);
    expect(after.pitfalls).toContain('防线');
    expect(after.pitfalls).not.toContain('老坑');
  });

  it('勾选按条目原文精确匹配，找不到时列出可勾项', async () => {
    const repo = new WorkflowRepository(dir);
    const node = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });

    const items = await repo.setChecklistItem({
      workflowId: node.workflowId,
      nodeId: node.nodeId,
      label: '数据层 —— 完成标准：能读写、迁移可跑',
      done: true,
      evidence: '跑 node test.mjs，3 项全过',
    });
    expect(items.find((item) => item.label === '数据层 —— 完成标准：能读写、迁移可跑')?.done).toBe(true);
    expect(items.filter((item) => item.done).length).toBe(1);

    await expect(repo.setChecklistItem({
      workflowId: node.workflowId,
      nodeId: node.nodeId,
      label: '不存在的条目',
      done: true,
      evidence: '随便写点',
    })).rejects.toThrow(/可勾选/);
  });

  it('勾选时不给证据会被拒绝', async () => {
    const repo = new WorkflowRepository(dir);
    const node = await repo.ensureNode({ sessionId: 's-1', workingDirectory: workDir });

    await expect(repo.setChecklistItem({
      workflowId: node.workflowId,
      nodeId: node.nodeId,
      label: '数据层 —— 完成标准：能读写、迁移可跑',
      done: true,
    })).rejects.toThrow(/evidence/);
  });
});
