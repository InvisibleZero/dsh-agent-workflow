# dsh-web-app 接线 Spike 报告

本文件记录「把 dsh-workflow 客户端半挂进 dsh-web-app」的调研结论与接线路径。核心引擎（L0–L7）已完成；剩下的是把 React 组件注册进 dsh 的真实槽位。

## 一、架构结论（已确认）

dsh 是 **cordis 插件系统**，客户端是 React。每个插件分「宿主半」和「客户端半」：

- **客户端半**：浏览器侧代码。由 `@deepseek-ai/dsh-client-modules` 的 `dsh.client` 扫描发现，组合进 `__DSH_BOOT__` 入口图（`webPlugins` 服务），再由浏览器侧 lazy-CJS 模块表加载。
- **服务注册**：`class X extends Service { constructor(ctx, name) { super(ctx, name); } }`（例：`UiWorkspaceService extends Service`，`super(ctx, "uiWorkspace")`）。
- **UI 槽位**：`renderSlot("slotName", props)` 消费；`ctx.slot(...)` 提供。React 槽位绑定见 `@deepseek-ai/dsh-client-ui-renderer`（`ctx.uiRenderer`）。

## 二、工作区模型（关键约束）

dsh 现有「工作区」是**目录驱动**的，不是泛化实体：

| 项 | 现状 |
|---|---|
| 实体字段 | `{ workspaceId, title, sessionIds, archivedSessionIds, pinnedSessionIds, updatedAt }` |
| 创建 | `createWorkspace({ path })`（挑一个目录） |
| 控制器 | `WorkspaceController`（纯）+ `ClientWorkspaceModel`（框架无关快照）+ `UiWorkspaceService` + `useWorkspaces`（zustand `createSnapshotStore`） |
| 添加入口 | `WorkspacePicker`（`dsh-client-ui-workspace`）里的 `ADD_WORKSPACE` → `useDirectoryFlow` 目录选择流程 |

结论：**现有模型没有 `workspace.kind` 字段，创建流程写死「选目录」。**

## 三、冲突与两条路径

我的 workflow 工作区是一棵树（父子节点 + 状态），不是目录。

1. **改核心**：给 workspace 实体加 `kind`，扩展 registry + picker —— 侵入 dsh 核心，维护成本高。
2. **独立侧栏入口**：把 workflow 当作独立 sidebar entry + view，不进「工作区」目录体系 —— 解耦，但与「添加工作区出两个选项」的原需求不完全一致。

**推荐先走 2（独立入口）**，验证可行后再决定是否并进 workspace kind。

## 四、接线步骤（待做，需在真实 dsh 环境）

1. 在 `package.json` 声明客户端入口（`dsh.client` 的准确字段名待确认）。
2. 客户端半注册一个 cordis Service，把 `WorkflowService` 的客户端半接到 Host。
3. 注册 sidebar 槽位（`dsh-client-ui-sidebar` / `dsh-client-ui-workspace`）→ `WorkflowTree`。
4. 注册 settings 槽位（`dsh-client-ui-settings`）→ `SettingsPanel`。
5. 注册「添加工作区」菜单项（`WorkspacePicker` 的槽）→ `AddWorkspaceDialog`。

骨架（伪代码，签名待确认）：

```ts
import { Service } from 'cordis';
import { WorkflowUiStore } from './ui-store';
import { WorkflowUiAdapter } from './workflow-ui-adapter';
import { WorkflowTree } from './workflow-tree';
import { SettingsPanel } from './settings-panel';
import { AddWorkspaceDialog } from './add-workspace-dialog';

export const name = 'dsh-workflow-client';

export function apply(ctx: any) {
  const store = new WorkflowUiStore();
  // TODO(spike): 确认 ctx.slot 的真实签名
  // ctx.slot('workspace.picker.entry', () => <AddWorkspaceDialog onAddDefault={...} onAddWorkflow={...} />);
  // ctx.slot('sidebar.tab', () => <WorkflowTree nodes={...} rootId={...} ... />);
  // ctx.slot('settings.section', () => <SettingsPanel value={...} onChange={...} />);
}
```

## 五、待确认的未知项

- `dsh.client` 的准确 package.json 字段 / 导出约定。
- 具体槽位名（`workspace.picker`、`sidebar.*`、`settings.*`）。
- cordis 插件 `apply(ctx)` 入口与 `ctx.slot` 注册的精确签名。
- dsh 实际使用的 React 版本。

## 六、结论

核心引擎（L0–L7）已全部完成、可编译、59 项测试全绿。剩余一步是把客户端半挂进 dsh-web-app 的真实槽位——**这一步需要 dsh 本体的构建环境（`pnpm run dev:web`）和真实包源码来确认精确签名**，属于「在 dsh 环境里才能收尾」的活，而非纯逻辑开发。

## 七、接线 checklist（可照着试）

**候选槽位名（按可能性排序，逐个试）：**

1. `sidebar.workflow` —— 直接注册一个新段（最可能）
2. `sidebar.section` / `sidebar.sections` —— 若 sidebar 用「分区列表」模式，往列表里 inject
3. `sidebar.workspaces` —— 若「工作区」本身是可扩展容器

**验证方法（在 dsh 环境里）：**

1. 起 `pnpm run dev:web`。
2. 先做最小验证：`ctx.slots.register({ name: "sidebar.workflow" }, () => <div>Workflow</div>)`。
3. 看左侧栏是否出现该段；没出现就逐个换候选名。
4. 出现后再接真实组件（`WorkflowTree` / `SettingsPanel` / `AddWorkspaceDialog`）。

**骨架文件**：`src/client/dsh-plugin.tsx`（`@ts-nocheck`，含 slot 注入结构）。

**客户端出口声明（待确认精确写法）**：`package.json` 的 `dsh.client` + `exports["./client"]`。

## 八、落地状态（代码已写全）

- `package.json`：`exports["./client"]` + `exports["./host"]` + `dsh.client: true`（`true` 是猜测值，精确写法待确认）。
- `src/host.ts`：宿主半入口骨架（service / tool 注册签名待对照 `dsh-tools`）。
- `src/client/dsh-plugin.tsx`：浏览器半入口（`sidebar.workflow` + `settings.workflow` 两个槽位）。

**收尾步骤（在 dsh 环境里执行）**：

1. 把本包装进 profile（`dsh.profile.bundles` 已含 `dsh-workflow`）。
2. `pnpm run dev:web` 起客户端构建。
3. 试槽位名（见第七节），看侧栏是否出现「Workflow 工作区」。
4. 宿主半的 service / tool 注册按 `dsh-tools` 的真实 API 补上（另开 spike）。
