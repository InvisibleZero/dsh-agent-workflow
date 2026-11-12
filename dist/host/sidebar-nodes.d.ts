/**
 * 侧栏状态点的数据源。
 *
 * 单独成模块是为了让「显示口径」可测：带工作目录读该目录，不带读全部工作区。
 * 显示只认持久化事实（节点绑过哪个会话），不读宿主进程内的预设名单——
 * 名单在重启后是空的，会让重启前的所有会话丢掉状态点。
 */
import type { BrokenSnapshotHandler, WorkflowRepository } from './workflow-repository';
export declare function readSidebarNodes(repository: WorkflowRepository, workingDirectory: string | null | undefined, onBroken?: BrokenSnapshotHandler): Promise<Record<string, string>>;
//# sourceMappingURL=sidebar-nodes.d.ts.map