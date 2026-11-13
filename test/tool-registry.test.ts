import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ToolRegistryStore } from '../src/host/tool-registry';
import { TOOL_KIND, type ToolEntry } from '../src/schema/tool-catalog';

function makeEntry(name: string, overrides: Partial<ToolEntry> = {}): ToolEntry {
  return {
    name,
    description: '跑依赖检查',
    kind: TOOL_KIND.extension,
    run: { kind: 'checker', checker: 'deps' },
    allowed_states: ['verifying'],
    effect: 'exec',
    parameters: { type: 'object', properties: {}, additionalProperties: true },
    version: 1,
    created_at: '2026-11-13T00:00:00.000Z',
    ...overrides,
  };
}

describe('ToolRegistryStore：扩展工具表的读写与降级', () => {
  let dir: string;
  let store: ToolRegistryStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-registry-'));
    store = new ToolRegistryStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('文件不存在：空表、不报损坏', async () => {
    await expect(store.list()).resolves.toEqual({ entries: [], corrupt: false });
  });

  it('save 后可读回，文件是全局平铺（没有 byWorkflow）', async () => {
    await store.save(makeEntry('check_deps'));
    const listing = await store.list();
    expect(listing.corrupt).toBe(false);
    expect(listing.entries.map((entry) => entry.name)).toEqual(['check_deps']);
    const raw = JSON.parse(await readFile(join(dir, 'tool-registry.json'), 'utf8'));
    expect(Array.isArray(raw.tools)).toBe(true);
    expect(raw.byWorkflow).toBeUndefined();
  });

  it('并发 save 不丢条目（串行写）', async () => {
    await Promise.all([
      store.save(makeEntry('a_one')),
      store.save(makeEntry('a_two')),
      store.save(makeEntry('a_three')),
    ]);
    const listing = await store.list();
    expect(listing.entries.map((entry) => entry.name).sort()).toEqual(['a_one', 'a_three', 'a_two']);
  });

  it('save 同名抛错，不产生第二条', async () => {
    await store.save(makeEntry('check_deps'));
    await expect(store.save(makeEntry('check_deps'))).rejects.toThrow(/已在工具表里/);
    const listing = await store.list();
    expect(listing.entries).toHaveLength(1);
  });

  it('update 整条替换，version 跟着变', async () => {
    await store.save(makeEntry('check_deps'));
    await store.update(makeEntry('check_deps', {
      version: 2,
      description: '跑依赖检查（改过）',
      run: { kind: 'checker', checker: 'contract' },
    }));
    const listing = await store.list();
    expect(listing.entries).toHaveLength(1);
    expect(listing.entries[0]?.version).toBe(2);
    expect(listing.entries[0]?.run).toEqual({ kind: 'checker', checker: 'contract' });
  });

  it('update 不存在的工具抛错', async () => {
    await expect(store.update(makeEntry('missing'))).rejects.toThrow(/没有叫/);
  });

  it('JSON 损坏：corrupt=true、表清空，不让坏文件卡住调用', async () => {
    await writeFile(join(dir, 'tool-registry.json'), '{ this is not json', 'utf8');
    const listing = await store.list();
    expect(listing.corrupt).toBe(true);
    expect(listing.entries).toEqual([]);
  });

  it('旧版本（byWorkflow 分组）：按损坏处理，不读旧形状', async () => {
    await writeFile(
      join(dir, 'tool-registry.json'),
      JSON.stringify({ version: 1, byWorkflow: { 'wf-a': [makeEntry('old')] } }),
      'utf8',
    );
    const listing = await store.list();
    expect(listing.corrupt).toBe(true);
    expect(listing.entries).toEqual([]);
  });

  it('脏条目被丢弃并标 corrupt（其余条目仍可用）', async () => {
    await writeFile(
      join(dir, 'tool-registry.json'),
      JSON.stringify({
        version: 2,
        tools: [
          makeEntry('good'),
          { name: 'bad-no-run' },
          makeEntry('bad-empty-states', { allowed_states: [] }),
          makeEntry('bad-script', { run: { kind: 'script', script: 'x.mjs' } as any }),
          makeEntry('bad-base', { kind: 'base' as any }),
        ],
      }),
      'utf8',
    );
    const listing = await store.list();
    expect(listing.corrupt).toBe(true);
    expect(listing.entries.map((entry) => entry.name)).toEqual(['good']);
  });
});
