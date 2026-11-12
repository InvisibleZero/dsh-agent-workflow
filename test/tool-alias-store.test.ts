import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ToolAliasStore } from '../src/host/tool-alias-store';
import type { ToolAliasEntry } from '../src/schema/tool-catalog';

function makeEntry(name: string): ToolAliasEntry {
  return {
    tool_id: `t-${name}`,
    name,
    description: '记一条决策',
    base_tool: 'workflow_manual',
    fixed_args: { target: 'project', action: 'append_entry', section: '决策记录' },
    allowed_states: ['discussing', 'implementing'],
    created_at: '2026-11-13T00:00:00.000Z',
    version: 1,
  };
}

describe('ToolAliasStore：别名目录的读写与降级', () => {
  let dir: string;
  let store: ToolAliasStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-alias-'));
    store = new ToolAliasStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('文件不存在：空目录、不报损坏', async () => {
    await expect(store.list('wf-a')).resolves.toEqual({ aliases: [], corrupt: false });
  });

  it('写入后可读回，且按 workflow 分组互不串', async () => {
    await store.add('wf-a', makeEntry('note_decision'));
    await store.add('wf-b', makeEntry('other'));
    const a = await store.list('wf-a');
    const b = await store.list('wf-b');
    expect(a.corrupt).toBe(false);
    expect(a.aliases.map((entry) => entry.name)).toEqual(['note_decision']);
    expect(b.aliases.map((entry) => entry.name)).toEqual(['other']);
    const raw = JSON.parse(await readFile(join(dir, 'tool-aliases.json'), 'utf8'));
    expect(Object.keys(raw.byWorkflow).sort()).toEqual(['wf-a', 'wf-b']);
  });

  it('同一工作区连续 add 不丢条目（串行写）', async () => {
    await Promise.all([
      store.add('wf-a', makeEntry('a_one')),
      store.add('wf-a', makeEntry('a_two')),
      store.add('wf-a', makeEntry('a_three')),
    ]);
    const listing = await store.list('wf-a');
    expect(listing.aliases.map((entry) => entry.name).sort()).toEqual(['a_one', 'a_three', 'a_two']);
  });

  it('JSON 损坏：corrupt=true、别名清空，不让坏文件卡住调用', async () => {
    await writeFile(join(dir, 'tool-aliases.json'), '{ this is not json', 'utf8');
    const listing = await store.list('wf-a');
    expect(listing.corrupt).toBe(true);
    expect(listing.aliases).toEqual([]);
  });

  it('单条脏数据被丢弃并标 corrupt（其余条目仍可用）', async () => {
    await writeFile(
      join(dir, 'tool-aliases.json'),
      JSON.stringify({
        version: 1,
        byWorkflow: {
          'wf-a': [
            makeEntry('good'),
            { name: 'bad', base_tool: 'workflow_manual' },
          ],
        },
      }),
      'utf8',
    );
    const listing = await store.list('wf-a');
    expect(listing.corrupt).toBe(true);
    expect(listing.aliases.map((entry) => entry.name)).toEqual(['good']);
  });

  it('snapshot 返回全部工作区', async () => {
    await store.add('wf-a', makeEntry('a_one'));
    await store.add('wf-b', makeEntry('b_one'));
    const snapshot = await store.snapshot();
    expect(Object.keys(snapshot.byWorkflow).sort()).toEqual(['wf-a', 'wf-b']);
    expect(snapshot.corrupt).toBe(false);
  });
});
