import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository, buildRootNode } from '../src/host/workflow-repository';

describe('WorkflowRepository（自己的 workflow 存储，与 dsh workspace 无关）', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-repo-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('空仓库 list 返回 []', async () => {
    const repo = new WorkflowRepository(dir);
    expect(await repo.list()).toEqual([]);
  });

  it('create 自动建根节点并落盘，list 能读回摘要', async () => {
    const repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: 'D:\\proj\\x' });
    expect(created.title).toBe('x');
    expect(created.path).toBe('D:\\proj\\x');

    const items = await repo.list();
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(created.id);
    expect(items[0]?.title).toBe('x');
    expect(items[0]?.path).toBe('D:\\proj\\x');
  });

  it('传了非空 title 就用它，并去掉首尾空白', async () => {
    const repo = new WorkflowRepository(dir);
    const created = await repo.create({ title: '  复盘  ', path: 'D:\\proj\\x' });
    expect(created.title).toBe('复盘');
  });

  it('get 读回快照：根节点是 workspace 类型、parent 为 null、初始态 not_started', async () => {
    const repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: 'D:\\proj\\x' });
    const snapshot = await repo.get(created.id);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.nodes).toHaveLength(1);
    const root = snapshot?.nodes[0];
    expect(root?.node_id).toBe(created.id);
    expect(root?.node_type).toBe('workspace');
    expect(root?.parent_id).toBeNull();
    expect(root?.current_state).toBe('not_started');
    expect(root?.child_ids).toEqual([]);
  });

  it('get 找不到时返回 null', async () => {
    const repo = new WorkflowRepository(dir);
    expect(await repo.get('no-such-id')).toBeNull();
  });

  it('addNode 在根节点下加子节点，父子双向关联', async () => {
    const repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: 'D:\\proj\\x' });
    const updated = await repo.addNode({ id: created.id, parentId: created.id, title: '  子任务  ' });

    expect(updated.nodes).toHaveLength(2);
    const root = updated.nodes.find((node) => node.node_id === created.id);
    const child = updated.nodes.find((node) => node.node_id !== created.id);

    expect(root?.child_ids).toEqual([child?.node_id]);
    expect(child?.parent_id).toBe(created.id);
    expect(child?.depth).toBe(1);
    expect(child?.title).toBe('子任务');
    expect(child?.node_type).toBe('task');
  });

  it('addNode 支持多层嵌套（子节点再加子节点）', async () => {
    const repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: 'D:\\proj\\x' });
    const level1 = await repo.addNode({ id: created.id, parentId: created.id, title: '一层' });
    const first = level1.nodes.find((node) => node.parent_id === created.id)!;
    const level2 = await repo.addNode({ id: created.id, parentId: first.node_id, title: '二层' });

    const second = level2.nodes.find((node) => node.node_id !== first.node_id && node.node_id !== created.id)!;
    expect(second.parent_id).toBe(first.node_id);
    expect(second.depth).toBe(2);
    expect(level2.nodes.find((node) => node.node_id === first.node_id)?.child_ids).toEqual([second.node_id]);
  });

  it('addNode 找不到父节点时报错', async () => {
    const repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: 'D:\\proj\\x' });
    await expect(repo.addNode({ id: created.id, parentId: 'nope', title: 'x' })).rejects.toThrow('找不到父节点');
  });

  it('buildRootNode 直接产出合法根节点', () => {
    const node = buildRootNode('r', 8, 200);
    expect(node).toMatchObject({
      node_id: 'r',
      parent_id: null,
      node_type: 'workspace',
      current_state: 'not_started',
      child_ids: [],
      flags: [],
      depth: 0,
      max_depth: 8,
      step_count: 0,
      max_steps: 200,
    });
  });
});
