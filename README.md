# dsh-workflow —— Agent 编排与 Workflow 状态机插件

嵌入 `dsh` harness 的插件：任务断点续传、状态持久化、树形可视化。
核心引擎零框架依赖，通过 Adapter 与 dsh 通信（组合模式 + 分层状态机）。

## 状态模型（五态生命周期）

```
未开始 ──(首次对话·自动)──▶ 讨论中 ──(弹窗同意)──▶ 实现中 ──(弹窗同意)──▶ 验收中 ──(弹窗同意)──▶ 已完结
  │                          │                      │                      │
  │(保留态,无细节)           (B)                    (C)                    (D)         (终态,无细节)
  └──────────────────────────┴── 返工：实现中/验收中 ──(弹窗同意)──▶ 讨论中 ────────────┘
```

- 前三个活跃态（讨论中 / 实现中 / 验收中）各自拥有**专属操作细节（B/C/D）**。
- 「未开始」是保留态（无细节，首次对话自动进入讨论中）；「已完结」是终态（无细节）。
- 每次进入新状态（前进或返工）都弹窗确认，点「同意」才进入；进入后触发该状态配置的**默认输入**（string，可空）。

## 全局操作细节 = A + (B + C + D)

- **A（公共）**：三态通用的公共操作细节，只在设置里改，每个节点都读。
- **B / C / D（三态专属）**：各自独立，含「操作细节」和「进入后默认输入」两个独立输入框。
- **子节点只能覆盖「自己当前状态」的专属细节**（B/C/D 里对应当前状态那一条），不能动 A，不能动别的状态。

## 内置预设

仓库内置一套**通用示例预设**（`src/schema/workflow.ts` 的 `DEFAULT_GLOBAL_OPERATION_DETAIL`），仅作开箱即用演示，不携带任何私有约定；使用者可在设置里按自己的场景替换三态的「操作细节」与「进入后默认输入」。

## 目录结构

```
src/
├── index.ts              # 插件入口（cordis，TODO spike）
├── schema/               # 数据模型（Zod + 类型）
│   ├── node-state.ts     #   NodeState / ActiveState / StateDetail
│   ├── node.ts           #   AgentNode（万能节点）
│   ├── workflow.ts       #   GlobalOperationDetail / WorkflowSettings / WorkflowSnapshot + 默认值
│   ├── trace.ts          #   TraceLog（全链路跟踪）
│   └── fault.ts          #   WorkflowFault（系统异常 vs AI 语义异常）
├── engine/               # 纯逻辑，零框架依赖
│   ├── state-machine.ts  #   合法转移表 + 申请/应用流转 + 有效细节
│   ├── tree-store.ts     #   树增删改查（组合模式）
│   ├── aggregation.ts    #   冒泡/级联聚合
│   ├── interrupt.ts      #   级联打断
│   ├── circuit-breaker.ts#   Max_Depth / Max_Steps 熔断
│   └── fault-router.ts   #   故障路由（重试 / 人审）
├── adapter/
│   ├── port.ts           #   面向接口：Storage / Runtime / Ui 三端口
│   ├── json-storage.ts   #   JSON 文件存储（原子写 + 追加 trace + 快照）
│   └── dsh-runtime.ts    #   dsh 运行时适配器（TODO spike）
├── service/
│   └── workflow-service.ts # 面向 agent 的 workflow 工具（严格数据结构）
└── client/               # dsh-web-app 前端扩展（TODO spike）
    ├── index.tsx
    ├── add-workspace-dialog.tsx
    ├── workflow-tree.tsx
    └── node-state-editor.tsx   # 操作细节 / 默认输入 两输入框
```

## 构建与测试

```bash
# 安装（本环境沙箱需平铺 node_modules，避免 pnpm 的 junction 建不全）
pnpm install --node-linker=hoisted

pnpm typecheck  # tsc 类型检查（核心，不含 client）
pnpm build      # tsc 编译到 dist/
pnpm test       # vitest 单测（59 项，引擎纯逻辑）
```

说明：

- `pnpm test` 依赖 vitest 派生子进程；在 DSH 的 workspace-write 沙箱里会 `spawn EPERM`，需提权（danger-full-access）运行，或在无沙箱的普通终端直接跑。
- `src/client/*` 已纳入 typecheck/build（React 组件 + UI store + UI 适配器）；真正挂到 dsh-web-app 的扩展点仍是 spike。

## dsh 集成（TODO spike）

以下部分需要对照 `dsh-base` / `dsh-web-app` 的真实 API 后再接线（已用 `TODO(spike)` 标注）：

- `src/index.ts`：cordis 插件入口与 bundle 注册。
- `src/service/workflow-service.ts`：挂 harness 生命周期 + 暴露给 agent 的 `workflow` 工具。
- `src/client/*`：左侧「添加工作区」弹窗（两选项）、树视图、状态徽标、两输入框编辑器。
- `src/adapter/dsh-runtime.ts`：断点续传 / 级联打断的 dsh 执行循环接线。
