# dsh-agent-workflow 插件 · 需求与交接文档

> 用途：把这份文档发给另一个会话，让它接手继续开发。
> 目标宿主：DeepSeek Harness（dsh）Electron 桌面版。

---

## 一、一句话目标

在 dsh 里做一个 **Agent 编排 / Workflow 状态机插件**，支持：树形任务分解、五态状态机、断点续传、状态持久化、树形可视化。核心逻辑与 dsh 解耦（Adapter 模式），可开源。

---

## 二、业务需求（用户要什么）

### 2.1 插件定位

- 插件名：`dsh-agent-workflow`
- 形态：dsh 的 cordis 插件（宿主半 + 浏览器半）
- 它不是 dsh 的「目录工作区」，而是**另一套完全独立的东西**：
  - 实体 = 树（节点 + 状态）
  - 列表 = 自己的 workflow 列表
  - 树 = 自己的 WorkflowTree
  - 存储 = 自己的 JsonStorageAdapter
  - 状态 = 自己的状态机
- 与 dsh 默认工作区**唯一共用的是「添加/入口」这个交互位置**，其余全部独立，不碰 dsh 的 workspace 实体。

### 2.2 左侧工作区

- 左侧栏要有进入「Workflow 工作区」的入口。
- 入口形式（已定）：**独立入口**（不是改写 dsh 的「添加工作区」弹窗）。通过 `sidebar.footer.action` 注入一个按钮，点开是自己的面板，面板里是 workflow 列表/树/添加流程。
- 历史决策：曾考虑「在 dsh 的添加工作区弹窗里加第二项」，后确认走独立入口，改动最小、不侵入 dsh 核心。

### 2.3 树

- Workflow 工作区 = 一棵树。
- **父节点默认自动建**（创建 workflow 时自动生成根节点）。
- **子节点手动建**。
- **子节点可以再建子节点**（任意深度）。

### 2.4 状态机（核心）

五种状态：

```
未开始（保留态，无细节）
  → 讨论中
  → 实现中
  → 验收中
  → 已完结（终态，无细节）
```

规则：
1. 状态只能按上述顺序流转（不能跳）。
2. 进入新状态时：
   - 弹出确认窗口，用户同意后才切换；
   - 同意后**触发配置的默认输入**（enter_trigger），即自动把该状态对应的默认指令/提示注入到当前会话。
3. 「未开始」和「已完结」是**保留态、不挂操作细节**；中间三态（讨论中/实现中/验收中）才挂细节。

### 2.5 操作细节（Detail）

- 每个状态有一份「操作细节」（给 AI 的执行约定）。
- 结构分两层：
  - **A = 公共细节（shared）**：所有状态共享，子节点不可改。
  - **B/C/D = 三态专属细节**：讨论中 / 实现中 / 验收中，各自一份。
- 子节点只能**覆盖「自己当前状态」的专属细节**，**不能动 A**。
- 全局默认细节要脱敏、可开源：不能暴露某个用户的私有约定，预设是通用话术。

### 2.6 硬约束

1. **状态机必须走严格的数据结构 / 工具**，禁止「让 AI 直接改文档改状态」。
2. **断点续传**：进程重启后能从持久化快照恢复树 + 状态 + 当前节点。
3. **可开源**：所有预设、文案、细节都不能含用户私有信息。
4. 命名宪法（用户全局规则）：禁 `data / info / system / manager / util / common / helper` 这类泛化词；跨模块导出用 `模块名_功能名_术语`。

---

## 三、技术架构（已实现，61 个测试全绿）

分层：

```
schema  →  engine  →  adapter(port/impl)  →  service  →  client
```

### 3.1 目录结构

