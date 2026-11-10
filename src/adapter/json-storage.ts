import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
    // 临时文件名带随机后缀：并发写同一快照时各写各的，避免 rename 撞车（ENOENT/EPERM）。
    const tmp = `${p}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
    // Windows 下覆盖正在被并发读（load）的目标文件时 rename 可能瞬时 EPERM，重试几次兜底。
    for (let attempt = 0; ; attempt += 1) {
      try {
        await fs.rename(tmp, p); // 原子替换，避免写一半
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if ((code === 'EPERM' || code === 'EACCES') && attempt < 6) {
          await new Promise((resolve) => setTimeout(resolve, 8 * (attempt + 1)));
          continue;
        }
        // 重试仍失败：清掉临时文件再抛，避免残留 .tmp。
        await fs.rm(tmp, { force: true }).catch(() => {});
        throw error;
      }
    }
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
