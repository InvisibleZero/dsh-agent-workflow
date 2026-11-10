import { describe, it, expect } from 'vitest';
import {
  CURRENT_SNAPSHOT_VERSION,
  SNAPSHOT_MIGRATIONS,
  readSnapshotVersion,
  migrateSnapshot,
  type SnapshotMigration,
} from '../src/schema/migration';
import { DEFAULT_SETTINGS } from '../src/schema/workflow';

function v1Snapshot() {
  return { version: 1, workspace_id: 'ws1', title: 't', settings: DEFAULT_SETTINGS, nodes: [] };
}

describe('readSnapshotVersion', () => {
  it('读取 version', () => {
    expect(readSnapshotVersion({ version: 1 })).toBe(1);
    expect(readSnapshotVersion({ version: 0 })).toBe(0);
  });

  it('缺 version 抛错', () => {
    expect(() => readSnapshotVersion({})).toThrow(/version/);
  });

  it('非对象抛错', () => {
    expect(() => readSnapshotVersion(null)).toThrow(/version/);
  });
});

describe('migrateSnapshot', () => {
  it('当前版本直接通过校验', () => {
    const out = migrateSnapshot(v1Snapshot());
    expect(out.version).toBe(CURRENT_SNAPSHOT_VERSION);
    expect(out.workspace_id).toBe('ws1');
  });

  it('按迁移链从 v0 迁到当前版', () => {
    const v0ToV1: SnapshotMigration = (s) => ({ ...s, version: 1, title: (s.title as string) ?? '' });
    const v0 = { version: 0, workspace_id: 'ws1', settings: DEFAULT_SETTINGS, nodes: [] };
    const out = migrateSnapshot(v0, { 0: v0ToV1, ...SNAPSHOT_MIGRATIONS });
    expect(out.version).toBe(CURRENT_SNAPSHOT_VERSION);
    expect(out.title).toBe('');
  });

  it('v1 的「未开始」节点迁到「讨论中」', () => {
    const legacy = {
      version: 1,
      workspace_id: 'ws1',
      title: 't',
      settings: DEFAULT_SETTINGS,
      nodes: [
        {
          node_id: 'n1',
          parent_id: null,
          node_type: 'task',
          current_state: 'not_started',
          child_ids: [],
          context_payload: null,
          flags: [],
          depth: 0,
          max_depth: 8,
          step_count: 0,
          max_steps: 200,
        },
      ],
    };
    const out = migrateSnapshot(legacy);
    expect(out.version).toBe(2);
    expect(out.nodes[0]?.current_state).toBe('discussing');
  });

  it('缺迁移步骤抛错', () => {
    const v0 = { version: 0, workspace_id: 'ws1', settings: DEFAULT_SETTINGS, nodes: [] };
    expect(() => migrateSnapshot(v0, {})).toThrow(/缺少从 v0/);
  });

  it('版本高于当前抛错', () => {
    const future = { version: 999, workspace_id: 'ws1', title: 't', settings: DEFAULT_SETTINGS, nodes: [] };
    expect(() => migrateSnapshot(future)).toThrow(/高于当前/);
  });
});