```
dsh-agent-workflow/
├── src/
│   ├── schema/          # L0 数据契约（zod）
│   │   ├── node-state.ts      # NodeState / ActiveState / StateDetail / NodeFlag
│   │   ├── node.ts            # AgentNode / flags / state_detail_overrides
│   │   ├── workflow.ts        # GlobalOperationDetail / WorkflowSettings / WorkflowSnapshot / DEFAULT_GLOBAL_OPERATION_DETAIL
│   │   ├── transition.ts      # TransitionKind / Transition / TransitionRequest
│   │   ├── trace.ts           # 追踪事件
│   │   ├── fault.ts           # 故障
│   │   └── migration.ts       # CURRENT_SNAPSHOT_VERSION / SNAPSHOT_MIGRATIONS / migrateSnapshot
│   ├── engine/          # L1 纯逻辑
│   │   ├── state-machine.ts   # TRANSITIONS 表 / requestTransition / applyTransition / effectiveDetail / isBlocked
│   │   ├── tree-store.ts      # 树 CRUD
│   │   ├── aggregation.ts     # 子树状态聚合
│   │   ├── interrupt.ts       # 中断/恢复
│   │   ├── circuit-breaker.ts # 熔断
│   │   └── fault-router.ts    # 故障路由
│   ├── adapter/         # L2 端口 + 实现
│   │   ├── port.ts            # WorkflowStoragePort / WorkflowRuntimePort / WorkflowUiPort / ContextSummaryPort / WorkflowEvent
│   │   ├── json-storage.ts    # JSON 存储（load 用 migrateSnapshot）
│   │   ├── dsh-runtime.ts     # DshRuntimeAdapter（薄映射，调用 dsh 能力）
│   │   ├── in-memory-runtime.ts
│   │   └── context-summary.ts # NaiveContextSummarizer
│   ├── service/         # L3 应用服务
│   │   ├── workflow-service.ts # addNode/removeNode/requestTransition/reportFault/resolveBlock/interrupt/resume/dispatchTool/getChildContext/getEffectiveDetail
│   │   └── workflow-tool.ts    # WORKFLOW_TOOL_SPECS（6 个工具定义）
│   ├── client/          # 浏览器半
│   │   ├── dsh-plugin.tsx      # 入口（@ts-nocheck），注入 sidebar.footer.action
│   │   ├── index.tsx
│   │   ├── workflow-tree.tsx   # 树渲染
│   │   ├── settings-panel.tsx  # 全局操作细节 A+B/C/D 设置
│   │   ├── node-state-editor.tsx # 两输入框（状态切换确认 + 子节点覆盖）
│   │   ├── add-workspace-dialog.tsx # 添加入口
│   │   ├── ui-store.ts         # 前端状态
│   │   └── workflow-ui-adapter.ts
│   ├── host.ts          # 宿主半入口（cordis 插件）
│   └── index.ts         # 库门面 + createWorkflowService
├── test/                # 12 个测试文件，61 个测试
├── cordis.patch.yml     # bundle 声明
├── package.json
├── tsconfig.json
├── tsconfig.client-cjs.json
└── scripts/
    ├── build-client.mjs       # esbuild 版（沙箱里 EPERM，未用）
    └── bundle-client.mjs      # mini bundler：tsc CJS → lazy-CJS
```

### 3.2 已实现的测试

`state-machine` / `tree-store` / `aggregation` / `fault-router` / `circuit-breaker` / `context-summary` / `in-memory-runtime` / `ui-store` / `workflow-ui-adapter` / `fault-isolation` / `migration` / `workflow-service`。

---

## 四、dsh 插件系统约束（踩坑清单，最重要）

这一节是已经用真实 dsh 验证过的硬约束，另一个会话务必先看，能少踩很多坑。

### 4.1 插件 = 宿主半 + 浏览器半

- 宿主半：`package.json` 的 `main`（或 `exports["."]`）→ `apply(ctx)`。
- 浏览器半：`exports["./client"]` + `package.json` 的 `dsh.client` 声明。

### 4.2 `dsh.client` 必须是对象，不是布尔

正确：

```json
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": {
    "platform": "web",
    "inject": ["@deepseek-ai/dsh-client-ui-slots", "@deepseek-ai/dsh-client-modules"]
  },
  "manifestVersion": 1
}
```

写成 `"client": true` 会导致浏览器半根本不被扫描。

### 4.3 必须声明 `dsh.bundle.patch` + 提供 `cordis.patch.yml`

否则 dsh 加载时直接抛错：`profile bundle "xxx" declares no dsh.bundle in its package.json`。

`cordis.patch.yml` 内容（把插件自己 insert 进 cordis entry 树）：

```yaml
- insert:
    - id: dsh-agent-workflow
      name: dsh-agent-workflow
```

### 4.4 宿主半的 `inject` 必须是数组

必须是 `export const inject = []` 或 `['serviceA', ...]`，**不能是对象 `{}`**。对象会导致 cordis 解析失败。

### 4.5 浏览器半产物必须是 lazy-CJS，不能是原生 ESM

dsh 的浏览器模块系统通过 `window.__ModuleLoader__.load({ id, factory })` 加载。格式：

```js
window.__ModuleLoader__.load({
  id: "dsh-agent-workflow",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    // ... 打包后的代码（相对 require 已内联）...
    return module.exports;
  }
});
```

用 tsc 直接产出的 ESM（`import ... from`）会 404 / 加载失败。
本项目已用 `tsconfig.client-cjs.json`（编译成 CommonJS）+ `scripts/bundle-client.mjs`（mini bundler 内联相对 require）解决。

沙箱里 esbuild 的 Node API 会 `spawn EPERM`，所以没用 esbuild，改用纯 tsc + 自写 bundler。

