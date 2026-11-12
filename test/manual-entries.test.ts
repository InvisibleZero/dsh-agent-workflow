import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';

/**
 * 项目手册条目级写入：一条一写、必须带标签、标签表自动登记、表满 30 条拒新增、rename_tag 级联。
 * 这里的断言都读真实落盘的文件，不只看返回值。
 */
describe('项目手册条目写入（标签强制）', () => {
  let dir: string;
  let workDir: string;
  let repo: WorkflowRepository;
  let workflowId: string;
  let manualPath: string;

  const readManual = async (): Promise<string> => readFile(manualPath, 'utf8');

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-tags-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-tags-work-'));
    repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: workDir });
    workflowId = created.id;
    manualPath = join(workDir, '.workflow', '项目手册.md');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('追加条目：写成 `- [标签] 正文`，新标签自动登记进标签表', async () => {
    const result = await repo.appendProjectEntry({
      workflowId, section: '坑与防线', tags: ['门禁', '状态'], content: '状态表永不回填 → 工具误判',
    });
    expect(result.registered).toEqual(['门禁', '状态']);
    const manual = await readManual();
    expect(manual).toContain('- [门禁｜状态] 状态表永不回填 → 工具误判');
    expect(manual).toContain('## 标签表');
    expect(manual).toContain('- 门禁');
    expect(manual).toContain('- 状态');
  });

  it('没带标签直接拒写，报错说明要带 tags', async () => {
    await expect(repo.appendProjectEntry({
      workflowId, section: '坑与防线', tags: [], content: '没有标签的条目',
    })).rejects.toThrow(/必须带至少一个标签/);
    expect(await readManual()).not.toContain('没有标签的条目');
  });

  it('非法标签拒写（带方括号 / 超长）', async () => {
    await expect(repo.appendProjectEntry({
      workflowId, section: '坑与防线', tags: ['a[b'], content: 'x',
    })).rejects.toThrow(/不合法/);
  });

  it('标签表满 30 条后，新标签拒写并提示用 rename_tag 合并', async () => {
    const tags = Array.from({ length: 30 }, (_, index) => `tag${index + 1}`);
    await repo.appendProjectEntry({ workflowId, section: '坑与防线', tags, content: '一口气登记 30 个标签' });

    await expect(repo.appendProjectEntry({
      workflowId, section: '坑与防线', tags: ['新标签'], content: '第三十一号',
    })).rejects.toThrow(/上限 30 条.*rename_tag/s);
  });

  it('rename_tag 级联改写所有条目，并从标签表删掉旧标签，不占额度', async () => {
    await repo.appendProjectEntry({ workflowId, section: '坑与防线', tags: ['写门禁'], content: '旧叫法第一条' });
    await repo.appendProjectEntry({ workflowId, section: '决策记录', tags: ['写门禁', '注入'], content: '旧叫法第二条' });

    const renamed = await repo.renameProjectTag({ workflowId, from: '写门禁', to: '门禁' });
    expect(renamed.rewritten).toBe(2);
    expect(renamed.tags).toEqual(['门禁', '注入']);

    const manual = await readManual();
    expect(manual).toContain('- [门禁] 旧叫法第一条');
    expect(manual).toContain('- [门禁｜注入] 旧叫法第二条');
    expect(manual).not.toContain('写门禁');
  });

  it('rename_tag 合并不存在的新标签时也合法：表大小不变', async () => {
    await repo.appendProjectEntry({ workflowId, section: '坑与防线', tags: ['a', 'b'], content: '条目' });
    const result = await repo.renameProjectTag({ workflowId, from: 'a', to: 'b' });
    expect(result.tags).toEqual(['b']);
    expect(await readManual()).toContain('- [b] 条目');
  });

  it('rename_tag 拒绝表里没有的标签，并列出可用标签', async () => {
    await repo.appendProjectEntry({ workflowId, section: '坑与防线', tags: ['门禁'], content: '条目' });
    await expect(repo.renameProjectTag({ workflowId, from: '不存在', to: '门禁' }))
      .rejects.toThrow(/标签表里没有「不存在」.*门禁/s);
  });

  it('改条目：按正文精确匹配，保留标签可改', async () => {
    await repo.appendProjectEntry({ workflowId, section: '坑与防线', tags: ['门禁'], content: '原标题' });
    await repo.updateProjectEntry({
      workflowId, section: '坑与防线', entry: '原标题', tags: ['门禁', '新增'], content: '改后标题',
    });
    const manual = await readManual();
    expect(manual).toContain('- [门禁｜新增] 改后标题');
    expect(manual).not.toContain('原标题');
  });

  it('删条目：删掉整行，不留下空壳', async () => {
    await repo.appendProjectEntry({ workflowId, section: '坑与防线', tags: ['门禁'], content: '待删条目' });
    await repo.appendProjectEntry({ workflowId, section: '坑与防线', tags: ['门禁'], content: '留下的条目' });
    const removed = await repo.removeProjectEntry({ workflowId, section: '坑与防线', entry: '待删条目' });
    expect(removed.removed).toContain('待删条目');
    const manual = await readManual();
    expect(manual).not.toContain('待删条目');
    expect(manual).toContain('留下的条目');
  });

  it('条目不能写进「标签表」小节（由工具自动维护）', async () => {
    await expect(repo.appendProjectEntry({
      workflowId, section: '标签表', tags: ['门禁'], content: 'x',
    })).rejects.toThrow(/条目只能写进这些小节/);
  });

  it('「约束」一节仍受 300 字闸门约束（条目写入也不例外）', async () => {
    await repo.appendProjectEntry({ workflowId, section: '约束', tags: ['红线'], content: '禁'.repeat(290) });
    await expect(repo.appendProjectEntry({
      workflowId, section: '约束', tags: ['红线'], content: '禁'.repeat(290),
    })).rejects.toThrow(/「约束」现在 \d+ 字，上限 300 字/);
  });

  it('listProjectTags 读回登记过的标签，空表返回空数组', async () => {
    expect(await repo.listProjectTags(workflowId)).toEqual([]);
    await repo.appendProjectEntry({ workflowId, section: '坑与防线', tags: ['门禁', 'gate'], content: '条目' });
    expect(await repo.listProjectTags(workflowId)).toEqual(['门禁', 'gate']);
  });
});
