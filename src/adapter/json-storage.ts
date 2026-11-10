import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { WorkflowSnapshot } from '../schema/workflow';
import { migrateSnapshot } from '../schema/migration';
import type { TraceLog } from '../schema/trace';
import type { WorkflowStoragePort } from './port';

/** 基于 JSON 文件的存储实现：原子写 + 追加式 trace + 每节点快照。 */
export class JsonStorageAdapter implements WorkflowStoragePort {
  constructor(private readonly baseDir: string) {}

  private snapshotPath(workspaceId: string): string {
    return path.join(this.baseDir, 'workflows', `${workspaceId}.json`);
  }
  private tracePath(traceId: string): string {
    return path.join(this.baseDir, 'traces', `${traceId}.jsonl`);
  }
  private checkpointPath(nodeId: string): string {
    return path.join(this.baseDir, 'checkpoints', `${nodeId}.json`);
  }

  async load(workspaceId: string): Promise<WorkflowSnapshot | null> {
    try {
      const raw = await fs.readFile(this.snapshotPath(workspaceId), 'utf8');
      return migrateSnapshot(JSON.parse(raw));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async save(snapshot: WorkflowSnapshot): Promise<void> {
    const p = this.snapshotPath(snapshot.workspace_id);
    await fs.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
    await fs.rename(tmp, p); // 原子替换，避免写一半
  }

  async appendTrace(log: TraceLog): Promise<void> {
    const p = this.tracePath(log.trace_id);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.appendFile(p, `${JSON.stringify(log)}\n`, 'utf8');
  }

  async saveCheckpoint(nodeId: string, snapshot: unknown): Promise<void> {
    const p = this.checkpointPath(nodeId);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(snapshot), 'utf8');
  }

  async loadCheckpoint(nodeId: string): Promise<unknown | null> {
    try {
      return JSON.parse(await fs.readFile(this.checkpointPath(nodeId), 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }
}