### 4.6 槽位 API

```js
ctx.slots.inject('slot.name', () =>
  ctx.slots.register({ name: 'slot.name', id: 'unique-id' }, Component),
);
```

### 4.7 已确认的真实槽位名

| 槽位 | kind | 含义 |
|---|---|---|
| `sidebar.workspaces` | single | 工作区（目录） |
| `sidebar.panellist` | list | 会话树 |
| `sidebar.settings` | single | 设置 |
| `sidebar.footer.action` | list | 底栏按钮 |
| `sidebar.workspaces.directoryFlow` | single | 添加工作区的目录选择流 |

**注意：侧栏的顶层分区是写死的**（渲染 `sidebar.workspaces` / `sidebar.panellist` / `sidebar.settings` / `sidebar.footer.action`），**没有「新增一个同级分区」的槽位**。所以「Workflow 工作区与工作区同级」这个诉求，dsh 现有架构不支持直接加，只能走「独立入口」（footer.action 按钮 → 弹自己的面板）。

---

## 五、当前进度与卡点

### 5.1 已完成

- schema / engine / adapter / service / client 全部实现。
- 61 个测试全绿。
- 已装进 profile：`C:\Users\QINBAI\.dsh\profiles\desktop`
  - `package.json` 的 `dependencies` 加了 `"dsh-agent-workflow": "link:..."`；
  - `dsh.profile.bundles` 加了 `"dsh-agent-workflow"`；
  - `node_modules` 下建了 junction。
- 已修：
  - `dsh.client` 改成对象；
  - 补了 `cordis.patch.yml` + `dsh.bundle.patch`；
  - 宿主半 `inject` 改成数组；
  - 浏览器半改成 lazy-CJS。

### 5.2 当前卡点（接手时先看这里）

dsh 启动时报：

```
应用无法启动或已意外停止。
web boot: 1 entry did not activate
dsh-agent-workflow: failed
```

已排查结论：
- `apply` **确实被调用了**（通过 `apply` 里写探针文件验证，日志有两条记录）。
- 但 fiber 状态是 **FAILED**（`_error` 被设置）。
- 已排除：`resolveConfig`（本模块没有 Config schema，跳过校验）。
- 正在做：把宿主半缩到最简 `export function apply() {}`（无 inject、无 name、不写文件），做二分对照。
- **待验证**：最简宿主半能否正常启动。

### 5.3 下一步建议（按顺序）

1. 先确认最简 `export function apply() {}` 能否过 web boot。
   - 能过 → 逐个加回 `inject` / 写文件 / `name`，找出触发 failed 的那个。
   - 不能过 → 问题不在宿主代码，转查：
     - `resolveBundleDir` / `packageDirFromAnchor` 是否依赖 pnpm lockfile（当前 lockfile 里**没有** `dsh-agent-workflow`）；
     - entry 的 `name` 解析（`tree.import('dsh-agent-workflow')`）；
     - `cordis.patch.yml` 的 insert 语法/name 是否与包名一致。
2. 宿主半通过后，再修浏览器半的 404（lazy-CJS 已就绪，待验证加载）。
3. 最后才是 UI：底栏按钮 → 面板 → 树 → 状态切换 → 设置。

---

## 六、关键路径

| 东西 | 路径 |
|---|---|
| 插件根 | `C:\Users\QINBAI\Documents\deepseek-harness\default-workspace\dsh-agent-workflow` |
| profile | `C:\Users\QINBAI\.dsh\profiles\desktop` |
| junction | `C:\Users\QINBAI\.dsh\profiles\desktop\node_modules\dsh-agent-workflow` |
| node | `C:\Users\QINBAI\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe` |
| tsc | `dsh-agent-workflow\node_modules\typescript\bin\tsc` |
| vitest | `dsh-agent-workflow\node_modules\vitest\vitest.mjs` |
| dsh 源码 | `E:\DeepSeek Harness\resources\app.asar\dsh\` |
| crash log | `C:\Users\QINBAI\AppData\Roaming\@deepseek-ai\dsh-desktop\logs\crash-*-web-boot.log` |

---

## 七、给接手会话的提醒

1. **先看第四节**，那是真实 dsh 环境验证过的硬约束，跳过会重复踩坑。
2. 当前卡点是「宿主半加载失败」，不是业务逻辑问题，业务层 61 个测试已经全绿。
3. 改完必须 `tsc` 重建 + 让用户重启 dsh 验证（每次验证成本高，尽量一次收敛一个变量）。
4. 不要在沙箱里跑 `pnpm install`（会报 sqlite 打不开）；store 路径受限。
5. 命名守用户全局宪法：禁 `data/info/system/manager/util/common/helper`。
