import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowRepository } from '../src/host/workflow-repository';
import { DEFAULT_MANUAL_LIMITS } from '../src/schema/manual-limits';

describe('手册写入闸门（按小节判字数，超了拒写）', () => {
  let dir: string;
  let workDir: string;
  let repo: WorkflowRepository;
  let workflowId: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-gate-'));
    workDir = await mkdtemp(join(tmpdir(), 'wf-gate-work-'));
    repo = new WorkflowRepository(dir);
    const created = await repo.create({ path: workDir });
    workflowId = created.id;
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('项目手册「约束」：300 字放行、301 字拒绝', async () => {
    const ok = await repo.replaceManualSection({
      workflowId, nodeId: null, section: '约束', content: 'x'.repeat(300),
    });
    expect(ok.chars).toBe(300);

    await expect(repo.replaceManualSection({
      workflowId, nodeId: null, section: '约束', content: 'x'.repeat(301),
    })).rejects.toThrow(/「约束」现在 301 字，上限 300 字，超 1 字/);
  });

  it('会话手册「方案」：1200 字放行、1201 字拒绝', async () => {
    const ok = await repo.replaceManualSection({
      workflowId, nodeId: workflowId, section: '方案', content: 'x'.repeat(1200),
    });
    expect(ok.chars).toBe(1200);

    await expect(repo.replaceManualSection({
      workflowId, nodeId: workflowId, section: '方案', content: 'x'.repeat(1201),
    })).rejects.toThrow(/「方案」现在 1201 字，上限 1200 字，超 1 字/);
  });

  it('勾选证据不计入方案字数：1200 字正文 + 500 字证据照样放行', async () => {
    const content = `${'x'.repeat(1200)} ｜ 自检：${'y'.repeat(500)}`;
    const ok = await repo.replaceManualSection({ workflowId, nodeId: workflowId, section: '方案', content });
    expect(ok.chars).toBe(1200);
  });

  it('会话手册整本超 2000 字：拒写，且提示证据不用删', async () => {
    await repo.replaceManualSection({ workflowId, nodeId: workflowId, section: '方案', content: 'x'.repeat(1200) });
    await expect(repo.replaceManualSection({
      workflowId, nodeId: workflowId, section: '实施顺序', content: `- [ ] 一 —— 完成标准：${'y'.repeat(1000)}`,
    })).rejects.toThrow(/会话手册整本现在 \d+ 字，上限 2000 字/);
  });

  it('上限可配置：调小之后 200 字也写不进去', async () => {
    await repo.updateAppSettings({ manualLimits: { constraints_chars: 100 } });
    await expect(repo.replaceManualSection({
      workflowId, nodeId: null, section: '约束', content: 'x'.repeat(150),
    })).rejects.toThrow(/上限 100 字/);
  });

  it('app-settings 里的脏值被收成合法值，缺字段保留默认', async () => {
    const saved = await repo.updateAppSettings({ manualLimits: { plan_chars: 5 } });
    expect(saved.manualLimits.plan_chars).toBe(20);
    expect(saved.manualLimits.constraints_chars).toBe(DEFAULT_MANUAL_LIMITS.constraints_chars);

    const reloaded = await repo.getAppSettings();
    expect(reloaded.manualLimits.plan_chars).toBe(20);
  });
});
