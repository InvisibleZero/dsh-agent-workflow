import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadInstrumentationJson, saveInstrumentationJson } from '../src/host/instrumentation-store';
import { VERIFY_CHECKS } from '../src/schema/verify-checks';
import { pickVerification } from '../src/engine/verify-rules';
import type { InstrumentationPlan } from '../src/schema/instrumentation';

const PLAN: InstrumentationPlan = {
  tree_version: 1,
  root: {
    id: 'none',
    label: 'none',
    children: [{
      id: 'bug-1',
      label: '验收没使用工具',
      children: [{
        id: 'path-1',
        label: '门禁没起作用',
        instrument: { function: 'invokeVerifyReport', event: 'gate check', tree_version: 1, kind: 'path' },
        children: [{
          id: 'path-2',
          label: '提示没到位',
          instrument: { function: 'buildVerifyPrompt', event: 'verify prompt', tree_version: 1, kind: 'path' },
          children: [],
        }],
      }],
    }],
  },
  nodes: {
    'invokeVerifyReport::gate check': { function: 'invokeVerifyReport', event: 'gate check', tree_version: 1, kind: 'path' },
    'buildVerifyPrompt::verify prompt': { function: 'buildVerifyPrompt', event: 'verify prompt', tree_version: 1, kind: 'path' },
  },
};

describe('数据层：埋点计划证据读写', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'wf-instr-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('写后能读回同一份计划，落在 .workflow/evidence/instrumentation.json', async () => {
    await saveInstrumentationJson(dir, PLAN);
    const raw = await readFile(join(dir, '.workflow', 'evidence', 'instrumentation.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual(PLAN);
    const loaded = await loadInstrumentationJson(dir);
    expect(loaded).toEqual(PLAN);
  });

  it('没写过时返回 null（还没建树，不是错误）', async () => {
    expect(await loadInstrumentationJson(dir)).toBeNull();
  });

  it('证据文件坏掉要抛错，不能当成没建', async () => {
    await mkdir(join(dir, '.workflow', 'evidence'), { recursive: true });
    await writeFile(join(dir, '.workflow', 'evidence', 'instrumentation.json'), '{ not json', 'utf8');
    await expect(loadInstrumentationJson(dir)).rejects.toThrow(/解析失败/);
  });
});

describe('迁移：第 6 项从无检查器改成协助型', () => {
  it('第 6 项挂 instrumentation：协助型 + 要求本轮至少跑一次，不卡 ok', () => {
    const check = VERIFY_CHECKS.find((entry) => entry.id === 6);
    expect(check?.checker).toEqual({ id: 'instrumentation', enforcement: 'assistive', require_run: true });
  });

  it('第 5 项命名审查仍然没有检查器', () => {
    expect(VERIFY_CHECKS.find((entry) => entry.id === 5)?.checker).toBeUndefined();
  });

  it('旧快照（没有 verification）回落八项全空，第 6 项是 ○', () => {
    const state = pickVerification(undefined);
    expect(state.items).toHaveLength(8);
    expect(state.items.every((item) => item.mark === 'pending')).toBe(true);
  });
});
