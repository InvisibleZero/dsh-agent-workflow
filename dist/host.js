// src/host.ts
import { homedir as homedir2 } from "node:os";
import { dirname as dirname7, join as join8 } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn as spawn2 } from "node:child_process";

// src/host/workflow-repository.ts
import { promises as fs2 } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { randomUUID as randomUUID2 } from "node:crypto";

// src/adapter/json-storage.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// src/schema/workflow.ts
import { z as z3 } from "zod";

// src/schema/node.ts
import { z as z2 } from "zod";

// src/schema/node-state.ts
import { z } from "zod";
var NodeState = z.enum([
  "discussing",
  // 讨论中（B）
  "implementing",
  // 实现中（C）
  "verifying",
  // 验收中（D）
  "completed"
  // 已完结（终态）
]);
var ActiveState = z.enum(["discussing", "implementing", "verifying"]);
var NodeFlag = z.enum(["blocked"]);
var StateDetail = z.object({
  operation_detail: z.string(),
  enter_trigger: z.string().nullable()
});
var ACTIVE_STATE_ORDER = [
  "discussing",
  "implementing",
  "verifying"
];
function isActiveState(state) {
  return ACTIVE_STATE_ORDER.includes(state);
}

// src/schema/node.ts
var AgentNode = z2.object({
  node_id: z2.string(),
  parent_id: z2.string().nullable(),
  // 根节点为 null
  /**
   * 节点显示名。可选：旧快照没有，UI 回退到 node_type。
   * （根节点的 title 与 WorkflowSnapshot.title 一致，不重复写也行。）
   */
  title: z2.string().optional(),
  /**
   * 该节点绑定的 dsh 会话 id：点节点行时打开这个会话；没有则新建一个再写回。
   * 可选：旧快照没有这个字段，第一次点击时才写入。
   */
  session_id: z2.string().optional(),
  node_type: z2.enum(["workspace", "feature", "task"]),
  current_state: NodeState,
  child_ids: z2.array(z2.string()),
  context_payload: z2.unknown(),
  /** 横切标志（如 blocked = 异常阻塞待人审）。 */
  flags: z2.array(NodeFlag).default([]),
  /**
   * 子节点对「自己当前状态」专属细节的覆盖。
   * 键只能是活跃态，值覆盖该态的专属细节（不动公共 A）。
   * 父节点（workspace 根）不写此字段。
   */
  state_detail_overrides: z2.object({
    discussing: StateDetail.optional(),
    implementing: StateDetail.optional(),
    verifying: StateDetail.optional()
  }).optional(),
  /**
   * 节点级「附加说明」：不改全局设置，只在本节点当前状态后面追加一段。
   * 与覆盖相反——是纯增量，删掉就回到全局原样。
   * `global` 是这个节点的「全局附加」：不管当前什么状态都追加。
   */
  additional_detail: z2.object({
    global: z2.string().optional(),
    discussing: z2.string().optional(),
    implementing: z2.string().optional(),
    verifying: z2.string().optional()
  }).optional(),
  /**
   * 验收七项的报备与标记（「验收中」专用）。
   *
   * 可选：旧快照没有这个字段 = 七项都没处理；读侧用 pickVerification 收口，不做数据迁移。
   * 标记只能由报备落（pass → ✓，deferred → ？），取消勾会把条目清回 pending。
   */
  verification: z2.object({
    round: z2.number().int().nonnegative(),
    items: z2.array(z2.object({
      id: z2.number().int(),
      mark: z2.enum(["pending", "pass", "deferred"]),
      report: z2.object({
        round: z2.number().int().nonnegative(),
        result: z2.enum(["pass", "deferred"]),
        summary: z2.string(),
        anchors: z2.array(z2.object({
          file: z2.string(),
          line: z2.number().int().positive().optional()
        })),
        command: z2.string().optional(),
        findings: z2.array(z2.object({
          location: z2.string(),
          problem: z2.string(),
          why_not_fixed: z2.string(),
          impact: z2.string()
        })).optional(),
        at: z2.string()
      }).nullable()
    })),
    checker_runs: z2.array(z2.object({
      checker_id: z2.string(),
      ok: z2.boolean(),
      exit_code: z2.number().int().nullable(),
      findings: z2.number().int().nonnegative(),
      evidence: z2.string().optional(),
      at: z2.string()
    })).optional()
  }).optional(),
  /**
   * 状态迁移时间线：每次推进追加一条 { at, from, to }。
   * 可选，旧快照没有。
   */
  history: z2.array(z2.object({
    at: z2.string(),
    from: z2.string(),
    to: z2.string(),
    /** 谁触发的这次迁移：human（点胶囊）/ agent-request（模型请求并经人同意）/ agent（返工等）。 */
    by: z2.string().optional()
  })).optional(),
  // —— 防御性约束 ——
  depth: z2.number().int().nonnegative(),
  max_depth: z2.number().int().positive(),
  step_count: z2.number().int().nonnegative(),
  max_steps: z2.number().int().positive()
});

// src/schema/workflow.ts
var HardRules = z3.object({
  discussing: z3.string().optional(),
  implementing: z3.string().optional(),
  verifying: z3.string().optional()
});
var GlobalOperationDetail = z3.object({
  shared_detail: z3.string(),
  // A：三态通用的公共操作细节
  discussing: StateDetail,
  // B
  implementing: StateDetail,
  // C
  verifying: StateDetail,
  // D
  /** 硬规则覆盖值；缺省 = 用 DEFAULT_HARD_RULES。 */
  hard_rules: HardRules.optional()
});
var AggregationMode = z3.enum(["manual", "all_complete", "any_active"]);
var WorkflowSettings = z3.object({
  global_operation_detail: GlobalOperationDetail,
  default_max_depth: z3.number().int().positive(),
  default_max_steps: z3.number().int().positive(),
  aggregation_mode: AggregationMode
});
var WorkflowSnapshot = z3.object({
  version: z3.literal(2),
  workspace_id: z3.string(),
  title: z3.string(),
  /** workflow 对应的本地工作目录（用户创建时选的那个文件夹）。可选，旧快照没有。 */
  working_directory: z3.string().optional(),
  /**
   * 对应的宿主「目录工作区」id（这里的 host 指 DSH 宿主 App，不是本插件 src/host 模块）。
   * 外部契约（落盘字段名）：旧快照已按这个键落盘，改名要迁移，故保持原名、勿改名。
   */
  host_workspace_id: z3.string().optional(),
  /** 是否置顶（只影响侧栏排序）。可选，旧快照没有 = 未置顶。 */
  pinned: z3.boolean().optional(),
  settings: WorkflowSettings,
  nodes: z3.array(AgentNode)
});
var DEFAULT_GLOBAL_OPERATION_DETAIL = {
  // A —— 三态通用
  shared_detail: `\u4F60\u5728\u67D0\u4E2A workflow \u8282\u70B9\u7684\u67D0\u4E2A\u9636\u6BB5\u5DE5\u4F5C\uFF1A\u5F53\u524D\u72B6\u6001\u51B3\u5B9A\u672C\u9636\u6BB5\u505A\u4EC0\u4E48\uFF0C\u4E0D\u8981\u8D8A\u8FC7\u5B83\u53BB\u505A\u4E0B\u4E00\u9636\u6BB5\u7684\u4E8B\u3002

\u7ED3\u8BBA\u5148\u884C\uFF0C\u4E0D\u786E\u5B9A\u5C31\u8BF4\u4E0D\u786E\u5B9A\uFF0C\u4E0D\u8981\u7F16\u4E00\u4E2A\u542C\u8D77\u6765\u5408\u7406\u7684\u56E0\u679C\u3002

\u6539\u52A8\u524D\u5148\u8BFB\u539F\u6587\uFF1B\u6CA1\u8BFB\u8FC7\u7684\u6587\u4EF6\u4E0D\u8981\u58F0\u79F0\u77E5\u9053\u5B83\u662F\u4EC0\u4E48\u6837\u3002

\u4EA4\u4ED8\u4E09\u9879\uFF08\u52A8\u4E86\u6587\u4EF6 / \u6570\u636E\u5C31\u5FC5\u987B\u4EA4\u4EE3\uFF0C\u7F3A\u4E00\u9879\u7B97\u6CA1\u4EA4\u4ED8\u5B8C\uFF09\uFF1A
\u2460 \u6309\u7528\u6237\u770B\u5F97\u89C1\u7684\u4E1C\u897F\u70B9\u540D\u6539\u4E86\u54EA\u4E9B\u6A21\u5757\uFF08\u9875\u7B7E / \u5361\u7247 / \u6309\u94AE / \u6587\u4EF6\uFF09\uFF0C\u53EA\u62A5\u51FD\u6570\u540D\u6216\u6587\u4EF6\u540D\uFF1D\u4E0D\u5408\u683C\uFF1B
\u2461 \u6570\u636E\u6D41\u5411\uFF1A\u6539\u524D\u8C01\u5199\u8C01\u8BFB\u3001\u6539\u540E\u8C01\u5199\u8C01\u8BFB\u3001\u54EA\u6761\u5199\u5165\u88AB\u5207\u65AD\u6216\u65B0\u589E\uFF1B\u300C\u5185\u90E8\u903B\u8F91\u8C03\u6574\u4E86\u4E00\u4E0B\u300D\uFF1D\u4E0D\u5408\u683C\uFF1B
\u2462 \u7ED9 1~3 \u4E2A\u771F\u5B9E\u7684\u5751 + \u600E\u4E48\u590D\u6838\uFF08\u770B\u54EA\u91CC\u3001\u770B\u54EA\u4E2A\u503C\uFF09\uFF1B\u300C\u5E94\u8BE5\u6CA1\u95EE\u9898\u300D\uFF1D\u4E0D\u5408\u683C\u3002

\u63D0\u5EFA\u8BAE\u5FC5\u9644\u300C\u5DF2\u77E5\u53EF\u4F18\u5316\u4F46\u6CA1\u505A\u300D\uFF1A\u9010\u6761\u5199 \u662F\u4EC0\u4E48\u73B0\u8C61 / \u80FD\u7701\u591A\u5C11 / \u4EE3\u4EF7\u6216\u98CE\u9669 / \u8FD9\u6B21\u4E3A\u4EC0\u4E48\u6CA1\u505A\uFF1B\u5B81\u53EF\u591A\u5217\u4E00\u6761\u88AB\u5426\u6389\u3002

\u8868\u8FBE\u53E3\u5F84\uFF1A\u82F1\u6587\u6807\u8BC6\u7B26\u662F\u7A33\u5B9A\u951A\u70B9\uFF0C\u957F\u5BF9\u8BDD\u4F18\u5148\u7528\u5B83\u9501\u6B7B\u8BF4\u6CD5\uFF1B\u82F1\u6587\u6807\u8BC6\u7B26\u548C\u300C\u5DE5\u5177 / \u7CFB\u7EDF / \u7BA1\u7406 / \u6570\u636E\u300D\u8FD9\u7C7B\u6A21\u7CCA\u8BCD\uFF0C\u7B2C\u4E00\u6B21\u51FA\u73B0\u5FC5\u987B\u7D27\u8DDF\u62EC\u53F7\u89E3\u91CA\uFF0C\u89E3\u91CA\u843D\u5230\u4F7F\u7528\u573A\u666F\uFF08\u5B83\u5F53\u524D\u6307\u4EC0\u4E48\u3001\u5E72\u4EC0\u4E48\u7528\uFF09\uFF0C\u4E0D\u662F\u540C\u4E49\u8BCD\u7FFB\u8BD1\uFF1B\u9996\u6B21\u89E3\u91CA\u540E\u53EF\u590D\u7528\uFF0C\u4E0D\u5FC5\u6BCF\u53E5\u91CD\u590D\u3002`,
  // B —— 讨论中
  discussing: {
    operation_detail: `\u672C\u9636\u6BB5\u53EA\u8BA8\u8BBA\uFF0C\u4E0D\u52A8\u624B\u6539\u4EE3\u7801\u6216\u6587\u4EF6\u3002

\u9ED8\u8BA4\u300C\u5148\u5BF9\u9F50\u300D\uFF1A\u6211\u6CA1\u8BF4\u8981\u65B9\u6848\u65F6\uFF0C\u4E0D\u5217\u65B9\u6848\u6E05\u5355\u3001\u4E0D\u50AC\u63A8\u8FDB\uFF1B\u53EA\u590D\u8FF0\u76EE\u6807\u3001\u6307\u51FA\u5F85\u6F84\u6E05\u5904\u3001\u8BB0\u5F55\u7ED3\u8BBA\u3001\u7B49\u4E0B\u4E00\u6B65\u3002

\u6211\u8BF4\u300C\u7ED9\u65B9\u6848\u300D\u300C\u600E\u4E48\u9009\u300D\u300C\u6709\u4EC0\u4E48\u9009\u9879\u300D\u300C\u5C55\u5F00\u8BF4\u8BF4\u300D\u65F6\uFF0C\u624D\u6309\u4E09\u6BB5\u8F93\u51FA\uFF1A1. \u76EE\u6807\u4E0E\u73B0\u72B6 2. \u53EF\u9009\u65B9\u6848\uFF08\u81F3\u5C11\u4E24\u4E2A\uFF0C\u505A\u6CD5\u3001\u4EE3\u4EF7\u3001\u98CE\u9669\uFF093. \u53D6\u820D\u4E0E\u5EFA\u8BAE\u3002

\u9700\u8981\u5148\u786E\u8BA4\u7684\u5730\u65B9\u5355\u72EC\u5217\u51FA\u6765\uFF0C\u7B49\u4EBA\u786E\u8BA4\u540E\u518D\u63A8\u8FDB\u3002`,
    enter_trigger: null
  },
  // C —— 实现中
  implementing: {
    operation_detail: `\u672C\u9636\u6BB5\u6309\u5DF2\u786E\u8BA4\u7684\u65B9\u6848\u843D\u5730\u3002

\u5148\u8BFB\u540E\u6539\uFF1A\u53EA\u6539\u4E0E\u76EE\u6807\u76F8\u5173\u7684\u6587\u4EF6\uFF0C\u6539\u52A8\u8D8A\u5C11\u8D8A\u597D\u3002

\u6BCF\u5904\u6539\u52A8\u8BF4\u660E\u4E09\u4EF6\u4E8B\uFF1A\u6539\u4E86\u54EA\u4E2A\u6587\u4EF6\u3001\u4E3A\u4EC0\u4E48\u6539\u3001\u4F1A\u5F71\u54CD\u4EC0\u4E48\u3002

\u5B8C\u6210\u540E\u7ED9\u51FA\u9A8C\u8BC1\u65B9\u5F0F\uFF1A\u600E\u4E48\u8FD0\u884C\u3001\u770B\u4EC0\u4E48\u8F93\u51FA\u3001\u4EC0\u4E48\u7B97\u901A\u8FC7\u3002

\u5B9E\u73B0\u4E2D\u53D1\u73B0\u65B9\u6848\u6709\u6D1E\uFF0C\u505C\u4E0B\u6765\u8BF4\u660E\uFF0C\u4E0D\u8981\u81EA\u884C\u6269\u5927\u8303\u56F4\u3002`,
    enter_trigger: "\u5148\u8BFB\u4F1A\u8BDD\u624B\u518C\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\uFF0C\u6309\u672A\u52FE\u7684\u7B2C\u4E00\u5C42\u5F00\u59CB\u5B9E\u73B0\uFF0C\u5B8C\u6210\u4E00\u5C42\u52FE\u6389\u518D\u7EE7\u7EED\u3002"
  },
  // D —— 验收中
  verifying: {
    operation_detail: `\u672C\u9636\u6BB5\u4EE5\u6838\u5BF9\u4E3A\u4E3B\uFF1B\u4F46**\u9664\u7B2C 5 \u9879\uFF08\u547D\u540D\u5BA1\u67E5\uFF0C\u53EA\u8BFB\uFF09\u5916\uFF0C\u5176\u4F59\u6B65\u9AA4\u9ED8\u8BA4\u5141\u8BB8\u6539\u6587\u4EF6**\u2014\u2014\u7B2C 8 \u9879\uFF08\u6536\u5C3E\uFF09\u53EA\u5199\u6587\u6863\uFF08\u9879\u76EE\u624B\u518C\uFF09\uFF0C\u7B2C 1/2/3/4/6/7 \u9879\u53EF\u6539\u6E90\u7801\uFF08\u57CB\u70B9\u63D2\u6869\u3001\u4FEE\u683C\u5F0F\u3001\u8865\u8BC1\u636E\u7B49\uFF09\u3002\u8FD9\u4E9B\u5C5E\u4E8E\u9A8C\u6536\u52A8\u4F5C\uFF0C\u4E0D\u662F\u8D8A\u754C\uFF1B\u6BCF\u5904\u6539\u52A8\u8981\u5728\u8BE5\u9879\u62A5\u5907\u91CC\u6CE8\u660E\u6539\u4E86\u4EC0\u4E48\u3001\u5F71\u54CD\u54EA\u4E9B\u9A8C\u6536\u9879\u3002

\u53E6\u5916\u5FC5\u987B\u5199\u4E24\u6BB5\uFF1A

1. \u56DE\u5F52\uFF1A\u5217\u51FA\u53EF\u80FD\u88AB\u5F71\u54CD\u7684\u539F\u6709\u884C\u4E3A\uFF0C\u9010\u9879\u8BF4\u660E\u600E\u4E48\u786E\u8BA4\u6CA1\u574F\u3002

2. \u9057\u7559\u98CE\u9669\u4E0E\u672A\u505A\u9879\uFF1A\u8BF4\u6E05\u662F\u4EC0\u4E48\u3001\u5F71\u54CD\u4EC0\u4E48\u3001\u4EC0\u4E48\u65F6\u5019\u8BE5\u5904\u7406\u3002

\u53D1\u73B0\u5FC5\u987B\u4FEE\u7684\u95EE\u9898\uFF0C\u80FD\u5C31\u5730\u4FEE\u7684\u4FEE\u6389\u5E76\u5728\u62A5\u5907\u91CC\u6CE8\u660E\uFF1B\u6539\u52A8\u8F83\u5927\u6216\u65B9\u6848\u672C\u8EAB\u6709\u95EE\u9898\u65F6\uFF0C\u8BF4\u660E\u540E\u56DE\u5230\u5B9E\u73B0\u4E2D\u9636\u6BB5\uFF08\u8FD4\u5DE5\u8981\u5E26 reason\uFF09\u3002`,
    enter_trigger: "\u5F00\u59CB\u9A8C\u6536\uFF1A\u9010\u6761\u5BF9\u7167\u9A8C\u6536\u6761\u4EF6\uFF0C\u7ED9\u6211\u901A\u8FC7/\u4E0D\u901A\u8FC7\u548C\u8BC1\u636E\u3002"
  }
};
var DEFAULT_SETTINGS = {
  global_operation_detail: DEFAULT_GLOBAL_OPERATION_DETAIL,
  default_max_depth: 8,
  default_max_steps: 200,
  aggregation_mode: "manual"
};

// src/schema/migration.ts
var CURRENT_SNAPSHOT_VERSION = 2;
var migrateV1ToV2 = (snapshot) => {
  const rawNodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const nodes = rawNodes.map((node) => {
    if (typeof node !== "object" || node === null) return node;
    const record = node;
    return record.current_state === "not_started" ? { ...record, current_state: "discussing" } : record;
  });
  return { ...snapshot, version: 2, nodes };
};
var SNAPSHOT_MIGRATIONS = {
  1: migrateV1ToV2
};
function readSnapshotVersion(raw) {
  if (typeof raw === "object" && raw !== null && "version" in raw) {
    const version = raw.version;
    if (typeof version === "number" && Number.isInteger(version)) return version;
  }
  throw new Error("\u5FEB\u7167\u7F3A\u5C11\u5408\u6CD5\u7684 version \u5B57\u6BB5");
}
function migrateSnapshot(raw, migrations = SNAPSHOT_MIGRATIONS) {
  let snapshot = raw;
  let version = readSnapshotVersion(snapshot);
  let guard = 0;
  while (version < CURRENT_SNAPSHOT_VERSION) {
    const step = migrations[version];
    if (!step) throw new Error(`\u7F3A\u5C11\u4ECE v${version} \u5230 v${version + 1} \u7684\u8FC1\u79FB`);
    snapshot = step(snapshot);
    version = readSnapshotVersion(snapshot);
    if (++guard > 100) throw new Error("\u8FC1\u79FB\u94FE\u7591\u4F3C\u6B7B\u5FAA\u73AF");
  }
  if (version > CURRENT_SNAPSHOT_VERSION) {
    throw new Error(`\u5FEB\u7167\u7248\u672C v${version} \u9AD8\u4E8E\u5F53\u524D\u652F\u6301\u7684 v${CURRENT_SNAPSHOT_VERSION}`);
  }
  return WorkflowSnapshot.parse(snapshot);
}

// src/adapter/json-storage.ts
var JsonStorageAdapter = class {
  constructor(baseDir) {
    this.baseDir = baseDir;
  }
  snapshotPath(workspaceId) {
    return path.join(this.baseDir, "workflows", `${workspaceId}.json`);
  }
  async load(workspaceId) {
    try {
      const raw = await fs.readFile(this.snapshotPath(workspaceId), "utf8");
      return migrateSnapshot(JSON.parse(raw));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async save(snapshot) {
    const p = this.snapshotPath(snapshot.workspace_id);
    await fs.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8");
    for (let attempt = 0; ; attempt += 1) {
      try {
        await fs.rename(tmp, p);
        return;
      } catch (error) {
        const code = error.code;
        if ((code === "EPERM" || code === "EACCES") && attempt < 6) {
          await new Promise((resolve5) => setTimeout(resolve5, 8 * (attempt + 1)));
          continue;
        }
        await fs.rm(tmp, { force: true }).catch(() => {
        });
        throw error;
      }
    }
  }
};

// src/schema/manual-limits.ts
var DEFAULT_MANUAL_LIMITS = {
  constraints_chars: 300,
  plan_chars: 500,
  slice_pitfalls_chars: 300,
  session_total_chars: 2e3
};
var MANUAL_LIMIT_MIN_CHARS = 20;
var MANUAL_LIMIT_MAX_CHARS = 2e4;
var CHECK_EVIDENCE_MARK = " \uFF5C \u81EA\u68C0\uFF1A";
var CHECK_SCOPE_MARK = " \uFF5C \u8303\u56F4\uFF1A";
function countManualChars(text) {
  return Array.from(text).length;
}
function stripManualEvidence(text) {
  return text.split(/\r?\n/).map((line) => {
    const cut = line.indexOf(CHECK_EVIDENCE_MARK);
    return cut === -1 ? line : line.slice(0, cut);
  }).join("\n");
}
function sanitizeManualLimits(raw) {
  const source = raw ?? {};
  const read = (value, fallback) => {
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) return fallback;
    const rounded = Math.round(number);
    return Math.min(MANUAL_LIMIT_MAX_CHARS, Math.max(MANUAL_LIMIT_MIN_CHARS, rounded));
  };
  return {
    constraints_chars: read(source.constraints_chars, DEFAULT_MANUAL_LIMITS.constraints_chars),
    plan_chars: read(source.plan_chars, DEFAULT_MANUAL_LIMITS.plan_chars),
    slice_pitfalls_chars: read(source.slice_pitfalls_chars, DEFAULT_MANUAL_LIMITS.slice_pitfalls_chars),
    session_total_chars: read(source.session_total_chars, DEFAULT_MANUAL_LIMITS.session_total_chars)
  };
}
var SECTION_LIMIT_FIELD = {
  \u7EA6\u675F: "constraints_chars",
  \u65B9\u6848: "plan_chars",
  \u5782\u76F4\u5207\u7247\u5751: "slice_pitfalls_chars"
};
var SECTION_TRIM_HINTS = {
  \u7EA6\u675F: "\u5220\u6389\u5DF2\u88AB\u6D4B\u8BD5\u6216\u4EE3\u7801\u56FA\u5316\u9A8C\u8BC1\u8FC7\u7684\u6761\u76EE\u3001\u53EA\u5BF9\u67D0\u4E2A\u5206\u652F\u6210\u7ACB\u7684\u4E34\u65F6\u7EA6\u5B9A\uFF1B\u540C\u7C7B\u7981\u4EE4\u5408\u5E76\u6210\u4E00\u6761\u3002",
  \u65B9\u6848: '\u628A\u5DF2\u843D\u5730\u7684\u5B9E\u73B0\u7EC6\u8282\u632A\u56DE\u4EE3\u7801\uFF0C\u65B9\u6848\u91CC\u53EA\u7559\u76EE\u6807\u3001\u5206\u5C42\u548C\u5C42\u95F4\u5951\u7EA6\uFF1B\u957F\u7BC7\u8BBA\u8BC1\u6362\u6210\u4E00\u53E5"\u4E0D\u8FD9\u4E48\u505A\u4F1A\u600E\u6837"\u3002',
  \u5782\u76F4\u5207\u7247\u5751: "\u53EA\u7559\u300C\u505A\u5B8C\u518D\u6539\u5C31\u8D35\u300D\u7684\u5751\uFF08\u4F9D\u8D56\u65B9\u5411 / \u8DE8\u5C42 / \u5951\u7EA6\u4E0D\u4E00\u81F4\uFF09\uFF0C\u7EC6\u8282\u5B9E\u73B0\u5751\u5199\u9879\u76EE\u624B\u518C\uFF0C\u522B\u585E\u8FD9\u91CC\u3002"
};
var ManualLimitError = class extends Error {
  code = "manual-limit";
  constructor(message) {
    super(message);
    this.name = "ManualLimitError";
  }
};
function assertSectionLimit(section, content, limits) {
  const chars = countManualChars(stripManualEvidence(content));
  const field = SECTION_LIMIT_FIELD[section];
  if (field === void 0) return chars;
  const limit = limits[field];
  const hint = SECTION_TRIM_HINTS[section] ?? "";
  if (section === "\u65B9\u6848") {
    const subsections = splitPlanSubsections(content);
    if (subsections.length === 0) {
      if (chars > limit) {
        throw new ManualLimitError(
          `\u300C\u65B9\u6848\u300D\u73B0\u5728 ${chars} \u5B57\uFF0C\u4E0A\u9650 ${limit} \u5B57\uFF0C\u8D85 ${chars - limit} \u5B57\u3002${hint}\uFF08\u5F3A\u5236\u4E0A\u9650\uFF0C\u5148\u7CBE\u7B80\u518D\u5199\uFF09`
        );
      }
      return chars;
    }
    for (const subsection of subsections) {
      if (subsection.title.includes("\u76EE\u6807")) continue;
      const subChars = countManualChars(stripManualEvidence(subsection.body));
      if (subChars > limit) {
        throw new ManualLimitError(
          `\u300C\u65B9\u6848 / ${subsection.title}\u300D\u73B0\u5728 ${subChars} \u5B57\uFF0C\u4E0A\u9650 ${limit} \u5B57\uFF0C\u8D85 ${subChars - limit} \u5B57\u3002${hint}\uFF08\u5F3A\u5236\u4E0A\u9650\uFF0C\u5148\u7CBE\u7B80\u518D\u5199\uFF09`
        );
      }
    }
    return chars;
  }
  if (chars > limit) {
    throw new ManualLimitError(
      `\u300C${section}\u300D\u73B0\u5728 ${chars} \u5B57\uFF0C\u4E0A\u9650 ${limit} \u5B57\uFF0C\u8D85 ${chars - limit} \u5B57\u3002${hint}\uFF08\u5F3A\u5236\u4E0A\u9650\uFF0C\u5148\u7CBE\u7B80\u518D\u5199\uFF09`
    );
  }
  return chars;
}
function splitPlanSubsections(content) {
  const sections = [];
  let current = null;
  for (const line of content.split(/\r?\n/)) {
    const heading = /^###\s*(?:(\d+)\.\s*)?(.+?)\s*$/.exec(line);
    if (heading !== null) {
      if (current !== null) sections.push({ title: current.title, body: current.lines.join("\n").trim() });
      current = { title: heading[2] ?? "", lines: [] };
      continue;
    }
    if (current !== null) current.lines.push(line);
  }
  if (current !== null) sections.push({ title: current.title, body: current.lines.join("\n").trim() });
  return sections;
}
function assertSessionManualTotal(manual, limits) {
  const chars = countManualChars(stripManualEvidence(manual));
  const limit = limits.session_total_chars;
  if (chars > limit) {
    throw new ManualLimitError(
      `\u4F1A\u8BDD\u624B\u518C\u6574\u672C\u73B0\u5728 ${chars} \u5B57\uFF0C\u4E0A\u9650 ${limit} \u5B57\uFF0C\u8D85 ${chars - limit} \u5B57\u3002\u5148\u5408\u5E76\u540C\u7C7B\u6761\u76EE\u3001\u5220\u6389\u5DF2\u88AB\u65B0\u51B3\u7B56\u63A8\u7FFB\u7684\u65E7\u5185\u5BB9\uFF1B\u52FE\u9009\u8BC1\u636E\uFF08\uFF5C \u81EA\u68C0\uFF1A\u2026\uFF09\u4E0D\u8BA1\u5165\u5B57\u6570\uFF0C\u4E0D\u7528\u4E3A\u4E86\u5B57\u6570\u5220\u8BC1\u636E\u3002`
    );
  }
  return chars;
}

// src/schema/verify-checks.ts
var VERIFY_CHECKS = [
  { id: 1, name: "\u5951\u7EA6\u6D4B\u8BD5", needs_command: true, modifies: "source", judge: "\u5BF9\u5916\u884C\u4E3A\u4E0E\u539F\u5B9E\u73B0\u4E00\u81F4\u6216\u6309\u65B0\u5951\u7EA6\u9A8C\u8BC1\uFF0C\u8981\u6709\u53EF\u590D\u73B0\u5BF9\u7167", checker: { id: "contract", enforcement: "required" } },
  { id: 2, name: "\u4F9D\u8D56\u68C0\u67E5", needs_command: false, modifies: "source", judge: "\u65E0\u53CD\u5411\u4F9D\u8D56\u3001\u65E0\u5FAA\u73AF\u4F9D\u8D56\u3001\u65E0\u8DE8\u5C42\u5F15\u7528", checker: { id: "deps", enforcement: "required" } },
  { id: 3, name: "\u6B7B\u4EE3\u7801\u626B\u63CF", needs_command: false, modifies: "source", judge: "\u65E0\u7528\u5BFC\u51FA / \u53C2\u6570 / \u5B57\u6BB5\uFF0C\u4E14\u8981\u8BC1\u660E\u786E\u5B9E\u53EF\u5220\uFF08\u5F15\u7528\u8BA1\u6570\u4E3A\u96F6\uFF09", checker: { id: "deadcode", enforcement: "required" } },
  { id: 4, name: "\u8FB9\u754C\u6D4B\u8BD5", needs_command: true, modifies: "source", judge: "\u5916\u90E8\u4F9D\u8D56\u53EF mock\uFF0C\u6A21\u5757\u80FD\u72EC\u7ACB\u6D4B\u8BD5", checker: { id: "boundary", enforcement: "required" } },
  { id: 5, name: "\u547D\u540D\u4E0E\u8FB9\u754C\u5BA1\u67E5", needs_command: false, modifies: "none", judge: "\u6CDB\u5316\u8BCD\u3001\u8DE8\u6A21\u5757\u66B4\u9732\u3001\u53CD\u5411\u5197\u957F\u3001\u524D\u7F00\u8D8A\u754C\u56DB\u9879", checker: { id: "naming", enforcement: "assistive", require_run: true } },
  { id: 6, name: "\u57CB\u70B9\u68C0\u6D4B", needs_command: false, modifies: "source", judge: "\u9ED1\u76D2\u9010\u8DF3\u4E09\u95EE + \u767D\u76D2\u4E94\u5B57\u6BB5\uFF0C\u4E09\u7C7B\u7ED3\u8BBA\uFF1A\u65AD\u70B9 / \u65E0\u6548\u57CB\u70B9 / \u8D28\u91CF\u76F2\u533A", checker: { id: "instrumentation", enforcement: "assistive", require_run: true } },
  { id: 7, name: "\u56DE\u5F52\u4E0E\u538B\u6D4B", needs_command: true, modifies: "source", judge: "\u8DD1\u73B0\u6709\u6D4B\u8BD5\u5957\u4EF6\uFF0C\u7ED9 pass / fail + \u8BC1\u636E\uFF08\u8017\u65F6\u3001\u9519\u8BEF\u7387\u3001\u57CB\u70B9\u62BD\u6837\uFF09", checker: { id: "regression", enforcement: "required" } },
  { id: 8, name: "\u6536\u5C3E", needs_command: false, modifies: "docs", judge: "\u628A\u65B0\u51B3\u7B56 / \u65B0\u5751 / \u6587\u6863\u4E00\u81F4\u6027\u5199\u8FDB\u9879\u76EE\u624B\u518C\uFF0C\u7136\u540E\u63A8\u8FDB\u5230\u5DF2\u5B8C\u7ED3\uFF08\u81EA\u52A8\uFF0C\u4E0D\u518D\u8981\u4EBA\u540C\u610F\uFF09" }
];
function verifyMarkSymbol(mark) {
  if (mark === "pass") return "\u2713";
  if (mark === "deferred") return "\uFF1F";
  return "\u25CB";
}
function createVerification(round) {
  return {
    round,
    items: VERIFY_CHECKS.map((check) => ({ id: check.id, mark: "pending", report: null })),
    checker_runs: []
  };
}

// src/engine/verify-rules.ts
function resolveVerifyCheckId(raw) {
  const text = String(raw ?? "").trim();
  const asNumber3 = Number(text);
  if (Number.isInteger(asNumber3)) {
    const found = VERIFY_CHECKS.find((check) => check.id === asNumber3);
    if (found !== void 0) return found.id;
  }
  const byName = VERIFY_CHECKS.find((check) => check.name === text);
  if (byName !== void 0) return byName.id;
  throw new Error(
    `\u300C${text}\u300D\u4E0D\u662F\u9A8C\u6536\u9879\uFF1A\u7528 id 1-${VERIFY_CHECKS.length} \u6216\u540D\u79F0\uFF08${VERIFY_CHECKS.map((check) => `${check.id} ${check.name}`).join(" / ")}\uFF09`
  );
}
function assertAnchorPathShape(file) {
  const normalized = file.replace(/\\/g, "/");
  if (normalized.trim() === "") throw new Error("\u8BC1\u636E\u8DEF\u5F84\u4E0D\u80FD\u4E3A\u7A7A");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`\u8BC1\u636E\u8DEF\u5F84\u5FC5\u987B\u662F\u5DE5\u4F5C\u76EE\u5F55\u5185\u7684\u76F8\u5BF9\u8DEF\u5F84\uFF08\u4E0D\u8BA4\u7EDD\u5BF9\u8DEF\u5F84\uFF09\uFF1A${file}`);
  }
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new Error(`\u8BC1\u636E\u8DEF\u5F84\u4E0D\u80FD\u542B ..\uFF08\u4E0D\u8BB8\u8DD1\u51FA\u5DE5\u4F5C\u76EE\u5F55\uFF09\uFF1A${file}`);
  }
}
function parseCheckerResult(raw) {
  if (raw === void 0 || raw === null) return void 0;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("checker \u5FC5\u987B\u662F\u5BF9\u8C61\uFF1A{ checker_id, ok, findings, exit_code }");
  }
  const record = raw;
  const checkerId = typeof record.checker_id === "string" ? record.checker_id.trim() : "";
  if (checkerId === "") throw new Error("checker.checker_id \u4E0D\u80FD\u4E3A\u7A7A");
  const ok = record.ok;
  if (typeof ok !== "boolean") throw new Error("checker.ok \u5FC5\u987B\u662F\u5E03\u5C14\u503C");
  const findings = record.findings;
  if (typeof findings !== "number" || !Number.isInteger(findings) || findings < 0) {
    throw new Error("checker.findings \u5FC5\u987B\u662F\u975E\u8D1F\u6574\u6570");
  }
  const exitCodeRaw = record.exit_code;
  if (exitCodeRaw !== null && exitCodeRaw !== void 0 && (typeof exitCodeRaw !== "number" || !Number.isInteger(exitCodeRaw))) {
    throw new Error("checker.exit_code \u5FC5\u987B\u662F\u6574\u6570\u6216 null");
  }
  const exitCode = exitCodeRaw === void 0 || exitCodeRaw === null ? null : exitCodeRaw;
  return { checker_id: checkerId, ok, findings, exit_code: exitCode };
}
function validateCheckerGate(check, checker, result, command) {
  if (check.checker?.enforcement !== "required") return void 0;
  if (result !== "pass") return void 0;
  if (checker === void 0) {
    return `\u300C${check.name}\u300D\u6709\u68C0\u67E5\u5668\uFF0C\u62A5 pass \u524D\u5FC5\u987B\u5148\u8DD1\u5BF9\u5E94 check_* \u5E76\u5E26 checker \u7ED3\u679C\uFF08\u7B2C\u4E00\u5C42\u95E8\u7981\uFF09`;
  }
  if (checker.ok === false && command === "") {
    return `\u300C${check.name}\u300D\u68C0\u67E5\u5668\u5931\u8D25\uFF08\u62A5\u9519/\u975E0/\u8BC1\u636E\u7A7A\uFF09\uFF0C\u62A5 pass \u5C5E AI \u515C\u5E95\uFF0C\u5FC5\u987B\u5E26\u53EF\u590D\u8DD1\u547D\u4EE4 command\uFF08\u7B2C\u4E8C\u5C42\u95E8\u7981\uFF09`;
  }
  return void 0;
}
function validateVerifyReportInput(check, raw) {
  const result = raw?.result;
  if (result !== "pass" && result !== "deferred") {
    throw new Error("\u62A5\u5907\u7ED3\u8BBA\u53EA\u80FD\u662F pass\uFF08\u901A\u8FC7\uFF09\u6216 deferred\uFF08\u67E5\u51FA\u95EE\u9898\u4F46\u672C\u8F6E\u4E0D\u4FEE\uFF0C\u8BB0 \uFF1F\uFF09");
  }
  const summary = typeof raw?.summary === "string" ? raw.summary.trim() : "";
  if (summary === "") throw new Error("\u62A5\u5907\u8981\u5199\u7ED3\u8BBA\u6458\u8981\uFF1A\u505A\u4E86\u4EC0\u4E48\u3001\u770B\u5230\u4EC0\u4E48\u7ED3\u679C");
  const rawAnchors = Array.isArray(raw?.anchors) ? raw.anchors : [];
  if (rawAnchors.length === 0) {
    throw new Error("\u62A5\u5907\u81F3\u5C11\u8981\u7ED9\u4E00\u6761\u8BC1\u636E\u951A\u70B9 anchors\uFF1A[{ file, line? }]\uFF08\u6587\u4EF6\u5FC5\u987B\u5728\u5DE5\u4F5C\u76EE\u5F55\u5185\uFF09");
  }
  const anchors = rawAnchors.map((anchor, index) => {
    const file = typeof anchor?.file === "string" ? anchor.file.trim() : "";
    if (file === "") throw new Error(`\u7B2C ${index + 1} \u6761\u951A\u70B9\u7F3A file`);
    assertAnchorPathShape(file);
    const line = anchor?.line;
    if (line !== void 0 && line !== null) {
      if (!Number.isInteger(line) || line <= 0) throw new Error(`\u951A\u70B9\u884C\u53F7\u5FC5\u987B\u662F\u6B63\u6574\u6570\uFF1A${file}:${String(line)}`);
      return { file, line };
    }
    return { file };
  });
  const command = typeof raw?.command === "string" ? raw.command.trim() : "";
  if (check.needs_command && command === "") {
    throw new Error(`\u300C${check.name}\u300D\u5FC5\u987B\u5199\u590D\u8DD1\u547D\u4EE4 command\uFF08\u4F8B\uFF1Anpx vitest run test/xxx.test.ts\uFF09`);
  }
  const findings = [];
  if (result === "deferred") {
    const rawFindings = Array.isArray(raw?.findings) ? raw.findings : [];
    if (rawFindings.length === 0) {
      throw new Error("\u7ED3\u8BBA deferred \u5FC5\u987B\u5E26 findings\uFF1A\u6BCF\u6761\u5199\u6E05 \u4F4D\u7F6E / \u95EE\u9898 / \u4E3A\u4EC0\u4E48\u4E0D\u4FEE / \u5F71\u54CD\u4EC0\u4E48");
    }
    rawFindings.forEach((finding, index) => {
      const fields = ["location", "problem", "why_not_fixed", "impact"];
      const parsed = {};
      for (const field of fields) {
        const value = typeof finding?.[field] === "string" ? finding[field].trim() : "";
        if (value === "") throw new Error(`\u7B2C ${index + 1} \u6761 findings \u7F3A\u300C${field}\u300D`);
        parsed[field] = value;
      }
      findings.push(parsed);
    });
  }
  const checker = parseCheckerResult(raw?.checker);
  const gateError = validateCheckerGate(check, checker, result, command);
  if (gateError !== void 0) throw new Error(gateError);
  return {
    result,
    summary,
    anchors,
    ...command === "" ? {} : { command },
    ...findings.length === 0 ? {} : { findings },
    ...checker === void 0 ? {} : { checker }
  };
}
function normalizeCheckerRun(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw;
  const checkerId = typeof record.checker_id === "string" ? record.checker_id : "";
  const at = typeof record.at === "string" ? record.at : "";
  if (checkerId === "" || at === "") return null;
  const ok = record.ok === true;
  const findings = typeof record.findings === "number" && Number.isInteger(record.findings) && record.findings >= 0 ? record.findings : 0;
  const exitRaw = record.exit_code;
  const exitCode = typeof exitRaw === "number" || exitRaw === null ? exitRaw : null;
  const evidence = typeof record.evidence === "string" && record.evidence !== "" ? record.evidence : void 0;
  return { checker_id: checkerId, ok, exit_code: exitCode, findings, ...evidence === void 0 ? {} : { evidence }, at };
}
function pickVerification(raw) {
  if (raw === null || typeof raw !== "object") return createVerification(0);
  const source = raw;
  const round = typeof source.round === "number" && Number.isInteger(source.round) && source.round >= 0 ? source.round : 0;
  const incoming = Array.isArray(source.items) ? source.items : [];
  const items = VERIFY_CHECKS.map((check) => {
    const found = incoming.find((item) => item?.id === check.id);
    if (found === void 0 || found === null) return { id: check.id, mark: "pending", report: null };
    const mark = found.mark === "pass" || found.mark === "deferred" ? found.mark : "pending";
    const report = mark !== "pending" && found.report !== null && typeof found.report === "object" ? found.report : null;
    return { id: check.id, mark: report === null ? "pending" : mark, report };
  });
  const checkerRuns = Array.isArray(source.checker_runs) ? source.checker_runs.map((run) => normalizeCheckerRun(run)).filter((run) => run !== null) : [];
  return { round, items, checker_runs: checkerRuns };
}
function summarizeVerification(state) {
  const pass = state.items.filter((item) => item.mark === "pass").length;
  const deferred = state.items.filter((item) => item.mark === "deferred").length;
  const pending = state.items.filter((item) => item.mark === "pending").length;
  return {
    total: state.items.length,
    pass,
    deferred,
    pending,
    complete: pending === 0
  };
}
function describePendingItems(state) {
  return state.items.filter((item) => item.mark === "pending").map((item) => `${item.id} ${VERIFY_CHECKS.find((check) => check.id === item.id)?.name ?? ""}`.trim()).join(" / ");
}

// src/engine/manual-parse.ts
function headingText(line) {
  return line.replace(/^#+\s*/, "").trim();
}
function splitManualSections(manual) {
  const sections = [];
  let current = null;
  for (const line of manual.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      if (current !== null) sections.push({ title: current.title, body: current.lines.join("\n").trim() });
      current = { title: headingText(line), lines: [] };
      continue;
    }
    if (current !== null) current.lines.push(line);
  }
  if (current !== null) sections.push({ title: current.title, body: current.lines.join("\n").trim() });
  return sections;
}
function stripHtmlComments(text) {
  return text.split(/\r?\n/).filter((line) => !line.trim().startsWith("<!--")).join("\n").trim();
}
function pickSectionBody(manual, prefixes) {
  return splitManualSections(manual).find((section) => prefixes.some((prefix) => section.title.startsWith(prefix)))?.body ?? "";
}
function parseChecklistLine(raw) {
  let text = raw;
  let scope = [];
  const scopeCut = text.indexOf(CHECK_SCOPE_MARK);
  if (scopeCut !== -1) {
    const rest = text.slice(scopeCut + CHECK_SCOPE_MARK.length);
    const evidenceCut2 = rest.indexOf(CHECK_EVIDENCE_MARK);
    const scopeText = evidenceCut2 === -1 ? rest : rest.slice(0, evidenceCut2);
    scope = scopeText.split(/[,，]/).map((segment) => segment.trim()).filter((segment) => segment !== "");
    text = text.slice(0, scopeCut);
  }
  const evidenceCut = text.indexOf(CHECK_EVIDENCE_MARK);
  const label = (evidenceCut === -1 ? text : text.slice(0, evidenceCut)).trim();
  return { label, scope };
}
function parseChecklist(manual) {
  const lines = manual.split(/\r?\n/);
  let inSection = false;
  const items = [];
  for (const line of lines) {
    if (line.trim() === "## \u5B9E\u65BD\u987A\u5E8F") {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("## ")) break;
    if (!inSection) continue;
    const match = /^\s*-\s+\[([ xX])\]\s*(.+)$/.exec(line);
    if (match !== null) {
      const parsed = parseChecklistLine((match[2] ?? "").trim());
      items.push({ label: parsed.label, done: match[1] !== " ", scope: parsed.scope });
    }
  }
  return items;
}
function collectChecklistScope(items) {
  const seen = /* @__PURE__ */ new Set();
  for (const item of items) {
    for (const path2 of item.scope) {
      const normalized = path2.replace(/\\/g, "/");
      if (normalized !== "" && !seen.has(normalized)) seen.add(normalized);
    }
  }
  return [...seen];
}
var SCOPE_APPEND_SECTION = "\u8303\u56F4\u8FFD\u52A0";
var SCOPE_REASON_MARK = " \uFF5C \u539F\u56E0\uFF1A";
function parseScopeAppends(manual) {
  const body = pickSectionBody(manual, [SCOPE_APPEND_SECTION]);
  if (body.trim() === "") return [];
  const paths = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;
    const text = trimmed.slice(2).trim();
    if (text === "") continue;
    const cut = text.indexOf(SCOPE_REASON_MARK);
    const path2 = (cut === -1 ? text : text.slice(0, cut)).trim().replace(/\\/g, "/");
    if (path2 !== "") paths.push(path2);
  }
  return paths;
}
function parseHasPlan(manual) {
  const lines = manual.split(/\r?\n/);
  let inPlan = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## \u65B9\u6848")) {
      inPlan = true;
      continue;
    }
    if (inPlan && trimmed.startsWith("## ")) break;
    if (!inPlan) continue;
    if (trimmed === "" || trimmed.startsWith("### ") || trimmed.startsWith("<!--")) continue;
    return true;
  }
  return false;
}

// src/engine/manual-tags.ts
var TAG_TABLE_SECTION = "\u6807\u7B7E\u8868";
var TAG_TABLE_MAX = 30;
var TAG_MAX_CHARS = 12;
var TAG_SEPARATOR = "\uFF5C";
var ENTRY_PATTERN = /^(\s*-\s+)\[([^\]]*)\]\s*(.*)$/;
function normalizeTag(raw) {
  if (typeof raw !== "string") return null;
  const folded = raw.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  if (folded === "") return null;
  if (/[[\]｜|]/.test(folded)) return null;
  if (Array.from(folded).length > TAG_MAX_CHARS) return null;
  return folded;
}
function dedupeTags(tags) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const tag of tags) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}
function parseTagTable(sectionBody) {
  const tags = [];
  for (const raw of sectionBody.split(/\r?\n/)) {
    const line = raw.trim().replace(/^-\s*/, "");
    if (line === "") continue;
    const normalized = normalizeTag(line);
    if (normalized !== null) tags.push(normalized);
  }
  return dedupeTags(tags);
}
function renderTagTable(tags) {
  return dedupeTags(tags).map((tag) => `- ${tag}`).join("\n");
}
function parseEntryLine(line) {
  const matched = ENTRY_PATTERN.exec(line);
  if (matched === null) return null;
  const tags = dedupeTags((matched[2] ?? "").split(new RegExp(`[${TAG_SEPARATOR}|]`)).map((tag) => normalizeTag(tag)).filter((tag) => tag !== null));
  return { tags, text: (matched[3] ?? "").trim() };
}
function renderEntryLine(tags, text) {
  return `- [${dedupeTags(tags).join(TAG_SEPARATOR)}] ${text.trim()}`;
}
function rewriteEntryTag(line, from, to) {
  const parsed = parseEntryLine(line);
  if (parsed === null) return line;
  if (!parsed.tags.includes(from)) return line;
  const next = dedupeTags(parsed.tags.map((tag) => tag === from ? to : tag));
  return renderEntryLine(next, parsed.text);
}
function findEntryLineIndexes(body, entry) {
  const target = entry.trim();
  const hits = [];
  body.split(/\r?\n/).forEach((line, index) => {
    const parsed = parseEntryLine(line);
    const text = parsed === null ? line.trim().replace(/^-\s*/, "") : parsed.text;
    if (text === target) hits.push(index);
  });
  return hits;
}

// src/host/workflow-repository.ts
var BUILTIN_PROFILE_NAME = "\u9ED8\u8BA4\u5B58\u6863";
var MIGRATED_PROFILE_NAME = "\u6211\u7684\u5B58\u6863";
function buildRootNode(id, maxDepth, maxSteps) {
  return {
    node_id: id,
    parent_id: null,
    node_type: "workspace",
    current_state: "discussing",
    child_ids: [],
    context_payload: null,
    flags: [],
    depth: 0,
    max_depth: maxDepth,
    step_count: 0,
    max_steps: maxSteps
  };
}
var WORKFLOW_SUBDIR = ".workflow";
var MANUAL_MAX_BYTES = 200 * 1024;
var GLOBAL_MANUAL_MAX_BYTES = 64 * 1024;
function sessionManualFileName(nodeId) {
  return `\u4F1A\u8BDD\u624B\u518C-${nodeId}.md`;
}
function globalManualFileName() {
  return "\u9879\u76EE\u624B\u518C.md";
}
var SESSION_MANUAL_TEMPLATE = [
  "# \u4F1A\u8BDD\u624B\u518C",
  "",
  "## \u65B9\u6848\uFF08\u81EA\u5E95\u5411\u4E0A\uFF09",
  "### 1. \u76EE\u6807\u4E0E\u9A8C\u6536",
  "<!-- \u8981\u89E3\u51B3\u4EC0\u4E48\u3001\u4E0D\u505A\u4EC0\u4E48\u3001\u9A8C\u6536\u6807\u51C6\uFF1B\u603B\u5206\uFF1A\u603B\u8FF0\u4E00\u53E5 + \u5206\u9879\u7F16\u53F7\u9010\u6761\uFF081\u3001xxx\u3002\u6362\u884C 2\u3001xxx\u3002\uFF09 -->",
  "### 2. \u5782\u76F4\u5207\u7247",
  "<!-- \u6700\u8584\u7AEF\u5230\u7AEF\u5207\u7247\uFF0C\u9A8C\u4F9D\u8D56\u65B9\u5411 / \u8DE8\u5C42 / \u5951\u7EA6\uFF1B\u5B8C\u6210\u6807\u51C6\uFF1A\u7AEF\u5230\u7AEF\u8DD1\u901A\uFF1B\u5C42\u95F4\u5951\u7EA6\uFF1A\u53EA\u66B4\u9732\u6700\u5C0F\u95ED\u73AF -->",
  "### 3. \u6570\u636E\u5C42",
  "<!-- \u6570\u636E\u6A21\u578B / \u6301\u4E45\u5316 / \u8FC1\u79FB\uFF1B\u5B8C\u6210\u6807\u51C6\uFF1A\u80FD\u8BFB\u5199\u3001\u8FC1\u79FB\u53EF\u8DD1\uFF0C\u9644\u6D4B\u8BD5\u811A\u672C\uFF1B\u5C42\u95F4\u5951\u7EA6\uFF1A\u5BF9\u5916\u53EA\u66B4\u9732 ____\uFF0C\u4E0A\u5C42\u4E0D\u76F4\u63A5\u78B0\u5B58\u50A8\u5B9E\u73B0 -->",
  "### 4. \u9886\u57DF\u5C42",
  "<!-- \u6838\u5FC3\u89C4\u5219 / \u72B6\u6001\u673A / \u7B97\u6CD5\uFF1B\u5B8C\u6210\u6807\u51C6\uFF1A\u903B\u8F91\u72EC\u7ACB\u53EF\u6D4B\uFF0C\u9644\u6D4B\u8BD5\u811A\u672C\uFF1B\u5C42\u95F4\u5951\u7EA6\uFF1A\u53EA\u66B4\u9732\u7EAF\u51FD\u6570 ____\uFF0C\u4E0D\u78B0 DOM\u3001\u4E0D\u8BFB\u5199\u5168\u5C40 -->",
  "### 5. \u63A5\u53E3\u5C42",
  "<!-- \u5BF9\u5916\u5951\u7EA6\uFF08\u5DE5\u5177 / \u8DEF\u7531 / \u547D\u4EE4\uFF09\uFF1B\u5B8C\u6210\u6807\u51C6\uFF1A\u5951\u7EA6\u6D4B\u8BD5\u901A\u8FC7\uFF0C\u9644\u6D4B\u8BD5\u6587\u4EF6\uFF1B\u5C42\u95F4\u5951\u7EA6\uFF1A\u53EA\u505A\u4E8B\u4EF6 \u2192 action \u6620\u5C04\uFF0C\u4E0D\u505A\u8BA1\u7B97\u3001\u4E0D\u6E32\u67D3 -->",
  "### 6. \u8868\u73B0\u5C42",
  "<!-- UI / \u6587\u6848 / \u7AEF\u5230\u7AEF\uFF1B\u5B8C\u6210\u6807\u51C6\uFF1Abuild + smoke \u901A\u8FC7\uFF1B\u5C42\u95F4\u5951\u7EA6\uFF1A\u53EA\u6D88\u8D39\u53EA\u8BFB\u72B6\u6001\u6E32\u67D3\uFF0C\u4E0D\u53CD\u5411\u5199\u6570\u636E\u5C42 -->",
  "",
  "## \u5782\u76F4\u5207\u7247\u5751",
  "<!-- \u5782\u76F4\u5207\u7247\u6316\u51FA\u7684\u300C\u505A\u5B8C\u518D\u6539\u8D35\u300D\u7684\u5751\uFF0C\u53EA\u6311\u5173\u952E\u51E0\u6761\u5582\u7ED9\u540E\u7EED\u5C42 -->",
  "",
  "## \u5B9E\u65BD\u987A\u5E8F",
  "<!-- \u6BCF\u6761\u53EF\u9009\u52A0\u300C \uFF5C \u8303\u56F4\uFF1A\u76EE\u5F551,\u76EE\u5F552\u300D\u58F0\u660E\u8BE5\u6B65\u8981\u6539\u52A8\u7684\u76F8\u5BF9\u8DEF\u5F84\uFF08\u5C3D\u91CF\u76EE\u5F55\u7C92\u5EA6\uFF09\uFF1B\u58F0\u660E\u540E\u8FDB\u5165\u5B9E\u73B0\u4E2D\uFF0C\u8D8A\u754C\u6539\u52A8\u4F1A\u88AB\u95E8\u7981\u62E6\u622A -->",
  "- [ ] \u5782\u76F4\u5207\u7247 \u2014\u2014 \u5B8C\u6210\u6807\u51C6\uFF1A\u7AEF\u5230\u7AEF\u8DD1\u901A",
  "- [ ] \u6570\u636E\u5C42 \u2014\u2014 \u5B8C\u6210\u6807\u51C6\uFF1A\u80FD\u8BFB\u5199\u3001\u8FC1\u79FB\u53EF\u8DD1",
  "- [ ] \u9886\u57DF\u5C42 \u2014\u2014 \u5B8C\u6210\u6807\u51C6\uFF1A\u903B\u8F91\u72EC\u7ACB\u53EF\u6D4B",
  "- [ ] \u63A5\u53E3\u5C42 \u2014\u2014 \u5B8C\u6210\u6807\u51C6\uFF1A\u5951\u7EA6\u6D4B\u8BD5\u901A\u8FC7",
  "- [ ] \u8868\u73B0\u5C42 \u2014\u2014 \u5B8C\u6210\u6807\u51C6\uFF1Abuild + smoke \u901A\u8FC7",
  "",
  "## \u8303\u56F4\u8FFD\u52A0",
  "<!-- \u5B9E\u73B0\u4E2D extend_scope \u8FFD\u52A0\u7684\u8303\u56F4\uFF08append-only\uFF09\uFF0C\u6BCF\u6761\u300C- \u8DEF\u5F84 \uFF5C \u539F\u56E0\uFF1Axxx\u300D\uFF1B\u7531\u5DE5\u5177\u81EA\u52A8\u7EF4\u62A4 -->",
  ""
].join("\n");
var GLOBAL_MANUAL_TEMPLATE = [
  "# \u9879\u76EE\u624B\u518C",
  "",
  "## \u9879\u76EE\u603B\u89C8",
  "<!-- \u8FD9\u4E2A\u9879\u76EE\u5728\u505A\u4EC0\u4E48\u3001\u6280\u672F\u6808\u3001\u5173\u952E\u76EE\u5F55\uFF1B\u4E0D\u8D85\u8FC7 3 \u884C -->",
  "",
  "## \u51B3\u7B56\u8BB0\u5F55",
  "<!-- \u62CD\u677F\u8FC7\u7684\u5206\u53C9\u70B9\uFF1A\u9009\u4E86\u4EC0\u4E48\u3001\u4E3A\u4EC0\u4E48\u3001\u653E\u5F03\u4E86\u4EC0\u4E48\uFF1B\u6BCF\u6761\u4E0D\u8D85\u8FC7 2 \u884C -->",
  "",
  "## \u7EA6\u675F / \u7EA2\u7EBF",
  '<!-- \u672C\u9879\u76EE\u7EDD\u4E0D\u80FD\u505A\u7684\u4E8B\uFF1B\u53EA\u5199\u80FD\u5224\u5B9A\u7684\uFF0C\u4E0D\u5199"\u6CE8\u610F\u8D28\u91CF"\u8FD9\u7C7B\u7A7A\u8BDD -->',
  "",
  "## \u5751\u4E0E\u9632\u7EBF",
  "<!-- \u73B0\u8C61 \u2192 \u6839\u56E0 \u2192 \u9632\u7EBF \u2192 \u81EA\u67E5\uFF1B\u6BCF\u6761\u4E0D\u8D85\u8FC7 3 \u884C -->",
  "",
  "## \u6807\u7B7E\u8868",
  "<!-- \u5199\u6761\u76EE\u65F6\u53EA\u80FD\u4ECE\u8FD9\u91CC\u9009\uFF08\u6216\u586B\u9879\u76EE\u91CC\u771F\u5B9E\u5B58\u5728\u7684\u6587\u4EF6\u540D\uFF09\uFF1B\u4E00\u884C\u4E00\u4E2A\uFF0C\u6700\u591A 30 \u6761 -->",
  ""
].join("\n");
function availableSections(manual) {
  return manual.split(/\r?\n/).filter((line) => line.startsWith("## ")).map(headingText);
}
function replaceSectionBody(manual, section, content, aliases = []) {
  const lines = manual.split(/\r?\n/);
  const candidates = [section, ...aliases];
  const start = lines.findIndex((line) => line.startsWith("## ") && candidates.some((candidate) => headingText(line).startsWith(candidate)));
  if (start < 0) {
    throw new Error(`\u624B\u518C\u91CC\u6CA1\u6709\u300C${section}\u300D\u5C0F\u8282\uFF1B\u53EF\u7528\u5C0F\u8282\uFF1A${availableSections(manual).join(" / ")}`);
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== void 0 && line.startsWith("## ")) {
      end = index;
      break;
    }
  }
  const head = lines.slice(0, start + 1);
  const tail = lines.slice(end);
  const body = content.trim();
  return [...head, "", body, "", ...tail].join("\n").replace(/\n{3,}/g, "\n\n");
}
var MANUAL_SECTION_ALIASES = {
  "\u5751\u4E0E\u9632\u7EBF": ["\u8981\u70B9"]
};
function appendSection(manual, section, content) {
  const base = manual.trimEnd();
  const body = content.trim();
  return `${base}

## ${section}

${body}
`;
}
function toggleChecklistLine(manual, label, done, evidence) {
  const lines = manual.split(/\r?\n/);
  let inSection = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === void 0) continue;
    if (line.trim() === "## \u5B9E\u65BD\u987A\u5E8F") {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("## ")) break;
    if (!inSection) continue;
    const match = /^(\s*-\s+\[)([ xX])(\]\s*)(.+)$/.exec(line);
    if (match === null || match[4] === void 0) continue;
    const parsed = parseChecklistLine(match[4].trim());
    if (parsed.label !== label) continue;
    const scopeSuffix = parsed.scope.length > 0 ? `${CHECK_SCOPE_MARK}${parsed.scope.join(",")}` : "";
    const suffix = done && evidence !== "" ? `${CHECK_EVIDENCE_MARK}${evidence}` : "";
    lines[index] = `${match[1] ?? ""}${done ? "x" : " "}${match[3] ?? ""}${label}${scopeSuffix}${suffix}`;
    return lines.join("\n");
  }
  throw new Error(`\u6CA1\u80FD\u5B9A\u4F4D\u5230\u6761\u76EE\u300C${label}\u300D`);
}
async function writeTextAtomic(path2, content) {
  const tmp = `${path2}.${randomUUID2()}.tmp`;
  await fs2.writeFile(tmp, content, "utf8");
  await fs2.rename(tmp, path2);
}
async function writeIfMissing(path2, content) {
  try {
    await fs2.access(path2);
  } catch {
    await fs2.writeFile(path2, content, "utf8");
  }
}
async function readTextCapped(path2, maxBytes) {
  try {
    const raw = await fs2.readFile(path2, "utf8");
    if (Buffer.byteLength(raw, "utf8") <= maxBytes) return raw;
    return `${raw.slice(0, maxBytes)}
\u2026\uFF08\u5DF2\u622A\u65AD\uFF09`;
  } catch {
    return "";
  }
}
async function appendGitignore(workingDir) {
  if (typeof workingDir !== "string" || workingDir === "") return;
  const target = join(workingDir, ".gitignore");
  try {
    await fs2.access(target);
  } catch {
    return;
  }
  try {
    const content = await fs2.readFile(target, "utf8");
    if (content.includes(".workflow")) return;
    const separator = content !== "" && !content.endsWith("\n") ? "\n" : "";
    await fs2.writeFile(target, `${content}${separator}.workflow/
`, "utf8");
  } catch {
  }
}
var SOURCE_STAMP_SKIP_DIRS = /* @__PURE__ */ new Set([
  ".workflow",
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
  ".vitest",
  ".vite",
  ".cache",
  ".idea"
]);
var SOURCE_STAMP_MAX_FILES = 3e4;
async function computeSourceStamp(workingDir) {
  let mtimeMax = 0;
  let count = 0;
  async function walk(dir) {
    if (count >= SOURCE_STAMP_MAX_FILES) return;
    let entries;
    try {
      entries = await fs2.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (count >= SOURCE_STAMP_MAX_FILES) return;
      if (entry.isDirectory()) {
        if (SOURCE_STAMP_SKIP_DIRS.has(entry.name)) continue;
        await walk(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stat = await fs2.stat(join(dir, entry.name));
        count += 1;
        if (stat.mtimeMs > mtimeMax) mtimeMax = stat.mtimeMs;
      } catch {
      }
    }
  }
  await walk(workingDir);
  return { mtimeMax, count };
}
function normalizeScopePath(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") throw new Error("\u8303\u56F4\u8DEF\u5F84\u4E0D\u80FD\u4E3A\u7A7A");
  const normalized = text.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`\u8303\u56F4\u8DEF\u5F84\u5FC5\u987B\u662F\u5DE5\u4F5C\u76EE\u5F55\u5185\u7684\u76F8\u5BF9\u8DEF\u5F84\uFF08\u4E0D\u8BA4\u7EDD\u5BF9\u8DEF\u5F84\uFF09\uFF1A${text}`);
  }
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new Error(`\u8303\u56F4\u8DEF\u5F84\u4E0D\u80FD\u542B ..\uFF1A${text}`);
  }
  if (!/^[A-Za-z0-9_.@/-]+$/.test(normalized)) {
    throw new Error(`\u8303\u56F4\u8DEF\u5F84\u53EA\u80FD\u662F\u5B57\u6BCD / \u6570\u5B57 / . _ - / @\uFF0C\u4E0D\u80FD\u542B\u7A7A\u683C\u6216\u7279\u6B8A\u5B57\u7B26\uFF1A${text}`);
  }
  return normalized;
}
var WorkflowRepository = class {
  /**
   * @param baseDir     运行数据目录（workflows / trash / exports）：留在用户目录。
   * @param settingsDir 设置目录（global-settings / app-settings）：默认随插件走，
   *                    进 git；运行时数据不写这里，避免把用户工作流混进仓库。
   */
  constructor(baseDir, settingsDir = baseDir) {
    this.baseDir = baseDir;
    this.settingsDir = settingsDir;
    this.storage = new JsonStorageAdapter(baseDir);
  }
  storage;
  /** 手册元数据缓存：key = workflowId:nodeId，按文件 mtime 失效，避免每次轮询都读盘。 */
  manualMetaCache = /* @__PURE__ */ new Map();
  /** 每个工作区的写队列（串行化读-改-写，避免并发覆盖丢更新）。 */
  writeQueues = /* @__PURE__ */ new Map();
  /**
   * 按 key（通常是 workflowId 或工作目录）串行执行写操作。
   * 前一个任务无论成功失败，后面的都会接着跑；返回本次任务的真实结果。
   */
  serial(key, task) {
    const previous = this.writeQueues.get(key) ?? Promise.resolve();
    const current = previous.then(task, task);
    this.writeQueues.set(key, current.catch(() => {
    }));
    return current;
  }
  /** 列出所有 workflow 工作区，按最后修改时间倒序。单个损坏文件跳过，不影响整体。 */
  async list() {
    const dir = join(this.baseDir, "workflows");
    let names = [];
    try {
      names = await fs2.readdir(dir);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const items = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -".json".length);
      try {
        const snapshot = await this.storage.load(id);
        if (snapshot === null) continue;
        const stat = await fs2.stat(join(dir, name));
        items.push({
          id,
          title: snapshot.title,
          path: snapshot.working_directory ?? null,
          ...snapshot.host_workspace_id === void 0 ? {} : { workspaceId: snapshot.host_workspace_id },
          pinned: snapshot.pinned === true,
          updatedAt: stat.mtime.toISOString()
        });
      } catch {
      }
    }
    items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return items;
  }
  /** 新建一个 workflow 工作区：自动建根节点，标题缺省用目录名。 */
  async create(input) {
    const id = randomUUID2();
    const trimmedTitle = input.title?.trim() ?? "";
    const title = trimmedTitle !== "" ? trimmedTitle : basename(input.path);
    const hostWorkspaceId = typeof input.hostWorkspaceId === "string" && input.hostWorkspaceId !== "" ? input.hostWorkspaceId : void 0;
    const snapshot = {
      version: 2,
      workspace_id: id,
      title,
      working_directory: input.path,
      ...hostWorkspaceId === void 0 ? {} : { host_workspace_id: hostWorkspaceId },
      settings: DEFAULT_SETTINGS,
      nodes: [buildRootNode(id, DEFAULT_SETTINGS.default_max_depth, DEFAULT_SETTINGS.default_max_steps)]
    };
    await this.storage.save(snapshot);
    await this.ensureGlobalManual(input.path);
    return {
      id,
      title,
      path: input.path,
      ...hostWorkspaceId === void 0 ? {} : { workspaceId: hostWorkspaceId },
      pinned: false,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async get(id) {
    return this.storage.load(id);
  }
  /** 读取某个 workflow 的全局操作细节（A + B/C/D）。 */
  async getGlobalOperationDetail(id) {
    const snapshot = await this.storage.load(id);
    return snapshot === null ? null : snapshot.settings.global_operation_detail;
  }
  /** 存档目录：一份存档 = 一个 json 文件；内置「默认存档」来自代码常量，不落盘。 */
  profilesDir() {
    return join(this.baseDir, "exports");
  }
  /** 当前生效存档的指针：只存一个名字，存在 <settingsDir>/global-settings.json。 */
  activePointerPath() {
    return join(this.settingsDir, "global-settings.json");
  }
  /** 存档名 → 文件名：去掉路径分隔符等非法字符并限长，防止写到目录外。 */
  profileFileName(name) {
    const safe = name.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/^\.+/, "").slice(0, 40);
    if (safe === "" || safe === BUILTIN_PROFILE_NAME) throw new Error(`\u5B58\u6863\u540D\u4E0D\u53EF\u7528\uFF1A${name}`);
    return `${safe}.json`;
  }
  /** 列出存档名（不含内置存档；读不出来的文件跳过，不让坏文件阻塞设置页）。 */
  async listProfileNames() {
    let entries = [];
    try {
      entries = await fs2.readdir(this.profilesDir());
    } catch {
      return [];
    }
    const names = [];
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith(".json")) continue;
      const name = entry.slice(0, -".json".length);
      if (name === BUILTIN_PROFILE_NAME) continue;
      try {
        const raw = JSON.parse(await fs2.readFile(join(this.profilesDir(), entry), "utf8"));
        GlobalOperationDetail.parse(raw?.detail ?? raw);
        names.push(name);
      } catch {
      }
    }
    return names.sort();
  }
  /** 当前生效存档名；指针失效时回到内置存档。 */
  async activeProfileName(names) {
    try {
      const raw = JSON.parse(await fs2.readFile(this.activePointerPath(), "utf8"));
      const active = typeof raw?.active === "string" ? raw.active : BUILTIN_PROFILE_NAME;
      if (active === BUILTIN_PROFILE_NAME) return active;
      return names.includes(active) ? active : BUILTIN_PROFILE_NAME;
    } catch {
      return BUILTIN_PROFILE_NAME;
    }
  }
  async writeActivePointer(name) {
    await fs2.mkdir(this.baseDir, { recursive: true });
    const target = this.activePointerPath();
    const tmp = `${target}.tmp`;
    await fs2.writeFile(tmp, `${JSON.stringify({ active: name }, null, 2)}
`, "utf8");
    await fs2.rename(tmp, target);
  }
  async writeProfileFile(name, detail) {
    await fs2.mkdir(this.profilesDir(), { recursive: true });
    const target = join(this.profilesDir(), this.profileFileName(name));
    const tmp = `${target}.tmp`;
    await fs2.writeFile(tmp, `${JSON.stringify({ kind: "dsh-gated-workflow/operation-detail", version: 1, name, detail }, null, 2)}
`, "utf8");
    await fs2.rename(tmp, target);
  }
  async readProfileFile(name) {
    const raw = JSON.parse(await fs2.readFile(join(this.profilesDir(), this.profileFileName(name)), "utf8"));
    return GlobalOperationDetail.parse(raw?.detail ?? raw);
  }
  /**
   * 一次性迁移：旧的 `{ active, profiles }` 或更早的扁平 A/B/C/D，都拆成"一份存档一个文件"。
   * 只在指针文件还是旧格式时动手，迁完就只剩 `{ active }`。
   */
  async migrateLegacySettings() {
    let raw;
    try {
      raw = JSON.parse(await fs2.readFile(this.activePointerPath(), "utf8"));
    } catch {
      return;
    }
    if (raw === null || typeof raw !== "object") return;
    const hasProfiles = raw.profiles !== null && typeof raw.profiles === "object";
    const isFlat = typeof raw.shared_detail === "string";
    if (!hasProfiles && !isFlat) return;
    const entries = hasProfiles ? Object.entries(raw.profiles) : [[MIGRATED_PROFILE_NAME, raw]];
    for (const [name, value] of entries) {
      if (name === BUILTIN_PROFILE_NAME) continue;
      const parsed = GlobalOperationDetail.safeParse(value);
      if (!parsed.success) continue;
      try {
        await this.writeProfileFile(name, parsed.data);
      } catch {
      }
    }
    const active = typeof raw.active === "string" ? raw.active : MIGRATED_PROFILE_NAME;
    await this.writeActivePointer(active);
  }
  /** 存档列表：内置存档永远排第一，其余按文件名排序。 */
  async listProfiles() {
    await this.migrateLegacySettings();
    const names = await this.listProfileNames();
    return { active: await this.activeProfileName(names), names: [BUILTIN_PROFILE_NAME, ...names] };
  }
  /** 当前生效的操作细节：内置存档来自代码常量，其余读对应的 json 文件。 */
  async getAppGlobalOperationDetail() {
    const { active } = await this.listProfiles();
    if (active === BUILTIN_PROFILE_NAME) return DEFAULT_GLOBAL_OPERATION_DETAIL;
    try {
      return await this.readProfileFile(active);
    } catch {
      return DEFAULT_GLOBAL_OPERATION_DETAIL;
    }
  }
  /** 保存当前生效的存档。内置存档只读，改它会被拒绝。 */
  async updateAppGlobalOperationDetail(raw) {
    const { active } = await this.listProfiles();
    if (active === BUILTIN_PROFILE_NAME) {
      throw new Error(`\u300C${BUILTIN_PROFILE_NAME}\u300D\u968F\u63D2\u4EF6\u63D0\u4F9B\u3001\u4E0D\u53EF\u4FEE\u6539\uFF1B\u8BF7\u5148\u300C\u53E6\u5B58\u4E3A\u300D\u4E00\u4EFD\u81EA\u5DF1\u7684\u5B58\u6863`);
    }
    const parsed = GlobalOperationDetail.parse(raw);
    await this.writeProfileFile(active, parsed);
    return parsed;
  }
  /** 新建/覆盖一份用户存档（内置存档名不可用）。detail 省略时复制当前生效的那份。 */
  async saveProfile(name, raw) {
    const trimmed = name.trim();
    if (trimmed === BUILTIN_PROFILE_NAME) throw new Error(`\u300C${BUILTIN_PROFILE_NAME}\u300D\u662F\u5185\u7F6E\u53EA\u8BFB\u5B58\u6863\uFF0C\u6362\u4E00\u4E2A\u540D\u5B57`);
    this.profileFileName(trimmed);
    const detail = raw === void 0 ? await this.getAppGlobalOperationDetail() : GlobalOperationDetail.parse(raw);
    await this.writeProfileFile(trimmed, detail);
    await this.writeActivePointer(trimmed);
    return this.listProfiles();
  }
  async activateProfile(name) {
    const names = await this.listProfileNames();
    if (name !== BUILTIN_PROFILE_NAME && !names.includes(name)) throw new Error(`\u6CA1\u6709\u540D\u4E3A\u300C${name}\u300D\u7684\u5B58\u6863`);
    await this.writeActivePointer(name);
    return this.listProfiles();
  }
  /** 删除存档：文件移进 exports/trash/（不直接删，误删可捞回来）。 */
  async deleteProfile(name) {
    if (name === BUILTIN_PROFILE_NAME) throw new Error(`\u300C${BUILTIN_PROFILE_NAME}\u300D\u662F\u5185\u7F6E\u53EA\u8BFB\u5B58\u6863\uFF0C\u4E0D\u80FD\u5220\u9664`);
    const names = await this.listProfileNames();
    if (!names.includes(name)) throw new Error(`\u6CA1\u6709\u540D\u4E3A\u300C${name}\u300D\u7684\u5B58\u6863`);
    const source = join(this.profilesDir(), this.profileFileName(name));
    const trash = join(this.profilesDir(), "trash");
    await fs2.mkdir(trash, { recursive: true });
    await fs2.rename(source, join(trash, `${this.profileFileName(name).replace(/\.json$/, "")}-${Date.now()}.json`));
    const active = await this.activeProfileName(await this.listProfileNames());
    if (active === name) await this.writeActivePointer(BUILTIN_PROFILE_NAME);
    return this.listProfiles();
  }
  /** 把当前生效的存档复制一份到存档目录（带时间戳），返回路径。 */
  async exportActiveProfile() {
    const { active } = await this.listProfiles();
    const detail = await this.getAppGlobalOperationDetail();
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const backupDir = join(this.profilesDir(), "backup");
    await fs2.mkdir(backupDir, { recursive: true });
    const target = join(backupDir, `\u64CD\u4F5C\u7EC6\u8282-${active}-${stamp}.json`);
    await fs2.writeFile(target, `${JSON.stringify({ kind: "dsh-gated-workflow/operation-detail", version: 1, name: active, detail }, null, 2)}
`, "utf8");
    return { path: target, name: active };
  }
  /**
   * 导入一份存档：接受 `{ name, detail }` 包装，或直接一份 A/B/C/D。
   * @returns 导入后的存档名与列表（不自动切换，避免导入即改全局行为）。
   */
  async importProfile(name, json) {
    let raw;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new Error("\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A\u8BF7\u7C98\u8D34\u5BFC\u51FA\u7684\u6587\u4EF6\u5185\u5BB9");
    }
    const detail = GlobalOperationDetail.parse(raw?.detail ?? raw);
    const trimmed = name.trim() !== "" ? name.trim() : typeof raw?.name === "string" ? raw.name : "\u5BFC\u5165\u7684\u5B58\u6863";
    if (trimmed === BUILTIN_PROFILE_NAME) throw new Error(`\u300C${BUILTIN_PROFILE_NAME}\u300D\u662F\u5185\u7F6E\u53EA\u8BFB\u5B58\u6863\uFF0C\u6362\u4E00\u4E2A\u540D\u5B57\u518D\u5BFC\u5165`);
    await this.writeProfileFile(trimmed, detail);
    const { names } = await this.listProfiles();
    return { imported: trimmed, names };
  }
  /** 覆盖某个 workflow 的全局操作细节（A + B/C/D），用 zod 校验后落盘。 */
  async updateGlobalOperationDetail(id, raw) {
    const snapshot = await this.storage.load(id);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    const parsed = GlobalOperationDetail.parse(raw);
    const updated = {
      ...snapshot,
      settings: { ...snapshot.settings, global_operation_detail: parsed }
    };
    await this.storage.save(updated);
    return parsed;
  }
  /**
   * 设置节点级「附加说明」（纯增量，不覆盖全局）。
   * 传空串 = 删除该状态的附加说明；三个都空则把字段整个去掉。
   */
  async setNodeNote(input) {
    return this.serial(input.id, async () => {
      const snapshot = await this.storage.load(input.id);
      if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
      const state = input.state;
      if (!["global", "discussing", "implementing", "verifying"].includes(state)) throw new Error("\u975E\u6CD5\u72B6\u6001");
      const exists3 = snapshot.nodes.some((node) => node.node_id === input.nodeId);
      if (!exists3) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
      const text = input.text.trim();
      const updated = {
        ...snapshot,
        nodes: snapshot.nodes.map((node) => {
          if (node.node_id !== input.nodeId) return node;
          const next = { ...node.additional_detail ?? {} };
          if (text === "") delete next[state];
          else next[state] = text;
          const hasAny = Object.keys(next).length > 0;
          const { additional_detail: _previous, ...rest } = node;
          return hasAny ? { ...rest, additional_detail: next } : rest;
        })
      };
      await this.storage.save(updated);
      return updated;
    });
  }
  /**
   * 按绑定的会话 id 反查节点（输入框旁的状态徽标用）。
   * workflow 数量很少，逐个文件扫一遍足够；单文件损坏就跳过。
   */
  async findBySession(sessionId) {
    const dir = join(this.baseDir, "workflows");
    let names = [];
    try {
      names = await fs2.readdir(dir);
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -".json".length);
      try {
        const snapshot = await this.storage.load(id);
        if (snapshot === null) continue;
        const node = snapshot.nodes.find((candidate) => candidate.session_id === sessionId);
        if (node !== void 0) {
          return {
            workflowId: id,
            nodeId: node.node_id,
            title: node.title ?? "",
            current_state: node.current_state
          };
        }
      } catch {
      }
    }
    return null;
  }
  /**
   * 删除整份 workflow 快照（宿主工作区被删除时同步清理，避免留下孤儿行）。
   * **不真删**：移到 workflows-trash/<id>.<时间戳>.json，便于误删后恢复。
   */
  async remove(id) {
    const source = join(this.baseDir, "workflows", `${id}.json`);
    const trashDir = join(this.baseDir, "workflows-trash");
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    try {
      await fs2.mkdir(trashDir, { recursive: true });
      await fs2.rename(source, join(trashDir, `${id}.${stamp}.json`));
      return;
    } catch (error) {
      if (error.code === "ENOENT") return;
      try {
        await fs2.unlink(source);
      } catch (unlinkError) {
        if (unlinkError.code === "ENOENT") return;
        throw unlinkError;
      }
    }
  }
  /** 列出回收站里的快照（按文件名倒序 = 最近删除优先）。 */
  async listTrash() {
    const trashDir = join(this.baseDir, "workflows-trash");
    let names = [];
    try {
      names = await fs2.readdir(trashDir);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    return names.filter((name) => name.endsWith(".json")).sort().reverse().map((name) => {
      const match = /^(.+)\.(\d{4}-\d{2}-\d{2}T[^.]+)\.json$/.exec(name);
      return {
        id: match?.[1] ?? name.slice(0, -".json".length),
        file: name,
        deletedAt: match?.[2] ?? ""
      };
    });
  }
  /**
   * 从回收站恢复（取该 id 最近一次删除的那份）。
   * 已存在同名快照时不覆盖，直接返回 false。
   */
  async restoreFromTrash(id) {
    const trashDir = join(this.baseDir, "workflows-trash");
    const target = join(this.baseDir, "workflows", `${id}.json`);
    try {
      await fs2.access(target);
      return false;
    } catch {
    }
    let names = [];
    try {
      names = await fs2.readdir(trashDir);
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
    const newest = names.filter((name) => name.startsWith(`${id}.`) && name.endsWith(".json")).sort().reverse()[0];
    if (newest === void 0) return false;
    await fs2.mkdir(join(this.baseDir, "workflows"), { recursive: true });
    await fs2.rename(join(trashDir, newest), target);
    return true;
  }
  /**
   * 把宿主目录工作区 id 写回快照（一次性迁移用：旧快照只有 working_directory）。
   * 已写过就不重复写；传空串等于清空。
   */
  async linkWorkspace(input) {
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    const hostWorkspaceId = input.hostWorkspaceId.trim();
    const updated = hostWorkspaceId === "" ? (() => {
      const { host_workspace_id: _removed, ...rest } = snapshot;
      return rest;
    })() : { ...snapshot, host_workspace_id: hostWorkspaceId };
    await this.storage.save(updated);
    return updated;
  }
  /** 置顶 / 取消置顶（只影响侧栏排序，不碰宿主的工作区置顶集合）。 */
  async setPinned(input) {
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    const updated = { ...snapshot, pinned: input.pinned === true };
    await this.storage.save(updated);
    return updated;
  }
  /** 把某个节点推进到下一状态；附状态迁移时间线（history）。 */
  async transitionNode(input) {
    return this.serial(input.id, async () => {
      const snapshot = await this.storage.load(input.id);
      if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
      const validStates = ["discussing", "implementing", "verifying", "completed"];
      if (!validStates.includes(input.to)) throw new Error("\u975E\u6CD5\u72B6\u6001");
      const node = snapshot.nodes.find((candidate) => candidate.node_id === input.nodeId);
      if (node === void 0) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
      const from = node.current_state;
      const nextVerification = input.to === "verifying" ? createVerification((node.verification?.round ?? 0) + 1) : void 0;
      if (input.to === "discussing" && from !== "discussing") {
        await this.clearChecklistOnReturnToDiscussion(snapshot, input.nodeId);
      }
      if (input.to === "implementing" && from === "completed") {
        await this.resetChecklistToUnchecked(snapshot, input.nodeId);
      }
      const updated = {
        ...snapshot,
        nodes: snapshot.nodes.map(
          (candidate) => candidate.node_id === input.nodeId ? {
            ...candidate,
            current_state: input.to,
            ...nextVerification === void 0 ? {} : { verification: nextVerification },
            history: [...candidate.history ?? [], {
              at: (/* @__PURE__ */ new Date()).toISOString(),
              from,
              to: input.to,
              ...typeof input.by === "string" && input.by !== "" ? { by: input.by } : {}
            }]
          } : candidate
        )
      };
      await this.storage.save(updated);
      return updated;
    });
  }
  /**
   * 切回讨论中时清空会话手册的「实施顺序」：保留「方案」与小节标题，只清条目。
   *
   * 不走 replaceManualSection：那条路径带字数闸门，手册本来就超限时会反过来挡住状态切换。
   * 没有手册文件 / 老手册没有这一节时直接跳过（等于本来就没有清单可清）。
   */
  async clearChecklistOnReturnToDiscussion(snapshot, nodeId) {
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== "string" || workingDir === "") return;
    const file = join(workingDir, WORKFLOW_SUBDIR, sessionManualFileName(nodeId));
    let current;
    try {
      current = await fs2.readFile(file, "utf8");
    } catch {
      return;
    }
    let next;
    try {
      next = replaceSectionBody(current, "\u5B9E\u65BD\u987A\u5E8F", "", []);
    } catch {
      return;
    }
    try {
      await writeTextAtomic(file, next);
    } catch (error) {
      throw new Error(`\u5207\u56DE\u300C\u8BA8\u8BBA\u4E2D\u300D\u65F6\u8981\u6E05\u7A7A\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\uFF0C\u4F46\u4F1A\u8BDD\u624B\u518C\u5199\u5165\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
    }
    this.manualMetaCache.delete(`${snapshot.workspace_id}:${nodeId}`);
  }
  /**
   * 返工回「实现中」时把「实施顺序」里的勾选复位成未勾、清掉行尾证据，但保留条目本身。
   * 与 clearChecklistOnReturnToDiscussion（清空条目）不同：实现中不能重定义清单，只能勾选，
   * 所以这里必须保留条目文字，只把勾选状态打回。
   */
  async resetChecklistToUnchecked(snapshot, nodeId) {
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== "string" || workingDir === "") return;
    const file = join(workingDir, WORKFLOW_SUBDIR, sessionManualFileName(nodeId));
    let current;
    try {
      current = await fs2.readFile(file, "utf8");
    } catch {
      return;
    }
    const lines = current.split(/\r?\n/);
    let inSection = false;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line === void 0) continue;
      if (line.trim() === "## \u5B9E\u65BD\u987A\u5E8F") {
        inSection = true;
        continue;
      }
      if (inSection && line.startsWith("## ")) break;
      if (!inSection) continue;
      const match = /^(\s*-\s+\[)([ xX])(\]\s*)(.+)$/.exec(line);
      if (match === null || match[4] === void 0) continue;
      const parsed = parseChecklistLine(match[4].trim());
      const scopeSuffix = parsed.scope.length > 0 ? `${CHECK_SCOPE_MARK}${parsed.scope.join(",")}` : "";
      lines[index] = `${match[1] ?? ""} ${match[3] ?? ""}${parsed.label}${scopeSuffix}`;
    }
    const next = lines.join("\n");
    try {
      await writeTextAtomic(file, next);
    } catch (error) {
      throw new Error(`\u8FD4\u5DE5\u56DE\u300C\u5B9E\u73B0\u4E2D\u300D\u8981\u590D\u4F4D\u5B9E\u65BD\u6E05\u5355\u52FE\u9009\uFF0C\u4F46\u4F1A\u8BDD\u624B\u518C\u5199\u5165\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
    }
    this.manualMetaCache.delete(`${snapshot.workspace_id}:${nodeId}`);
  }
  /**
   * 把节点绑定到一个 dsh 会话（点节点时打开）。
   * 传空字符串表示解绑；只改我们自己的快照，不碰宿主的会话存储。
   */
  async bindSession(input) {
    const snapshot = await this.storage.load(input.id);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    if (typeof input.sessionId !== "string") throw new Error("\u7F3A\u5C11 sessionId");
    const exists3 = snapshot.nodes.some((node) => node.node_id === input.nodeId);
    if (!exists3) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
    const sessionId = input.sessionId.trim();
    const updated = {
      ...snapshot,
      nodes: snapshot.nodes.map((node) => {
        if (node.node_id !== input.nodeId) return node;
        if (sessionId === "") {
          const { session_id: _removed, ...rest } = node;
          return rest;
        }
        return { ...node, session_id: sessionId };
      })
    };
    await this.storage.save(updated);
    return updated;
  }
  /** 按工作目录反查 workflow 快照。 */
  async findByWorkingDirectory(workingDirectory, onBroken) {
    const dir = join(this.baseDir, "workflows");
    let names = [];
    try {
      names = await fs2.readdir(dir);
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -".json".length);
      try {
        const snapshot = await this.storage.load(id);
        if (snapshot !== null && snapshot.working_directory === workingDirectory) return snapshot;
      } catch (error) {
        onBroken?.(name, error);
      }
    }
    return null;
  }
  /** 侧栏批量用：返回某工作区所有会话节点的状态映射（sessionId → current_state）。 */
  async getNodeStatesByDirectory(workingDirectory, onBroken) {
    const snapshot = await this.findByWorkingDirectory(workingDirectory, onBroken);
    if (snapshot === null) return {};
    const map = {};
    for (const node of snapshot.nodes) {
      if (typeof node.session_id === "string" && node.session_id !== "") {
        map[node.session_id] = node.current_state;
      }
    }
    return map;
  }
  /**
   * 侧栏全量用：一次汇总所有工作区里已绑定会话的状态（sessionId → current_state）。
   *
   * 状态点的显示只认「节点绑过哪个会话」这条持久化事实，不读宿主内存里的预设名单：
   * 名单是进程内的，重启后为空，会让重启前的会话全部丢掉状态点。
   * 坏了 / 读不出来的快照直接跳过，不影响其他工作区；跳过时通过 onBroken 留痕。
   */
  async getAllNodeStates(onBroken) {
    const dir = join(this.baseDir, "workflows");
    let names = [];
    try {
      names = await fs2.readdir(dir);
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
    const map = {};
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -".json".length);
      try {
        const snapshot = await this.storage.load(id);
        if (snapshot === null) continue;
        for (const node of snapshot.nodes) {
          if (typeof node.session_id === "string" && node.session_id !== "") {
            map[node.session_id] = node.current_state;
          }
        }
      } catch (error) {
        onBroken?.(name, error);
      }
    }
    return map;
  }
  /** 确保工作区根目录有项目手册（项目总览 / 决策 / 要点）。 */
  async ensureGlobalManual(workingDirectory) {
    if (typeof workingDirectory !== "string" || workingDirectory === "") return;
    const wfDir = join(workingDirectory, WORKFLOW_SUBDIR);
    await fs2.mkdir(wfDir, { recursive: true });
    await writeIfMissing(join(wfDir, globalManualFileName()), GLOBAL_MANUAL_TEMPLATE);
    await appendGitignore(workingDirectory);
  }
  /** 确保某目录是一个 workflow 工作区（没有快照就建，含根节点），返回快照。 */
  async ensureWorkflow(workingDirectory, title) {
    const existing = await this.findByWorkingDirectory(workingDirectory);
    if (existing !== null) return existing;
    const id = randomUUID2();
    const snapshot = {
      version: 2,
      workspace_id: id,
      title: title !== "" ? title : basename(workingDirectory),
      working_directory: workingDirectory,
      settings: DEFAULT_SETTINGS,
      nodes: [buildRootNode(id, DEFAULT_SETTINGS.default_max_depth, DEFAULT_SETTINGS.default_max_steps)]
    };
    await this.storage.save(snapshot);
    await this.ensureGlobalManual(workingDirectory);
    return snapshot;
  }
  /**
   * 自动认领：确保某会话已经是 workflow 节点（没有就建），返回节点摘要。
   * 会话所属工作区 = workingDirectory；工作区还不是 workflow 就顺带建快照 + 项目手册。
   */
  async ensureNode(input) {
    const workingDirectory = input.workingDirectory.trim();
    if (workingDirectory === "") throw new Error("\u7F3A\u5C11\u5DE5\u4F5C\u76EE\u5F55");
    return this.serial(`dir:${workingDirectory}`, async () => {
      const snapshot = await this.ensureWorkflow(workingDirectory, "");
      const existing = snapshot.nodes.find((node) => node.session_id === input.sessionId);
      if (existing !== void 0) {
        return {
          workflowId: snapshot.workspace_id,
          nodeId: existing.node_id,
          title: existing.title ?? "",
          current_state: existing.current_state
        };
      }
      const nodeId = randomUUID2();
      const title = "\u65B0\u4F1A\u8BDD";
      const wfDir = join(workingDirectory, WORKFLOW_SUBDIR);
      await fs2.mkdir(wfDir, { recursive: true });
      await writeIfMissing(join(wfDir, sessionManualFileName(nodeId)), SESSION_MANUAL_TEMPLATE);
      const child = {
        ...buildRootNode(nodeId, DEFAULT_SETTINGS.default_max_depth, DEFAULT_SETTINGS.default_max_steps),
        parent_id: null,
        title,
        node_type: "task",
        session_id: input.sessionId,
        depth: 0,
        // 新会话直接进「讨论中」：状态机里已经没有"未开始"这一态，也就没有"自动迁移"这条记录。
        current_state: "discussing"
      };
      const updated = { ...snapshot, nodes: [...snapshot.nodes, child] };
      await this.storage.save(updated);
      return { workflowId: snapshot.workspace_id, nodeId, title, current_state: child.current_state };
    });
  }
  /** 读会话手册全文 + 实施清单（供只读 UI 展示）；notesDir 指向 .workflow 根目录。 */
  async readNodeManual(workflowId, nodeId) {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) return null;
    const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
    if (node === void 0) return null;
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== "string" || workingDir === "") return null;
    const wfDir = join(workingDir, WORKFLOW_SUBDIR);
    const manual = await readTextCapped(join(wfDir, sessionManualFileName(nodeId)), MANUAL_MAX_BYTES);
    return { manual, notesDir: wfDir, checklist: parseChecklist(manual) };
  }
  /** 会话手册模板原文（方案五小节 + 实施顺序清单）：设置页「附表」按它现读，不另存第二份。 */
  async readSessionManualTemplate() {
    return SESSION_MANUAL_TEMPLATE;
  }
  /** 读工作区项目手册（项目总览 / 决策 / 要点）。 */
  async readGlobalManual(workflowId) {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) return "";
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== "string" || workingDir === "") return "";
    return readTextCapped(join(workingDir, WORKFLOW_SUBDIR, globalManualFileName()), GLOBAL_MANUAL_MAX_BYTES);
  }
  /** 项目手册的绝对路径（只读用途：注入里那句「去哪查」要用它，不能只给相对名）。 */
  async globalManualPath(workflowId) {
    const snapshot = await this.storage.load(workflowId);
    const workingDir = snapshot?.working_directory;
    if (typeof workingDir !== "string" || workingDir === "") return null;
    return join(workingDir, WORKFLOW_SUBDIR, globalManualFileName());
  }
  /**
   * 轻量取「实施清单 + 方案是否已写」：会话输入区每 3s 轮询用，带 mtime 缓存，
   * 文件没变就不重新读盘/解析。
   */
  async getManualMeta(workflowId, nodeId) {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) return null;
    const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
    if (node === void 0) return null;
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== "string" || workingDir === "") return null;
    const file = join(workingDir, WORKFLOW_SUBDIR, sessionManualFileName(nodeId));
    let mtimeMs = 0;
    try {
      mtimeMs = (await fs2.stat(file)).mtimeMs;
    } catch {
    }
    const key = `${workflowId}:${nodeId}`;
    const cached = this.manualMetaCache.get(key);
    if (cached !== void 0 && cached.mtimeMs === mtimeMs) {
      return { checklist: cached.checklist, hasPlan: cached.hasPlan };
    }
    const manual = await readTextCapped(file, MANUAL_MAX_BYTES);
    const meta = { mtimeMs, checklist: parseChecklist(manual), hasPlan: parseHasPlan(manual) };
    this.manualMetaCache.set(key, meta);
    return { checklist: meta.checklist, hasPlan: meta.hasPlan };
  }
  /**
   * 取当前节点实施清单声明的范围（去重后的相对路径数组 + 工作目录）。
   * 没声明范围时 scope 为空数组——调用方据此决定「要不要做范围拦截」（空 = 不拦）。
   */
  async getChecklistScope(workflowId, nodeId) {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) return null;
    const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
    if (node === void 0) return null;
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== "string" || workingDir === "") return null;
    const manual = await this.readNodeManual(workflowId, nodeId);
    const scope = collectChecklistScope(manual?.checklist ?? []);
    for (const path2 of parseScopeAppends(manual?.manual ?? "")) {
      if (!scope.includes(path2)) scope.push(path2);
    }
    return { workingDir, scope };
  }
  /**
   * 实现中追加范围（append-only + 留痕）：把新路径写进会话手册「范围追加」小节，带 reason。
   * 只能加、不能删缩；方案 / 实施顺序仍锁定，只有「范围」这一栏可在实现中扩大——
   * 让「被范围门禁误拦」的修正成本从「返工回讨论中」降到「一次追加」。
   */
  async extendSessionScope(input) {
    const reason = input.reason.trim();
    if (reason === "") throw new Error("\u8FFD\u52A0\u8303\u56F4\u5FC5\u987B\u5E26 reason\uFF1A\u8BF4\u660E\u4E3A\u4EC0\u4E48\u8FD8\u8981\u78B0\u8FD9\u4E9B\u8DEF\u5F84");
    const paths = [];
    for (const raw of input.paths) {
      const path2 = normalizeScopePath(raw);
      if (!paths.includes(path2)) paths.push(path2);
    }
    if (paths.length === 0) throw new Error("paths \u4E0D\u80FD\u4E3A\u7A7A\uFF1A\u7ED9\u81F3\u5C11\u4E00\u4E2A\u8981\u8FFD\u52A0\u7684\u76F8\u5BF9\u8DEF\u5F84 / \u76EE\u5F55");
    const { file } = await this.resolveManualFile(input.workflowId, input.nodeId);
    const current = await this.readFileOrTemplate(file, true);
    const body = pickSectionBody(current, [SCOPE_APPEND_SECTION]);
    const lines = body.trim() === "" ? [] : body.split(/\r?\n/);
    const appended = [];
    for (const path2 of paths) {
      lines.push(`- ${path2}${SCOPE_REASON_MARK}${reason}`);
      appended.push(path2);
    }
    const next = this.upsertSection(current, SCOPE_APPEND_SECTION, lines.join("\n"));
    await writeTextAtomic(file, next);
    this.manualMetaCache.delete(`${input.workflowId}:${input.nodeId}`);
    const meta = await this.getManualMeta(input.workflowId, input.nodeId);
    const scope = collectChecklistScope(meta?.checklist ?? []);
    for (const path2 of parseScopeAppends(next)) {
      if (!scope.includes(path2)) scope.push(path2);
    }
    return { scope, appended };
  }
  /**
   * 应用级设置：切换状态时是否自动发送默认输入 + 手册字数上限。
   * 存在 <settingsDir>/app-settings.json。
   */
  appSettingsPath() {
    return join(this.settingsDir, "app-settings.json");
  }
  async getAppSettings() {
    try {
      const raw = JSON.parse(await fs2.readFile(this.appSettingsPath(), "utf8"));
      return {
        autoSendEnterTrigger: raw?.autoSendEnterTrigger === true,
        manualLimits: sanitizeManualLimits(raw?.manualLimits)
      };
    } catch {
      return { autoSendEnterTrigger: false, manualLimits: DEFAULT_MANUAL_LIMITS };
    }
  }
  async updateAppSettings(patch) {
    const current = await this.getAppSettings();
    const next = {
      autoSendEnterTrigger: patch.autoSendEnterTrigger === void 0 ? current.autoSendEnterTrigger : patch.autoSendEnterTrigger === true,
      manualLimits: patch.manualLimits === void 0 ? current.manualLimits : sanitizeManualLimits(patch.manualLimits)
    };
    await fs2.mkdir(this.baseDir, { recursive: true });
    const target = this.appSettingsPath();
    const tmp = `${target}.tmp`;
    await fs2.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
    await fs2.rename(tmp, target);
    return next;
  }
  /**
   * 读项目手册并按四类内容拆开，供注入按优先级取用。
   * 旧标题「要点 / 疑难杂症」也算「坑与防线」。
   */
  async readGlobalManualSections(workflowId) {
    const manual = await this.readGlobalManual(workflowId);
    const sections = splitManualSections(manual);
    const pick = (prefixes) => stripHtmlComments(sections.find((section) => prefixes.some((prefix) => section.title.startsWith(prefix)))?.body ?? "");
    return {
      overview: pick(["\u9879\u76EE\u603B\u89C8"]),
      decisions: pick(["\u51B3\u7B56\u8BB0\u5F55"]),
      constraints: pick(["\u7EA6\u675F"]),
      pitfalls: pick(["\u5751\u4E0E\u9632\u7EBF", "\u8981\u70B9"]),
      tags: parseTagTable(pick([TAG_TABLE_SECTION]))
    };
  }
  // —— 项目手册条目：按条写（每条必须带标签），标签表自动登记 ——
  /** 项目手册四节（标签表不算条目节，它由工具维护）。 */
  projectEntrySections() {
    return ["\u9879\u76EE\u603B\u89C8", "\u51B3\u7B56\u8BB0\u5F55", "\u7EA6\u675F", "\u5751\u4E0E\u9632\u7EBF"];
  }
  /** 读项目手册全文（不存在时用模板）。 */
  async readProjectManual(workflowId) {
    const { file } = await this.resolveManualFile(workflowId, null);
    return { file, manual: await this.readFileOrTemplate(file, false) };
  }
  /** 写回项目手册：先过「约束」一节的字数闸门与整本字节上限，再原子写。 */
  async writeProjectManual(file, manual) {
    const limits = (await this.getAppSettings()).manualLimits;
    assertSectionLimit("\u7EA6\u675F", pickSectionBody(manual, ["\u7EA6\u675F"]), limits);
    const bytes = Buffer.byteLength(manual, "utf8");
    if (bytes > GLOBAL_MANUAL_MAX_BYTES) {
      throw new Error(`\u5199\u5165\u540E\u9879\u76EE\u624B\u518C\u4F1A\u53D8\u6210 ${bytes} \u5B57\u8282\uFF0C\u8D85\u8FC7\u4E0A\u9650 ${GLOBAL_MANUAL_MAX_BYTES} \u5B57\u8282\uFF1B\u8BF7\u7CBE\u7B80\u5185\u5BB9`);
    }
    await writeTextAtomic(file, manual);
  }
  /** 按小节替换，小节不存在就追加（旧手册没有「标签表」时走这条）。 */
  upsertSection(manual, section, body, aliases = []) {
    try {
      return replaceSectionBody(manual, section, body, aliases);
    } catch {
      return appendSection(manual, section, body);
    }
  }
  /** 当前标签表。 */
  async listProjectTags(workflowId) {
    const { manual } = await this.readProjectManual(workflowId);
    return parseTagTable(pickSectionBody(manual, [TAG_TABLE_SECTION]));
  }
  /**
   * 追加一条带标签的条目。标签不在表里就自动登记；表满 30 条时拒写，逼用 rename_tag 合并。
   * @returns 登记后的完整标签表 + 这次新登记的标签 + 实际写入的行
   */
  async appendProjectEntry(input) {
    this.assertEntrySection(input.section);
    const normalized = this.normalizeEntryTags(input.tags, input.section);
    const text = input.content.trim();
    if (text === "") throw new Error("\u6761\u76EE\u6B63\u6587\u4E0D\u80FD\u4E3A\u7A7A");
    const { file, manual } = await this.readProjectManual(input.workflowId);
    const table = parseTagTable(pickSectionBody(manual, [TAG_TABLE_SECTION]));
    const missing = normalized.filter((tag) => !table.includes(tag));
    if (table.length + missing.length > TAG_TABLE_MAX) {
      throw new Error(
        `\u6807\u7B7E\u8868\u5DF2\u7ECF ${table.length} \u6761\uFF0C\u4E0A\u9650 ${TAG_TABLE_MAX} \u6761\uFF1A\u4E0D\u80FD\u518D\u65B0\u589E\u300C${missing.join(" / ")}\u300D\u3002\u5148\u7528 workflow_manual({ action: "rename_tag", from: "\u65E7\u6807\u7B7E", to: "\u8981\u4FDD\u7559\u7684\u6807\u7B7E" } \u5408\u5E76\u540C\u4E49\u6807\u7B7E\uFF1B\u5408\u5E76\u4E0D\u5360\u989D\u5EA6\u3002`
      );
    }
    const aliases = MANUAL_SECTION_ALIASES[input.section] ?? [];
    const body = stripHtmlComments(pickSectionBody(manual, [input.section, ...aliases]));
    const entry = renderEntryLine(normalized, text);
    const nextBody = body.trim() === "" ? entry : `${body.trimEnd()}
${entry}`;
    let next = replaceSectionBody(manual, input.section, nextBody, aliases);
    if (missing.length > 0) {
      next = this.upsertSection(next, TAG_TABLE_SECTION, renderTagTable([...table, ...missing]));
    }
    await this.writeProjectManual(file, next);
    return { tags: [...table, ...missing], registered: missing, entry };
  }
  /** 改写一条条目（按正文精确匹配；匹配到多条就报错，猜错比报错更糟）。 */
  async updateProjectEntry(input) {
    this.assertEntrySection(input.section);
    const normalized = this.normalizeEntryTags(input.tags, input.section);
    const text = input.content.trim();
    if (text === "") throw new Error("\u6761\u76EE\u6B63\u6587\u4E0D\u80FD\u4E3A\u7A7A");
    const { file, manual } = await this.readProjectManual(input.workflowId);
    const aliases = MANUAL_SECTION_ALIASES[input.section] ?? [];
    const body = pickSectionBody(manual, [input.section, ...aliases]);
    const lines = body.split(/\r?\n/);
    const hits = findEntryLineIndexes(body, input.entry);
    const table = parseTagTable(pickSectionBody(manual, [TAG_TABLE_SECTION]));
    const missing = normalized.filter((tag) => !table.includes(tag));
    if (table.length + missing.length > TAG_TABLE_MAX) {
      throw new Error(`\u6807\u7B7E\u8868\u5DF2\u7ECF ${table.length} \u6761\uFF0C\u4E0A\u9650 ${TAG_TABLE_MAX} \u6761\uFF1A\u5148\u5408\u5E76\u518D\u6539\u3002`);
    }
    if (hits.length === 0) {
      throw new Error(`\u300C${input.section}\u300D\u91CC\u6CA1\u6709\u6B63\u6587\u4E3A\u300C${input.entry.trim()}\u300D\u7684\u6761\u76EE\uFF1B\u5148\u7528 read \u52A8\u4F5C\u770B\u4E00\u904D\u3002`);
    }
    if (hits.length > 1) {
      throw new Error(`\u300C${input.section}\u300D\u91CC\u6709 ${hits.length} \u6761\u540C\u6837\u7684\u6761\u76EE\uFF0C\u65E0\u6CD5\u786E\u5B9A\u6539\u54EA\u6761\uFF1B\u5148\u5408\u5E76\u91CD\u590D\u6761\u76EE\u3002`);
    }
    const entry = renderEntryLine(normalized, text);
    lines[hits[0]] = entry;
    let next = this.upsertSection(manual, input.section, lines.join("\n"), aliases);
    if (missing.length > 0) {
      next = this.upsertSection(next, TAG_TABLE_SECTION, renderTagTable([...table, ...missing]));
    }
    await this.writeProjectManual(file, next);
    return { tags: [...table, ...missing], entry };
  }
  /** 删掉一条条目（按正文精确匹配）。 */
  async removeProjectEntry(input) {
    this.assertEntrySection(input.section);
    const { file, manual } = await this.readProjectManual(input.workflowId);
    const aliases = MANUAL_SECTION_ALIASES[input.section] ?? [];
    const body = pickSectionBody(manual, [input.section, ...aliases]);
    const lines = body.split(/\r?\n/);
    const hits = findEntryLineIndexes(body, input.entry);
    if (hits.length === 0) {
      throw new Error(`\u300C${input.section}\u300D\u91CC\u6CA1\u6709\u6B63\u6587\u4E3A\u300C${input.entry.trim()}\u300D\u7684\u6761\u76EE\u3002`);
    }
    if (hits.length > 1) {
      throw new Error(`\u300C${input.section}\u300D\u91CC\u6709 ${hits.length} \u6761\u540C\u6837\u7684\u6761\u76EE\uFF0C\u65E0\u6CD5\u786E\u5B9A\u5220\u54EA\u6761\u3002`);
    }
    const removed = (lines[hits[0]] ?? "").trim();
    lines.splice(hits[0], 1);
    const next = this.upsertSection(manual, input.section, lines.join("\n"), aliases);
    await this.writeProjectManual(file, next);
    return { removed };
  }
  /**
   * 合并 / 重命名标签：级联改写所有条目行里的 from → to，再从标签表删 from。
   * 这条通道不占 30 条额度（只会让表变小或不变），是"表满了还能收拾"的唯一出口。
   */
  async renameProjectTag(input) {
    const from = normalizeTag(input.from);
    const to = normalizeTag(input.to);
    if (from === null) throw new Error(`\u300C${input.from}\u300D\u4E0D\u662F\u5408\u6CD5\u6807\u7B7E\uFF08\u226412 \u5B57\u3001\u4E0D\u542B\u65B9\u62EC\u53F7\u6216\u7AD6\u7EBF\uFF09`);
    if (to === null) throw new Error(`\u300C${input.to}\u300D\u4E0D\u662F\u5408\u6CD5\u6807\u7B7E\uFF08\u226412 \u5B57\u3001\u4E0D\u542B\u65B9\u62EC\u53F7\u6216\u7AD6\u7EBF\uFF09`);
    if (from === to) throw new Error("from \u548C to \u662F\u540C\u4E00\u4E2A\u6807\u7B7E");
    const { file, manual } = await this.readProjectManual(input.workflowId);
    const table = parseTagTable(pickSectionBody(manual, [TAG_TABLE_SECTION]));
    if (!table.includes(from)) {
      throw new Error(`\u6807\u7B7E\u8868\u91CC\u6CA1\u6709\u300C${from}\u300D\uFF1B\u73B0\u6709\uFF1A${table.length === 0 ? "\uFF08\u7A7A\uFF09" : table.join(" / ")}`);
    }
    let next = manual;
    let rewritten = 0;
    for (const section of this.projectEntrySections()) {
      const aliases = MANUAL_SECTION_ALIASES[section] ?? [];
      const body = pickSectionBody(next, [section, ...aliases]);
      if (body.trim() === "") continue;
      const lines = body.split(/\r?\n/).map((line) => {
        const changed = rewriteEntryTag(line, from, to);
        if (changed !== line) rewritten += 1;
        return changed;
      });
      next = replaceSectionBody(next, section, lines.join("\n"), aliases);
    }
    const nextTable = dedupeTags(table.map((tag) => tag === from ? to : tag));
    next = this.upsertSection(next, TAG_TABLE_SECTION, renderTagTable(nextTable));
    await this.writeProjectManual(file, next);
    return { tags: nextTable, rewritten };
  }
  /** 条目只能写进四节；标签表由工具自动维护，不许当条目节用。 */
  assertEntrySection(section) {
    if (!this.projectEntrySections().includes(section)) {
      throw new Error(`\u6761\u76EE\u53EA\u80FD\u5199\u8FDB\u8FD9\u4E9B\u5C0F\u8282\uFF1A${this.projectEntrySections().join(" / ")}\uFF1B\u6807\u7B7E\u8868\u7531\u5DE5\u5177\u81EA\u52A8\u7EF4\u62A4`);
    }
  }
  /** 归一化标签数组：过滤非法、去重；一个都不剩就拒写并列出可用标签。 */
  normalizeEntryTags(tags, section) {
    const raw = Array.isArray(tags) ? tags : [];
    const normalized = [];
    for (const item of raw) {
      const tag = normalizeTag(item);
      if (tag === null) {
        throw new Error(`\u6807\u7B7E\u300C${String(item)}\u300D\u4E0D\u5408\u6CD5\uFF1A\u226412 \u4E2A\u5B57\uFF0C\u4E0D\u80FD\u542B\u65B9\u62EC\u53F7\u6216\u7AD6\u7EBF`);
      }
      normalized.push(tag);
    }
    const unique = dedupeTags(normalized);
    if (unique.length === 0) {
      throw new Error(`\u5F80\u300C${section}\u300D\u5199\u6761\u76EE\u5FC5\u987B\u5E26\u81F3\u5C11\u4E00\u4E2A\u6807\u7B7E\uFF08tags \u6570\u7EC4\uFF09\uFF1B\u6807\u7B7E\u8981\u662F grep \u80FD\u547D\u4E2D\u7684\u8BCD`);
    }
    return unique;
  }
  /**
   * 读手册全文（AI 专用工具的 read 动作）。
   * nodeId 为 null 时读项目手册；否则读该会话的会话手册。
   */
  async readManual(workflowId, nodeId) {
    if (nodeId === null) return this.readGlobalManual(workflowId);
    const manual = await this.readNodeManual(workflowId, nodeId);
    return manual === null ? "" : manual.manual;
  }
  /**
   * 按小节替换手册正文（AI 专用工具的唯一写入口）。
   * 只改指定 `## 小节` 的正文，标题与其它小节原样保留；路径由这里拼，调用方不能指定。
   */
  async replaceManualSection(input) {
    const { file, isSession } = await this.resolveManualFile(input.workflowId, input.nodeId);
    const maxBytes = isSession ? MANUAL_MAX_BYTES : GLOBAL_MANUAL_MAX_BYTES;
    const limits = (await this.getAppSettings()).manualLimits;
    const chars = assertSectionLimit(input.section, input.content, limits);
    const current = await this.readFileOrTemplate(file, isSession);
    if (input.section === "\u65B9\u6848") await this.backupOldPlan(file, current);
    let next;
    try {
      next = replaceSectionBody(current, input.section, input.content, MANUAL_SECTION_ALIASES[input.section] ?? []);
    } catch (error) {
      if (isSession) throw error;
      next = appendSection(current, input.section, input.content);
    }
    const bytes = Buffer.byteLength(next, "utf8");
    if (isSession) assertSessionManualTotal(next, limits);
    if (bytes > maxBytes) {
      throw new Error(`\u5199\u5165\u540E\u624B\u518C\u4F1A\u53D8\u6210 ${bytes} \u5B57\u8282\uFF0C\u8D85\u8FC7\u4E0A\u9650 ${maxBytes} \u5B57\u8282\uFF1B\u8BF7\u7CBE\u7B80\u5185\u5BB9`);
    }
    await writeTextAtomic(file, next);
    this.manualMetaCache.delete(`${input.workflowId}:${input.nodeId ?? ""}`);
    return { bytes, section: input.section, chars };
  }
  /** 覆盖「方案」前把旧方案备份到 `.workflow/backups/方案-<时间戳>.md`（只增不删）。 */
  async backupOldPlan(manualFile, current) {
    const oldPlan = pickSectionBody(current, ["\u65B9\u6848"]);
    if (oldPlan.trim() === "") return;
    const exists3 = await fs2.access(manualFile).then(() => true).catch(() => false);
    if (!exists3) return;
    const dir = join(dirname(manualFile), "backups");
    await fs2.mkdir(dir, { recursive: true });
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    await fs2.writeFile(join(dir, `\u65B9\u6848-${stamp}.md`), `# \u65E7\u65B9\u6848\u5907\u4EFD\uFF08${(/* @__PURE__ */ new Date()).toISOString()}\uFF09

${oldPlan}
`, "utf8");
  }
  /**
   * 勾选 / 取消勾选「实施顺序」里的一条（按条目文字精确匹配，不许新增或改写条目）。
   * @returns 勾选后的完整清单，方便模型确认进度。
   */
  async setChecklistItem(input) {
    const evidence = typeof input.evidence === "string" ? input.evidence.trim() : "";
    if (input.done === true && evidence === "") {
      throw new Error("\u52FE\u9009\u9700\u8981 evidence\uFF1A\u5199\u6E05\u8FD9\u4E00\u5C42\u600E\u4E48\u9A8C\u7684\u3001\u7ED3\u679C\u662F\u4EC0\u4E48\uFF08\u4F8B\uFF1A\u8DD1 node test.mjs\uFF0C12 \u9879\u5168\u8FC7\uFF09\u3002");
    }
    const { file } = await this.resolveManualFile(input.workflowId, input.nodeId);
    const current = await this.readFileOrTemplate(file, true);
    const items = parseChecklist(current);
    if (items.length === 0) throw new Error("\u8FD9\u672C\u624B\u518C\u7684\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\u91CC\u8FD8\u6CA1\u6709\u6761\u76EE\uFF0C\u5148\u7528 workflow_manual \u5199\u5165");
    const target = input.label.trim();
    const match = items.find((item) => item.label === target);
    if (match === void 0) {
      throw new Error(`\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\u91CC\u6CA1\u6709\u300C${target}\u300D\u8FD9\u6761\uFF1B\u53EF\u52FE\u9009\u7684\u6761\u76EE\uFF1A${items.map((item) => item.label).join(" / ")}`);
    }
    const next = toggleChecklistLine(current, target, input.done, evidence);
    await writeTextAtomic(file, next);
    this.manualMetaCache.delete(`${input.workflowId}:${input.nodeId}`);
    return parseChecklist(next);
  }
  /**
   * 读某个节点的验收清单。
   * 旧快照没有 verification 字段时回落到「七项全空」，不做数据迁移。
   */
  async getVerification(workflowId, nodeId) {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
    if (node === void 0) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
    return pickVerification(node.verification);
  }
  /**
   * 跨态失效校验（进「已完结」前）：对每个 required 型且已报 pass 的验收项，找它最近一次
   * check_* 运行时间，若工作目录里还有源码改动发生在该运行之后，判证据过期、要求重跑。
   * 只卡「源码 mtime > 运行时刻」这一种漏法；没有 checker 运行记录的项（旧快照）不卡。
   */
  async assertVerificationFresh(workflowId, nodeId) {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) return;
    const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
    if (node === void 0) return;
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== "string" || workingDir === "") return;
    const verification = pickVerification(node.verification);
    const stamp = await computeSourceStamp(workingDir);
    const staleChecks = [];
    for (const item of verification.items) {
      if (item.mark !== "pass") continue;
      const check = VERIFY_CHECKS.find((candidate) => candidate.id === item.id);
      if (check?.checker?.enforcement !== "required") continue;
      const runs = verification.checker_runs.filter((run) => run.checker_id === check.checker?.id);
      const latest = runs.length > 0 ? runs[runs.length - 1] : void 0;
      if (latest === void 0) continue;
      if (stamp.mtimeMax > Date.parse(latest.at)) {
        staleChecks.push(check.name);
      }
    }
    if (staleChecks.length > 0) {
      throw new Error(
        `\u4EE5\u4E0B\u9A8C\u6536\u9879\u7684\u68C0\u67E5\u5668\u8DD1\u5B8C\u540E\uFF0C\u5DE5\u4F5C\u76EE\u5F55\u91CC\u53C8\u6709\u6E90\u7801\u6539\u52A8\uFF0C\u8BC1\u636E\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u8DD1\u5BF9\u5E94 check_* \u518D\u91CD\u65B0\u62A5\u5907\uFF1A${staleChecks.join(" / ")}`
      );
    }
  }
  /**
   * 把某个节点的验收证据 + 状态时间线 + 检查器运行记录导出成一份 markdown，写回 .workflow/ 下。
   * 「交付」定位要求交付物能出门：这份文件可进 git、可存档，验收不再是只能靠截图。
   */
  async exportVerificationReport(workflowId, nodeId) {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
    if (node === void 0) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== "string" || workingDir === "") throw new Error("\u8BE5 workflow \u6CA1\u6709\u5DE5\u4F5C\u76EE\u5F55\uFF0C\u65E0\u6CD5\u5BFC\u51FA");
    const verification = pickVerification(node.verification);
    const symbol = (mark) => mark === "pass" ? "\u2713" : mark === "deferred" ? "\uFF1F" : "\u25CB";
    const lines = [];
    lines.push(`# \u9A8C\u6536\u62A5\u544A \xB7 ${node.title ?? "\u8282\u70B9"}`);
    lines.push("");
    lines.push(`- \u5BFC\u51FA\u65F6\u95F4\uFF1A${(/* @__PURE__ */ new Date()).toISOString()}`);
    lines.push(`- \u5DE5\u4F5C\u76EE\u5F55\uFF1A${workingDir}`);
    lines.push(`- \u5F53\u524D\u72B6\u6001\uFF1A${node.current_state}`);
    lines.push(`- \u9A8C\u6536\u8F6E\u6B21\uFF1A${verification.round}`);
    lines.push("");
    if ((node.history ?? []).length > 0) {
      lines.push("## \u72B6\u6001\u65F6\u95F4\u7EBF");
      lines.push("");
      for (const entry of node.history ?? []) {
        lines.push(`- ${entry.at.slice(0, 16).replace("T", " ")}\u3000${entry.from} \u2192 ${entry.to}${entry.by ? `\uFF08${entry.by}\uFF09` : ""}`);
      }
      lines.push("");
    }
    lines.push("## \u9A8C\u6536\u4E03\u9879");
    lines.push("");
    for (const item of verification.items) {
      const check = VERIFY_CHECKS.find((candidate) => candidate.id === item.id);
      const report = item.report;
      lines.push(`### ${item.id}. ${check?.name ?? ""} \u2014 ${symbol(item.mark)}`);
      if (report !== null) {
        lines.push("");
        lines.push(`- \u7ED3\u8BBA\uFF1A${report.result === "pass" ? "\u901A\u8FC7" : "\u95EE\u8BE2\uFF08\u672C\u8F6E\u4E0D\u4FEE\uFF09"}`);
        lines.push(`- \u6458\u8981\uFF1A${report.summary}`);
        if (typeof report.command === "string" && report.command !== "") lines.push(`- \u590D\u8DD1\u547D\u4EE4\uFF1A\`${report.command}\``);
        if (report.checker !== void 0) {
          lines.push(`- \u68C0\u67E5\u5668\uFF1A${report.checker.checker_id}\u3000ok=${report.checker.ok}\u3000findings=${report.checker.findings}\u3000exit=${report.checker.exit_code ?? "n/a"}`);
        }
        for (const anchor of report.anchors) lines.push(`- \u951A\u70B9\uFF1A${anchor.file}${anchor.line !== void 0 ? `:${anchor.line}` : ""}`);
        if (Array.isArray(report.findings) && report.findings.length > 0) {
          for (const finding of report.findings) {
            lines.push(`  - \u4F4D\u7F6E ${finding.location}\u3000\u95EE\u9898 ${finding.problem}\u3000\u4E0D\u4FEE\u56E0 ${finding.why_not_fixed}\u3000\u5F71\u54CD ${finding.impact}`);
          }
        }
      }
      lines.push("");
    }
    if (verification.checker_runs.length > 0) {
      lines.push("## \u68C0\u67E5\u5668\u8FD0\u884C\u8BB0\u5F55");
      lines.push("");
      for (const run of verification.checker_runs) {
        lines.push(`- ${run.at.slice(0, 16).replace("T", " ")}\u3000${run.checker_id}\u3000ok=${run.ok}\u3000findings=${run.findings}\u3000exit=${run.exit_code ?? "n/a"}${run.evidence ? `\u3000${run.evidence}` : ""}`);
      }
      lines.push("");
    }
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = `\u9A8C\u6536\u62A5\u544A-${nodeId}-${stamp}.md`;
    const dir = join(workingDir, WORKFLOW_SUBDIR);
    await fs2.mkdir(dir, { recursive: true });
    const path2 = join(dir, name);
    await writeTextAtomic(path2, lines.join("\n"));
    return { path: path2, name };
  }
  /**
   * 记录一次真实检查器运行（随本轮 verification 落盘）。
   *
   * 门禁靠它核对「这一项报 pass 前真的跑过 check_*、且提交的 checker 与真实输出一致」，
   * 所以必须落快照而不是只留在进程内工具账里——宿主一重启工具账就清空，门禁会误伤。
   * 它随 verification 一起在每次进「验收中」时被清掉，上一轮的运行不会带到下一轮。
   */
  async recordCheckerRun(input) {
    await this.serial(input.workflowId, async () => {
      const snapshot = await this.storage.load(input.workflowId);
      if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
      const node = snapshot.nodes.find((candidate) => candidate.node_id === input.nodeId);
      if (node === void 0) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
      const current = pickVerification(node.verification);
      const run = {
        checker_id: input.checkerId,
        ok: input.ok,
        findings: input.findings,
        exit_code: input.exit_code,
        ...typeof input.evidence === "string" && input.evidence !== "" ? { evidence: input.evidence } : {},
        at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const nextState = {
        round: current.round,
        items: current.items,
        checker_runs: [...current.checker_runs, run]
      };
      const updated = {
        ...snapshot,
        nodes: snapshot.nodes.map((candidate) => candidate.node_id === input.nodeId ? { ...candidate, verification: nextState } : candidate)
      };
      await this.storage.save(updated);
    });
  }
  /**
   * 提交一项验收报备：先校验锚点确实落在工作目录里，再落标记。
   *
   * 标记只由这里产生：pass → ✓，deferred → ？。没有这条路径，任何条目都停在 ○。
   */
  async submitVerifyReport(input) {
    return this.serial(input.workflowId, async () => {
      const snapshot = await this.storage.load(input.workflowId);
      if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
      const node = snapshot.nodes.find((candidate) => candidate.node_id === input.nodeId);
      if (node === void 0) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
      if (!VERIFY_CHECKS.some((check) => check.id === input.itemId)) throw new Error(`\u6CA1\u6709 ${input.itemId} \u53F7\u9A8C\u6536\u9879`);
      const workingDir = snapshot.working_directory;
      if (typeof workingDir !== "string" || workingDir === "") {
        throw new Error("\u8BE5 workflow \u6CA1\u6709\u5DE5\u4F5C\u76EE\u5F55\uFF0C\u65E0\u6CD5\u6821\u9A8C\u8BC1\u636E\u951A\u70B9\uFF1B\u5148\u7ED9\u5B83\u6307\u5B9A\u5DE5\u4F5C\u76EE\u5F55");
      }
      await this.assertVerifyAnchors(workingDir, input.report.anchors);
      const current = pickVerification(node.verification);
      const report = { ...input.report, round: current.round, at: (/* @__PURE__ */ new Date()).toISOString() };
      const mark = input.report.result === "pass" ? "pass" : "deferred";
      const nextState = {
        round: current.round,
        items: current.items.map((entry) => entry.id === input.itemId ? { id: entry.id, mark, report } : entry),
        checker_runs: current.checker_runs
      };
      const updated = {
        ...snapshot,
        nodes: snapshot.nodes.map((candidate) => candidate.node_id === input.nodeId ? { ...candidate, verification: nextState } : candidate)
      };
      await this.storage.save(updated);
      const item = nextState.items.find((entry) => entry.id === input.itemId);
      if (item === void 0) throw new Error(`\u6CA1\u80FD\u5199\u56DE ${input.itemId} \u53F7\u9A8C\u6536\u9879`);
      return { state: nextState, item };
    });
  }
  /** 取消一项验收标记：回到 ○，报备一起作废（想再标就得重新报备）。 */
  async cancelVerifyMark(input) {
    return this.serial(input.workflowId, async () => {
      const snapshot = await this.storage.load(input.workflowId);
      if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
      const node = snapshot.nodes.find((candidate) => candidate.node_id === input.nodeId);
      if (node === void 0) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
      const current = pickVerification(node.verification);
      if (!current.items.some((entry) => entry.id === input.itemId)) throw new Error(`\u6CA1\u6709 ${input.itemId} \u53F7\u9A8C\u6536\u9879`);
      const nextState = {
        round: current.round,
        items: current.items.map((entry) => entry.id === input.itemId ? { id: entry.id, mark: "pending", report: null } : entry),
        checker_runs: current.checker_runs
      };
      const updated = {
        ...snapshot,
        nodes: snapshot.nodes.map((candidate) => candidate.node_id === input.nodeId ? { ...candidate, verification: nextState } : candidate)
      };
      await this.storage.save(updated);
      const item = nextState.items.find((entry) => entry.id === input.itemId);
      if (item === void 0) throw new Error(`\u6CA1\u80FD\u5199\u56DE ${input.itemId} \u53F7\u9A8C\u6536\u9879`);
      return { state: nextState, item };
    });
  }
  /** 锚点校验：文件必须真实存在于工作目录内；给了行号就核对行数。 */
  async assertVerifyAnchors(workingDirectory, anchors) {
    const root = resolve(workingDirectory);
    for (const anchor of anchors) {
      const target = resolve(root, anchor.file);
      if (target !== root && !target.startsWith(`${root}${sep}`)) {
        throw new Error(`\u8BC1\u636E\u8DEF\u5F84\u5FC5\u987B\u5728\u672C\u5DE5\u4F5C\u76EE\u5F55\u5185\uFF1A${anchor.file}`);
      }
      let content;
      try {
        content = await fs2.readFile(target, "utf8");
      } catch {
        throw new Error(`\u8BC1\u636E\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${anchor.file}`);
      }
      if (anchor.line !== void 0) {
        const lineCount = content.split(/\r?\n/).length;
        if (anchor.line > lineCount) {
          throw new Error(`\u8BC1\u636E\u884C\u53F7\u8D85\u51FA\u6587\u4EF6\u8303\u56F4\uFF1A${anchor.file}:${anchor.line}\uFF08\u6587\u4EF6\u5171 ${lineCount} \u884C\uFF09`);
        }
      }
    }
  }
  /** 会话/项目手册的绝对路径与"是不是会话手册"。 */
  async resolveManualFile(workflowId, nodeId) {
    const snapshot = await this.storage.load(workflowId);
    if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
    const workingDir = snapshot.working_directory;
    if (typeof workingDir !== "string" || workingDir === "") throw new Error("\u8BE5 workflow \u6CA1\u6709\u5DE5\u4F5C\u76EE\u5F55");
    if (nodeId !== null) {
      const exists3 = snapshot.nodes.some((node) => node.node_id === nodeId);
      if (!exists3) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
    }
    const wfDir = join(workingDir, WORKFLOW_SUBDIR);
    await fs2.mkdir(wfDir, { recursive: true });
    return {
      file: join(wfDir, nodeId === null ? globalManualFileName() : sessionManualFileName(nodeId)),
      isSession: nodeId !== null
    };
  }
  async readFileOrTemplate(file, isSession) {
    try {
      return await fs2.readFile(file, "utf8");
    } catch {
      return isSession ? SESSION_MANUAL_TEMPLATE : GLOBAL_MANUAL_TEMPLATE;
    }
  }
};

// src/host/sidebar-nodes.ts
async function readSidebarNodes(repository, workingDirectory, onBroken) {
  const path2 = typeof workingDirectory === "string" ? workingDirectory.trim() : "";
  if (path2 === "") return repository.getAllNodeStates(onBroken);
  return repository.getNodeStatesByDirectory(path2, onBroken);
}

// src/engine/state-machine.ts
function effectiveDetail(targetState, node, global) {
  const parts = effectiveDetailParts(targetState, node, global);
  const fullDetail = parts.state_detail.trim() === "" ? parts.shared_detail : `${parts.shared_detail}

${parts.state_detail}`;
  return { fullDetail, enter_trigger: parts.enter_trigger };
}
function effectiveDetailParts(targetState, node, global) {
  if (!isActiveState(targetState)) {
    return { shared_detail: global.shared_detail, state_detail: "", enter_trigger: null };
  }
  const target = targetState;
  const slot = global[target];
  const specific = node.state_detail_overrides?.[target] ?? slot;
  return {
    shared_detail: global.shared_detail,
    state_detail: specific.operation_detail,
    enter_trigger: specific.enter_trigger
  };
}

// src/schema/node-state-label.ts
var NODE_STATE_LABEL = {
  discussing: "\u8BA8\u8BBA\u4E2D",
  implementing: "\u5B9E\u73B0\u4E2D",
  verifying: "\u9A8C\u6536\u4E2D",
  completed: "\u5DF2\u5B8C\u7ED3"
};

// src/schema/hard-rules.ts
var DEFAULT_HARD_RULES = {
  discussing: `\uFF08\u6536\u5C3E\uFF09\u8BA8\u8BBA\u9636\u6BB5\u4E0D\u5199\u624B\u518C\u4E5F\u4E0D\u4F1A\u5361\u4F4F\uFF0C\u5199\u4E0D\u5199\u7531\u6211\u51B3\u5B9A\uFF1B\u53EA\u6709\u51C6\u5907\u63A8\u8FDB\u5230\u5B9E\u73B0\u4E2D\u65F6\uFF0C\u624D\u628A\u65B9\u6848\u6309\u300C\u76EE\u6807\u4E0E\u9A8C\u6536 \u2192 \u6570\u636E\u5C42 \u2192 \u9886\u57DF\u5C42 \u2192 \u63A5\u53E3\u5C42 \u2192 \u8868\u73B0\u5C42\u300D\u5199\u8FDB\u672C\u8282\u70B9\u4F1A\u8BDD\u624B\u518C\u7684\u300C\u65B9\u6848\u300D\u5C0F\u8282\uFF08\u6BCF\u5C42\u5199\u6E05\u5C42\u95F4\u5951\u7EA6\uFF09\uFF0C\u5E76\u5728\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\u91CC\u5217\u51FA\u5F85\u529E\u3002\u6BCF\u6761\u5B9E\u65BD\u987A\u5E8F\u5C3D\u91CF\u5E26\u300C \uFF5C \u8303\u56F4\uFF1A\u76EE\u5F551,\u76EE\u5F552\u300D\u58F0\u660E\u8FD9\u4E00\u6B65\u8981\u6539\u52A8\u7684\u76F8\u5BF9\u8DEF\u5F84\u2014\u2014**\u5C3D\u91CF\u58F0\u660E\u5230\u76EE\u5F55\u7C92\u5EA6\uFF08\u5982 src/data\uFF09\uFF0C\u4E0D\u8981\u9010\u6587\u4EF6\u5217**\uFF1B\u58F0\u660E\u540E\u8FDB\u5165\u5B9E\u73B0\u4E2D\uFF0C\u8D8A\u754C\u6539\u52A8\u4F1A\u88AB\u95E8\u7981\u62E6\u622A\uFF1B\u4E0D\u58F0\u660E\u5219\u4E0D\u505A\u8303\u56F4\u62E6\u622A\u3002\u63A8\u8FDB\u9700\u8981\u6211\u70B9\u540C\u610F\uFF0C\u4E0D\u8981\u81EA\u5DF1\u50AC\u3002`,
  implementing: `\uFF08\u7EAA\u5F8B\uFF09\u6309\u4F1A\u8BDD\u624B\u518C\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\u4ECE\u4E0B\u5230\u4E0A\u8FDE\u7EED\u5B8C\u6210\u6240\u6709\u5C42\uFF1A\u6BCF\u5B8C\u6210\u4E00\u5C42\uFF0C\u6309\u8BE5\u5C42\u300C\u5B8C\u6210\u6807\u51C6\u300D\u81EA\u68C0\uFF0C\u7528 workflow_check \u628A\u8BC1\u636E\u5199\u8FDB\u6E05\u5355\uFF0C\u7136\u540E\u76F4\u63A5\u7EE7\u7EED\u4E0B\u4E00\u5C42\uFF0C\u4E0D\u8981\u9010\u5C42\u7B49\u6211\u786E\u8BA4\u3002\u6CE8\u610F\uFF1A\u8FDB\u5165\u300C\u5B9E\u73B0\u4E2D\u300D\u540E\u300C\u65B9\u6848\u300D\u5DF2\u9501\u5B9A\uFF0C\u4E0D\u80FD\u7528 workflow_manual \u6539\u5199\u2014\u2014\u53D1\u73B0\u65B9\u6848\u6709\u6D1E\u8981\u6539\uFF0C\u5C31\u8BF7\u6C42\u8FD4\u5DE5\u56DE\u300C\u8BA8\u8BBA\u4E2D\u300D\u3002\u4F46\u300C\u8303\u56F4\u300D\u4E0D\u7528\u8FD4\u5DE5\uFF1A\u53D1\u73B0\u8FD8\u8981\u78B0\u58F0\u660E\u8303\u56F4\u5916\u7684\u8DEF\u5F84\u65F6\uFF0C\u7528 workflow_manual({ target:"session", action:"extend_scope", paths:[...], reason:"..." }) \u8FFD\u52A0\u8303\u56F4\uFF08\u53EA\u80FD\u52A0\u3001\u4E0D\u80FD\u5220\u7F29\uFF09\uFF0C\u95E8\u7981\u7ACB\u523B\u751F\u6548\u3002\u53EA\u6709\u547D\u4E2D\u4EE5\u4E0B\u60C5\u51B5\u624D\u505C\u4E0B\u6765\u95EE\u6211\uFF1A\u2460 \u65B9\u6848\u6709\u6D1E\u6216\u81EA\u76F8\u77DB\u76FE\uFF0C\u9700\u8981\u6211\u62CD\u677F\uFF1B\u2461 \u8BE5\u5C42\u81EA\u68C0\u5931\u8D25\uFF0C\u4E14\u65E0\u6CD5\u5728\u672C\u5C42\u81EA\u884C\u4FEE\u590D\uFF1B\u2462 \u9700\u8981\u505A\u8D85\u51FA\u65B9\u6848\u8303\u56F4\u7684\u6539\u52A8\uFF08\u542B\u53CD\u590D\u8FFD\u52A0\u8303\u56F4\u4E5F\u76D6\u4E0D\u4F4F\u7684\u65B0\u65B9\u5411\uFF09\uFF1B\u2463 \u6D89\u53CA\u5220\u9664 / \u8986\u76D6\u4E0D\u53EF\u9006\u7684\u6570\u636E\u6216\u914D\u7F6E\uFF1B\u2464 \u9700\u8981\u6211\u63D0\u4F9B\u5916\u90E8\u8D44\u6E90\uFF08\u8D26\u53F7\u3001\u6587\u4EF6\u3001\u73AF\u5883\uFF09\u3002\u5168\u90E8\u5C42\u5B8C\u6210\u540E\uFF0C\u4E00\u6B21\u6027\u6C47\u62A5\u6BCF\u5C42\u505A\u4E86\u4EC0\u4E48\u3001\u600E\u4E48\u9A8C\u7684\u3001\u7ED3\u679C\u5982\u4F55\uFF0C\u7136\u540E\u8BF7\u6C42\u8FDB\u300C\u9A8C\u6536\u4E2D\u300D\u3002`,
  verifying: `\uFF08\u7EAA\u5F8B\uFF09\u9A8C\u6536\u5FC5\u987B\u7ED9\u53EF\u590D\u8DD1\u7684\u8BC1\u636E\uFF1A\u6BCF\u4E00\u9879\u300C\u901A\u8FC7\u300D\u90FD\u8981\u9644\u547D\u4EE4 + \u8F93\u51FA\uFF0C\u6216\u6307\u5411\u5177\u4F53\u6D4B\u8BD5\u6587\u4EF6\uFF08\u8DEF\u5F84 + \u8DD1\u6CD5\uFF09\uFF1B\u6CA1\u6709\u8BC1\u636E\u7684\u300C\u901A\u8FC7\u300D\u4E0D\u7B97\u901A\u8FC7\u3002

\u4E03\u9879\u53EA\u8BA4\u5DE5\u5177\u62A5\u5907\uFF0C\u4E0D\u8BA4\u300C\u6211\u68C0\u67E5\u8FC7\u4E86\u300D\uFF1A
- workflow_verify_report\uFF1A\u7ED3\u8BBA pass \u2192 \u2713\uFF0C\u7ED3\u8BBA deferred\uFF08\u67E5\u51FA\u95EE\u9898\u4F46\u672C\u8F6E\u4E0D\u4FEE\uFF09\u2192 \uFF1F\uFF1B\u4E24\u79CD\u90FD\u8981\u5E26\u5DE5\u4F5C\u76EE\u5F55\u5185\u771F\u5B9E\u5B58\u5728\u7684\u951A\u70B9\uFF0C\u884C\u53F7\u4E0D\u5F97\u8D8A\u754C\uFF1B\u7B2C 1 / 4 / 7 \u9879\u8FD8\u5FC5\u987B\u5E26\u590D\u8DD1\u547D\u4EE4\u3002
- AI \u4E0D\u80FD\u76F4\u63A5\u6253\u52FE\uFF1B\u8981\u64A4\u9500\u53EA\u80FD\u8C03\u7528 workflow_verify_check\uFF08done=false\uFF09\u3002
- \u6CA1\u62A5\u5907\u7684\u9879\u505C\u5728 \u25CB\uFF1B\u4E03\u9879\u5168\u975E \u25CB \u624D\u80FD\u8FDB\u300C\u5DF2\u5B8C\u7ED3\u300D\uFF1B\u6BCF\u6B21\u8FDB\u300C\u9A8C\u6536\u4E2D\u300D\u8F6E\u6B21 +1\uFF0C\u65E7\u62A5\u5907\u81EA\u52A8\u5931\u6548\u3002`
};

// src/host/event-log.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname as dirname2, join as join2 } from "node:path";
var MAX_EVENTS = 500;
var events = [];
var logFilePath = null;
var writeChain = Promise.resolve();
function configureEventLog(dir) {
  if (typeof dir !== "string" || dir.trim() === "") return;
  logFilePath = join2(dir, "events.jsonl");
}
function persistEvent(entry) {
  if (logFilePath === null) return;
  const line = `${JSON.stringify(entry)}
`;
  writeChain = writeChain.then(async () => {
    await mkdir(dirname2(logFilePath), { recursive: true });
    await appendFile(logFilePath, line, "utf8");
  }).catch(() => {
  });
}
function newTraceId() {
  return `wf-${randomUUID3().slice(0, 8)}`;
}
function recordEvent(level, message, trace) {
  const entry = { at: (/* @__PURE__ */ new Date()).toISOString(), level, message };
  if (typeof trace === "string" && trace !== "") entry.trace = trace;
  events.push(entry);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  persistEvent(entry);
}
function recentEvents(limit = 100) {
  const n = Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_EVENTS) : 100;
  return events.slice(-n);
}
function logEvent(logger, level, message, trace) {
  recordEvent(level, message, trace);
  if (level === "info") logger?.info?.(message);
  else logger?.warn?.(message);
}

// src/host/workflow-state-context.ts
import { join as join3 } from "node:path";

// src/engine/text-budget.ts
function countUtf8Bytes(text) {
  return new TextEncoder().encode(text).length;
}
function truncateToBytes(text, maxBytes) {
  if (maxBytes <= 0) return "";
  const buffer = Buffer.from(text, "utf8");
  if (buffer.length <= maxBytes) return text;
  let end = maxBytes;
  while (end > 0 && ((buffer[end] ?? 0) & 192) === 128) end -= 1;
  return `${buffer.subarray(0, end).toString("utf8")}\u2026\uFF08\u5DF2\u622A\u65AD\uFF09`;
}

// src/engine/session-manual-slices.ts
function splitPlanSections(planBody) {
  const sections = [];
  let current = null;
  for (const line of planBody.split(/\r?\n/)) {
    const heading = /^###\s*(?:(\d+)\.\s*)?(.+?)\s*$/.exec(line);
    if (heading !== null) {
      if (current !== null) sections.push({ id: current.id, title: current.title, body: current.lines.join("\n").trim() });
      const title = heading[2] ?? "";
      current = { id: heading[1] === void 0 ? sections.length + 1 : Number(heading[1]), title, lines: [] };
      continue;
    }
    if (current !== null) current.lines.push(line);
  }
  if (current !== null) sections.push({ id: current.id, title: current.title, body: current.lines.join("\n").trim() });
  return sections;
}
function extractContract(body) {
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("\u5C42\u95F4\u5951\u7EA6")) continue;
    const cut = trimmed.indexOf("\uFF1A");
    return cut === -1 ? trimmed : trimmed.slice(cut + 1).trim();
  }
  return "";
}
function sectionForLabel(sections, label) {
  return sections.find((section) => label.includes(section.title));
}
function pickCurrentLayer(sections, items) {
  const unchecked = items.find((item) => !item.done);
  return unchecked === void 0 ? void 0 : sectionForLabel(sections, unchecked.label);
}
function accumulateContracts(sections, items) {
  const contracts = [];
  for (const item of items) {
    if (!item.done) continue;
    const section = sectionForLabel(sections, item.label);
    if (section === void 0) continue;
    const contract = extractContract(section.body);
    if (contract !== "") contracts.push({ label: section.title, contract });
  }
  return contracts;
}
function pickPerLayerPlan(planBody, items) {
  const sections = splitPlanSections(planBody);
  if (sections.length === 0) {
    return { goal: planBody.trim(), currentTitle: "", currentBody: "", contracts: [] };
  }
  const goal = sections.find((section) => section.title.includes("\u76EE\u6807")) ?? sections[0];
  const current = pickCurrentLayer(sections, items);
  const contracts = accumulateContracts(sections, items);
  return {
    goal: goal?.body ?? "",
    currentTitle: current?.title ?? "",
    currentBody: current?.body ?? "",
    contracts
  };
}
function composePerLayerPlan(plan) {
  const parts = [];
  if (plan.goal !== "") parts.push(`### 1. \u76EE\u6807\u4E0E\u9A8C\u6536
${plan.goal}`);
  if (plan.currentTitle !== "") parts.push(`### \u5F53\u524D\u5C42\uFF1A${plan.currentTitle}
${plan.currentBody}`);
  if (plan.contracts.length > 0) {
    parts.push(`\u5DF2\u5B8C\u6210\u5C42\u5951\u7EA6\uFF1A
${plan.contracts.map((item) => `- ${item.label}\uFF1A${item.contract}`).join("\n")}`);
  }
  return parts.join("\n\n");
}
function pickPerLayerPlanFromManual(manual, items) {
  return composePerLayerPlan(pickPerLayerPlan(pickSectionBody(manual, ["\u65B9\u6848"]), items));
}

// src/engine/prompt-layers.ts
var PROMPT_LAYER_SPECS = [
  { name: "header", order: 130, hard: true, priority: 0 },
  { name: "hard-rules", order: 140, hard: true, priority: 0 },
  { name: "shared-detail", order: 145, hard: true, priority: 0 },
  { name: "state-detail", order: 150, hard: true, priority: 0 },
  { name: "node-addition", order: 155, hard: false, priority: 3 },
  { name: "verify-progress", order: 156, hard: false, priority: 1 },
  { name: "tool-catalog", order: 158, hard: true, priority: 0 },
  { name: "constraints", order: 160, hard: false, priority: 1 },
  { name: "manual-tags", order: 162, hard: false, priority: 2 },
  { name: "manual-cue", order: 165, hard: false, priority: 2 },
  { name: "session-manual", order: 170, hard: true, priority: 0 }
];
var TAG_LAYER_BUDGET_BYTES = 600;
var SESSION_MANUAL_BUDGET_BYTES = 4600;
function assemblePromptLayers(input, budgetBytes) {
  const specs = [...PROMPT_LAYER_SPECS].sort((left, right) => left.order - right.order);
  const textOf = /* @__PURE__ */ new Map();
  for (const layer of input) textOf.set(layer.name, layer.text ?? "");
  const known = new Set(specs.map((spec) => spec.name));
  const dropped = input.filter((layer) => !known.has(layer.name) && (layer.text ?? "").trim() !== "").map((layer) => ({ name: layer.name, bytes: countUtf8Bytes(layer.text), reason: "unknown-layer" }));
  const rows = specs.map((spec) => {
    const text = (textOf.get(spec.name) ?? "").trim();
    return { spec, text, bytes: countUtf8Bytes(text) };
  });
  const hardRows = rows.filter((row) => row.spec.hard && row.text !== "");
  const softRows = rows.filter((row) => !row.spec.hard && row.text !== "");
  const hardBytes = hardRows.reduce((sum, row) => sum + row.bytes, 0);
  if (hardBytes > budgetBytes) {
    throw new Error(
      `\u786C\u5C42\u5408\u8BA1 ${hardBytes} \u5B57\u8282\uFF0C\u8D85\u8FC7\u603B\u9884\u7B97 ${budgetBytes} \u5B57\u8282\uFF1A\u8BF7\u7CBE\u7B80\u9636\u6BB5\u786C\u89C4\u5219\u6216\u64CD\u4F5C\u7EC6\u8282\uFF08\u8FD9\u51E0\u5C42\u4E0D\u5141\u8BB8\u88AB\u88C1\uFF09\u3002`
    );
  }
  const dropOrder = [...softRows].sort((left, right) => {
    if (right.spec.priority !== left.spec.priority) return right.spec.priority - left.spec.priority;
    return right.spec.order - left.spec.order;
  });
  let keptBytes = hardBytes + softRows.reduce((sum, row) => sum + row.bytes, 0);
  const droppedNames = /* @__PURE__ */ new Set();
  for (const row of dropOrder) {
    if (keptBytes <= budgetBytes) break;
    droppedNames.add(row.spec.name);
    keptBytes -= row.bytes;
    dropped.push({ name: row.spec.name, bytes: row.bytes, reason: "over-budget" });
  }
  const layers = rows.filter((row) => row.text !== "").map((row) => ({
    name: row.spec.name,
    order: row.spec.order,
    text: droppedNames.has(row.spec.name) ? "" : row.text,
    bytes: row.bytes,
    dropped: droppedNames.has(row.spec.name)
  }));
  return { layers, keptBytes, dropped, truncated: droppedNames.size > 0 };
}
function pickSessionManualParts(manual) {
  const items = parseChecklist(manual);
  const unchecked = items.filter((item) => !item.done).map((item) => item.label);
  const plan = pickPerLayerPlanFromManual(manual, items);
  return {
    plan,
    pitfalls: pickSectionBody(manual, ["\u5782\u76F4\u5207\u7247\u5751"]),
    unchecked,
    checkedCount: items.filter((item) => item.done).length,
    totalItems: items.length,
    hasPlan: parseHasPlan(manual)
  };
}

// src/host/workflow-state-context.ts
var TOTAL_BUDGET_BYTES = 11e3;
function clipChars(text, limit) {
  const chars = Array.from(text);
  if (chars.length <= limit) return { text, clipped: false };
  return { text: `${chars.slice(0, limit).join("")}\u2026\uFF08\u5DF2\u622A\u65AD\uFF0C\u5168\u6587\u89C1\u9879\u76EE\u624B\u518C\u6587\u4EF6\uFF09`, clipped: true };
}
function renderSessionManual(input) {
  const head = `\u672C\u4F1A\u8BDD\u624B\u518C\uFF08\u552F\u4E00\u771F\u6E90\uFF09\uFF1A${input.path}`;
  const listLines = input.totalItems === 0 ? ["\u5B9E\u65BD\u987A\u5E8F\uFF1A\uFF08\u8FD8\u6CA1\u5199\uFF09"] : [
    `\u5B9E\u65BD\u987A\u5E8F\uFF1A\u672A\u52FE ${input.unchecked.length} \u6761 / \u5171 ${input.totalItems} \u6761\uFF08\u5DF2\u52FE ${input.checkedCount} \u6761\u4E0D\u518D\u91CD\u590D\u6CE8\u5165\uFF09`,
    ...input.unchecked.map((label, index) => `${index + 1}. ${label}`)
  ];
  const listText = listLines.join("\n");
  const pitfallsRaw = input.pitfalls.trim();
  const pitfallsBlock = pitfallsRaw === "" ? "" : `\u5782\u76F4\u5207\u7247\u5751\uFF08\u505A\u5B8C\u518D\u6539\u8D35\uFF0C\u7ED5\u5F00\uFF09\uFF1A
${pitfallsRaw}`;
  const overhead = countUtf8Bytes(`${head}

\u65B9\u6848\uFF1A


${listText}`);
  const planBudget = Math.max(300, SESSION_MANUAL_BUDGET_BYTES - overhead);
  const rawPlan = input.plan.trim();
  const planText = rawPlan === "" ? "\uFF08\u8FD8\u6CA1\u5199\uFF09" : truncateToBytes(rawPlan, planBudget);
  const middle = [planText, pitfallsBlock].filter((part) => part !== "").join("\n\n");
  return {
    text: `${head}

\u65B9\u6848\uFF1A
${middle}

${listText}`,
    planTruncated: rawPlan !== "" && planText !== rawPlan
  };
}
function registerWorkflowStateContext(ctx, repository, isWorkflowSession = () => true, options) {
  const cache = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Set();
  const clear = (sessionId, reason) => {
    cache.delete(sessionId);
    logEvent(ctx.logger, "info", `[workflow] context cleared (session=${sessionId}, reason=${reason})`);
    return null;
  };
  const buildText = async (sessionId) => {
    const found = await repository.findBySession(sessionId);
    if (found === null || found === void 0) return clear(sessionId, "no-node");
    const snapshot = await repository.get(found.workflowId);
    if (snapshot === null) return clear(sessionId, "no-workflow");
    const node = snapshot.nodes.find((candidate) => candidate.node_id === found.nodeId);
    if (node === void 0) return clear(sessionId, "no-node-in-snapshot");
    const global = await repository.getAppGlobalOperationDetail();
    const detail = effectiveDetailParts(node.current_state, node, global);
    const label = NODE_STATE_LABEL[node.current_state] ?? node.current_state;
    const header = [
      `\u8282\u70B9\uFF1A${node.title || "(\u672A\u547D\u540D)"}\u3000workflow\uFF1A${snapshot.title}`,
      `\u5F53\u524D\u72B6\u6001\uFF1A${label}`,
      "\uFF08\u9636\u6BB5\u8FB9\u754C\uFF1A\u53EA\u6709\u300C\u8BA8\u8BBA\u4E2D\u300D\u4F1A\u62E6\u5199\u64CD\u4F5C\uFF1B\u300C\u9A8C\u6536\u4E2D\u300D\u300C\u5DF2\u5B8C\u7ED3\u300D\u4E0D\u62E6\u5199\u6587\u4EF6\u3002\u6539\u4EE3\u7801\u4ECD\u6309\u9636\u6BB5\u89C4\u5219\u8D70\uFF0C\u5DE5\u5177\u4F1A\u8FD4\u56DE\u8BE5\u9636\u6BB5\u7684\u5B8C\u6574\u89C4\u5219\u3002\uFF09"
    ].join("\n");
    const hardOverride = (global && typeof global === "object" ? global.hard_rules : void 0) ?? {};
    const hardRule = node.current_state === "discussing" ? hardOverride.discussing ?? DEFAULT_HARD_RULES.discussing : node.current_state === "implementing" ? hardOverride.implementing ?? DEFAULT_HARD_RULES.implementing : node.current_state === "verifying" ? hardOverride.verifying ?? DEFAULT_HARD_RULES.verifying : "";
    const nodeAdditional = typeof node.additional_detail === "object" && node.additional_detail !== null ? node.additional_detail.global : void 0;
    const stateAddition = typeof node.additional_detail === "object" && node.additional_detail !== null ? node.additional_detail[node.current_state] : void 0;
    const additionParts = [];
    if (typeof nodeAdditional === "string" && nodeAdditional.trim() !== "") additionParts.push(nodeAdditional.trim());
    if (typeof stateAddition === "string" && stateAddition.trim() !== "") additionParts.push(`\u672C\u8282\u70B9\u8865\u5145\u8981\u6C42\uFF1A${stateAddition.trim()}`);
    const limits = (await repository.getAppSettings()).manualLimits;
    const projectSections = await repository.readGlobalManualSections(found.workflowId);
    const constraints = clipChars(projectSections.constraints.trim(), limits.constraints_chars);
    if (constraints.clipped) {
      logEvent(ctx.logger, "warn", `[workflow] constraints clipped (session=${sessionId}, limit=${limits.constraints_chars}\u5B57)`);
    }
    const projectManualPath = await repository.globalManualPath(found.workflowId);
    const cue = projectManualPath === null ? "" : [
      `\u9879\u76EE\u624B\u518C\uFF1A${projectManualPath}`,
      "\uFF08\u9879\u76EE\u603B\u89C8 / \u51B3\u7B56\u8BB0\u5F55 / \u5751\u4E0E\u9632\u7EBF\u4E0D\u5E38\u9A7B\u7CFB\u7EDF\u63D0\u793A\uFF1A\u9700\u8981\u9879\u76EE\u80CC\u666F\u2014\u2014\u4E3A\u4EC0\u4E48\u8FD9\u4E48\u8BBE\u8BA1\u3001\u8E29\u8FC7\u4EC0\u4E48\u5751\u2014\u2014\u65F6\u7528\u6587\u4EF6\u8BFB\u53D6\u5DE5\u5177\u8BFB\u5B83\uFF0C\u4E0D\u8981\u731C\u3002\uFF09"
    ].join("\n");
    const rawTagsText = projectSections.tags.length === 0 ? "" : `\u6807\u7B7E\u8868\uFF08\u5199\u9879\u76EE\u624B\u518C\u6761\u76EE\u65F6\u53EA\u80FD\u4ECE\u8FD9\u91CC\u9009\uFF0C\u4E5F\u53EF\u4EE5\u586B\u9879\u76EE\u91CC\u771F\u5B9E\u5B58\u5728\u7684\u6587\u4EF6\u540D\uFF09\uFF1A
${projectSections.tags.join(" / ")}`;
    const tagsText = rawTagsText === "" ? "" : truncateToBytes(rawTagsText, TAG_LAYER_BUDGET_BYTES);
    if (tagsText !== rawTagsText) {
      logEvent(ctx.logger, "warn", `[workflow] tag layer truncated (session=${sessionId}, tags=${projectSections.tags.length}, bytes=${countUtf8Bytes(tagsText)})`);
    }
    let verifyProgress = "";
    if (node.current_state === "verifying") {
      const verification = await repository.getVerification(found.workflowId, found.nodeId);
      const progress = summarizeVerification(verification);
      const lines = [
        `\u3010\u9A8C\u6536\u4E03\u9879\u3011\u901A\u8FC7 ${progress.pass} / \u95EE\u8BE2 ${progress.deferred} / \u5F85\u5904\u7406 ${progress.pending}\uFF08\u5171 ${progress.total}\uFF09`,
        ...verification.items.map((item) => {
          const definition = VERIFY_CHECKS.find((check) => check.id === item.id);
          const tail = item.mark === "deferred" && item.report !== null ? `\uFF1A${item.report.summary}` : "";
          return `${verifyMarkSymbol(item.mark)} ${item.id} ${definition?.name ?? ""}${tail}`.trim();
        }),
        "\uFF08\u2713 = \u5DF2\u62A5\u5907\u901A\u8FC7\uFF1B\uFF1F = \u67E5\u51FA\u95EE\u9898\u672C\u8F6E\u4E0D\u4FEE\uFF1B\u25CB = \u8FD8\u6CA1\u62A5\u5907\u3002\u62A5\u5907\u7528 workflow_verify_report\uFF0C\u4E03\u9879\u5168\u975E \u25CB \u624D\u80FD\u8FDB\u300C\u5DF2\u5B8C\u7ED3\u300D\u3002\uFF09"
      ];
      if (verification.items.find((item) => item.id === 6)?.mark === "deferred") {
        lines.push("\u63D0\u793A\uFF1A\u7B2C 6 \u9879\u8FD8\u6CA1\u9A8C\u8FC7\u3002\u7F3A\u57CB\u70B9\u8BA1\u5212\u5C31\u5148\u8DD1 check_instrumentation\u2014\u2014\u5B83\u4F1A\u81EA\u52A8\u5728\u9879\u76EE\u6839\u751F\u6210 instrumentation-skeleton.json \u8349\u7A3F\uFF1B\u6574\u7406\u6210 instrumentation.json \u518D\u8DD1\u5C31\u4F1A\u771F\u7684\u63D2\u57CB\u70B9\uFF08\u9A8C\u6536\u9636\u6BB5\u5141\u8BB8\u6539\u6587\u4EF6\uFF09\u3002");
      }
      verifyProgress = lines.join("\n");
    }
    const manualData = await repository.readNodeManual(found.workflowId, found.nodeId);
    let sessionManual = "";
    if (manualData !== null) {
      const parts = pickSessionManualParts(manualData.manual);
      const rendered = renderSessionManual({
        path: join3(manualData.notesDir, `\u4F1A\u8BDD\u624B\u518C-${found.nodeId}.md`),
        plan: parts.plan,
        pitfalls: node.current_state === "implementing" ? parts.pitfalls : "",
        unchecked: parts.unchecked,
        checkedCount: parts.checkedCount,
        totalItems: parts.totalItems
      });
      if (rendered.planTruncated) {
        logEvent(ctx.logger, "warn", `[workflow] session plan truncated (session=${sessionId}, bytes>${SESSION_MANUAL_BUDGET_BYTES})`);
      }
      sessionManual = rendered.text;
    }
    let toolCatalog = "";
    if (typeof options?.catalogTextOf === "function") {
      try {
        toolCatalog = await options.catalogTextOf(node.current_state);
      } catch (error) {
        logEvent(ctx.logger, "warn", `[workflow] tool catalog failed (session=${sessionId}): ${String(error?.message ?? error)}`);
      }
    }
    const assembly = assemblePromptLayers([
      { name: "header", text: header },
      { name: "hard-rules", text: typeof hardRule === "string" && hardRule.trim() !== "" ? `\u3010\u672C\u9636\u6BB5\u786C\u89C4\u5219\u3011
${hardRule.trim()}` : "" },
      { name: "shared-detail", text: detail.shared_detail },
      { name: "state-detail", text: detail.state_detail },
      { name: "node-addition", text: additionParts.join("\n\n") },
      { name: "verify-progress", text: verifyProgress },
      { name: "tool-catalog", text: toolCatalog },
      { name: "constraints", text: constraints.text.trim() === "" ? "" : `\u3010\u7EA6\u675F / \u7EA2\u7EBF\u3011\uFF08\u672C\u9879\u76EE\u7EDD\u4E0D\u80FD\u505A\uFF09
${constraints.text.trim()}` },
      { name: "manual-tags", text: tagsText },
      { name: "manual-cue", text: cue },
      { name: "session-manual", text: sessionManual }
    ], TOTAL_BUDGET_BYTES);
    const layers = /* @__PURE__ */ new Map();
    const layerBytes = /* @__PURE__ */ new Map();
    for (const layer of assembly.layers) {
      layers.set(layer.name, layer.text);
      layerBytes.set(layer.name, layer.bytes);
    }
    const signature = assembly.layers.map((layer) => `${layer.name}:${layer.text.length}`).join("|") + `|dropped:${assembly.dropped.map((item) => item.name).join(",")}`;
    const built = {
      layers,
      layerBytes,
      state: node.current_state,
      nodeId: node.node_id,
      bytes: assembly.keptBytes,
      dropped: assembly.dropped,
      signature
    };
    cache.set(sessionId, built);
    return built;
  };
  const logLayers = (sessionId, next, previous) => {
    for (const spec of PROMPT_LAYER_SPECS) {
      const text = next.layers.get(spec.name) ?? "";
      if (text === "") continue;
      const bytes = next.layerBytes.get(spec.name) ?? 0;
      const before = previous?.layers.get(spec.name) ?? "";
      if (before === text) continue;
      logEvent(ctx.logger, "info", `[workflow] layer ${spec.name} (session=${sessionId}, order=${spec.order}, bytes=${bytes})`);
    }
    for (const item of next.dropped) {
      const wasDropped = (previous?.dropped ?? []).some((old) => old.name === item.name);
      if (wasDropped) continue;
      logEvent(
        ctx.logger,
        "warn",
        `[workflow] layer dropped (session=${sessionId}, name=${item.name}, bytes=${item.bytes}, reason=${item.reason})`
      );
    }
  };
  const buildAndLog = async (sessionId) => {
    const previous = cache.get(sessionId);
    const startedAt = Date.now();
    const built = await buildText(sessionId);
    if (built === null) return null;
    logLayers(sessionId, built, previous);
    logEvent(
      ctx.logger,
      "info",
      `[workflow] state-context ok (session=${sessionId}, bytes=${built.bytes}, budget=${TOTAL_BUDGET_BYTES}, headroom=${TOTAL_BUDGET_BYTES - built.bytes}, layers=${built.layers.size}, dropped=${built.dropped.length}, ${Date.now() - startedAt}ms)`
    );
    return built;
  };
  const refresh = (sessionId) => {
    if (typeof sessionId !== "string" || sessionId === "" || pending.has(sessionId)) return;
    if (!isWorkflowSession(sessionId)) return;
    pending.add(sessionId);
    void buildAndLog(sessionId).catch((error) => {
      logEvent(ctx.logger, "warn", `workflow state context refresh failed (session=${sessionId}): %o ${String(error)}`);
    }).finally(() => pending.delete(sessionId));
  };
  const readLayer = (sessionId, name) => {
    if (typeof sessionId !== "string" || sessionId === "") return "";
    if (!isWorkflowSession(sessionId)) return "";
    const entry = cache.get(sessionId);
    if (entry !== void 0) return entry.layers.get(name) ?? "";
    logEvent(ctx.logger, "info", `[workflow] context cold (session=${sessionId})`);
    refresh(sessionId);
    return "";
  };
  const joinLayers = (entry) => PROMPT_LAYER_SPECS.map((spec) => entry.layers.get(spec.name) ?? "").filter((text) => text !== "").join("\n\n");
  ctx.on("agent/pre-step", async (_payload, next) => {
    const payload = _payload ?? {};
    const sessionId = payload.agent?.session?.id;
    if (typeof sessionId === "string") refresh(sessionId);
    return next();
  });
  ctx.on("agent/created", function(payload) {
    const sessionId = payload?.agent?.session?.id;
    if (typeof sessionId !== "string" || sessionId === "") return;
    if (!isWorkflowSession(sessionId)) return;
    logEvent(ctx.logger, "info", `[workflow] context registered (session=${sessionId})`);
    refresh(sessionId);
    if (typeof this?.systemPrompt?.context !== "function") return;
    for (const spec of PROMPT_LAYER_SPECS) {
      this.systemPrompt.context({
        name: `workflow:${spec.name}`,
        order: spec.order,
        text: () => readLayer(sessionId, spec.name)
      });
    }
  });
  ctx.inject(["systemPrompt"], (scoped) => {
    scoped.effect(() => {
      const disposers = [];
      for (const spec of PROMPT_LAYER_SPECS) {
        disposers.push(scoped.systemPrompt.context({
          name: `workflow:${spec.name}`,
          order: spec.order,
          text: (assemblyContext) => readLayer(pickSessionId(assemblyContext), spec.name)
        }));
      }
      return () => {
        for (const dispose of disposers) {
          if (typeof dispose === "function") dispose();
        }
      };
    });
  });
  return {
    /** 强制算一次并返回合并文本（调试/预览用）。 */
    peek: async (sessionId) => {
      const built = await buildText(sessionId);
      return built === null ? "" : joinLayers(built);
    },
    /** 立刻重算并等它完成：状态推进后调用，保证下一轮模型请求看到的就是新状态。 */
    refreshNow: async (sessionId) => {
      const built = await buildAndLog(sessionId);
      return built === null ? "" : joinLayers(built);
    }
  };
}
function pickSessionId(context) {
  const candidates = [
    context?.sessionId,
    context?.session?.id,
    context?.agent?.session?.id,
    context?.scope?.session?.id,
    context?.scope?.agent?.session?.id
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate !== "") return candidate;
  }
  return "";
}

// src/host/workflow-tools.ts
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir as mkdir2, readFile, writeFile } from "node:fs/promises";
import { dirname as dirname6, isAbsolute, join as join7, relative, resolve as resolve4 } from "node:path";

// src/schema/tool-kind.ts
var TOOL_KIND = { base: "base", extension: "extension" };

// src/schema/tool-catalog.ts
var ALL_STATES = ["discussing", "implementing", "verifying", "completed"];
var ANCHOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["file"],
  properties: {
    file: { type: "string", description: "\u5DE5\u4F5C\u76EE\u5F55\u5185\u7684\u76F8\u5BF9\u8DEF\u5F84" },
    line: { type: "number", description: "\u53EF\u9009\u884C\u53F7\uFF1B\u7A0B\u5E8F\u4F1A\u6838\u5BF9\u5B83\u4E0D\u8D85\u8FC7\u6587\u4EF6\u884C\u6570" }
  }
};
var FINDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["location", "problem", "why_not_fixed", "impact"],
  properties: {
    location: { type: "string" },
    problem: { type: "string" },
    why_not_fixed: { type: "string" },
    impact: { type: "string" }
  }
};
var CHECKER_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["checker_id", "ok", "findings"],
  properties: {
    checker_id: { type: "string", description: "\u68C0\u67E5\u5668 id\uFF1Acontract / deps / deadcode / boundary / regression / instrumentation" },
    ok: { type: "boolean", description: "true = \u68C0\u67E5\u5668\u8DD1\u6210\u4E14\u8BC1\u636E\u975E\u7A7A\uFF1Bfalse = \u62A5\u9519/\u975E0/\u8BC1\u636E\u7A7A" },
    findings: { type: "number", description: "\u4E0D\u5408\u683C\u6761\u6570\uFF08\u975E\u8D1F\u6574\u6570\uFF09" },
    exit_code: { type: "number", description: "\u547D\u4EE4\u9000\u51FA\u7801\uFF1B\u672A\u6267\u884C\u547D\u4EE4\u65F6\u7701\u7565" }
  }
};
var BASE_TOOLS = [
  {
    name: "workflow_advance",
    description: "\u8BF7\u6C42\u628A\u5DE5\u4F5C\u6D41\u63A8\u8FDB\u5230\u4E0B\u4E00\u9636\u6BB5\uFF0C\u9700\u8981\u4F60\u70B9\u540C\u610F\u3002\u53EA\u767B\u8BB0\u8BF7\u6C42\u3001\u4E0D\u6539\u72B6\u6001\uFF1A\u7528\u6237\u5FC5\u987B\u5728\u754C\u9762\u4E0A\u70B9\u300C\u540C\u610F\u300D\u624D\u751F\u6548\uFF085 \u5206\u949F\u672A\u5904\u7406\u4F5C\u5E9F\uFF09\uFF1B\u8FD4\u5DE5\uFF08\u5411\u540E\uFF09\u5FC5\u987B\u7ED9 reason\u3002\u8BA8\u8BBA\u4E2D\u2192\u5B9E\u73B0\u4E2D\u524D\u65B9\u6848\u5FC5\u987B\u5DF2\u5199\u5165\u4F1A\u8BDD\u624B\u518C\uFF1B\u5B9E\u73B0\u4E2D\u2192\u9A8C\u6536\u4E2D\u524D\u5B9E\u65BD\u987A\u5E8F\u5FC5\u987B\u5168\u90E8\u52FE\u9009\uFF1B\u9A8C\u6536\u4E2D\u2192\u5DF2\u5B8C\u7ED3\u524D\u4E03\u9879\u5FC5\u987B\u5168\u90E8\u62A5\u5907\u3002\u6536\u5C3E\u65F6\u628A\u56DB\u4EF6\u4E8B\u5199\u8FDB\u9879\u76EE\u624B\u518C\uFF08\u65B0\u51B3\u7B56 / \u65B0\u5751 / \u90FD\u6CA1\u6709\u5199\u300C\u65E0\u300D / \u6587\u6863\u4E0E\u5B9E\u73B0\u662F\u5426\u4E00\u81F4\uFF09\uFF0C\u518D\u540C\u6B65\u4F1A\u8BDD\u624B\u518C\u3002",
    kind: TOOL_KIND.base,
    allowed_states: [...ALL_STATES],
    effect: "write-state",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["to"],
      properties: {
        to: {
          type: "string",
          enum: ["discussing", "implementing", "verifying", "completed"],
          description: "Requested stage. Forward = normal progression; backward = rework."
        },
        reason: { type: "string", description: "Required when moving backward (rework): why the previous stage was insufficient." }
      }
    }
  },
  {
    name: "workflow_manual",
    description: "\u8BFB\u5199\u4F1A\u8BDD\u624B\u518C\u4E0E\u9879\u76EE\u624B\u518C\u3002\u4F1A\u8BDD\u624B\u518C\u53EA\u80FD\u6539\u300C\u65B9\u6848\u300D\u548C\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\uFF08\u4E24\u8005\u90FD\u4EC5\u5728\u300C\u8BA8\u8BBA\u4E2D\u300D\u53EF\u5199\uFF1A\u8FDB\u5165\u5B9E\u73B0\u4E2D\u540E\u65B9\u6848\u9501\u5B9A\u3001\u5B9E\u65BD\u987A\u5E8F\u53EA\u80FD\u52FE\u9009\uFF09\uFF1B\u9879\u76EE\u624B\u518C\u6761\u76EE\u7528 append_entry / update_entry \u5199\uFF0C\u5FC5\u987B\u5E26 1 \u4E2A\u4EE5\u4E0A\u6807\u7B7E\u3002\u5B9E\u65BD\u987A\u5E8F\u6BCF\u6761\u53EF\u5E26\u300C \uFF5C \u8303\u56F4\uFF1A\u76EE\u5F551,\u76EE\u5F552\u300D\u58F0\u660E\u6539\u52A8\u8303\u56F4\uFF08\u5B9E\u73B0\u4E2D\u8D8A\u754C\u6539\u52A8\u4F1A\u88AB\u62E6\uFF0C\u5C3D\u91CF\u58F0\u660E\u5230\u76EE\u5F55\u7C92\u5EA6\u3001\u4E0D\u9010\u6587\u4EF6\uFF09\u3002\u5B9E\u73B0\u4E2D\u88AB\u8303\u56F4\u95E8\u7981\u62E6\u65F6\uFF0C\u7528 extend_scope \u8FFD\u52A0\u8303\u56F4\uFF08\u53EA\u80FD\u52A0\u3001\u4E0D\u80FD\u5220\u7F29\uFF0C\u5FC5\u987B\u5E26 reason\uFF09\uFF0C\u4E0D\u5FC5\u8FD4\u5DE5\u56DE\u8BA8\u8BBA\u4E2D\u3002replace_section \u53EA\u66FF\u6362\u4E00\u4E2A\u5C0F\u8282\u6B63\u6587\uFF1Bremove_entry \u5220\u9664\u6761\u76EE\u3001rename_tag \u5408\u5E76\u6807\u7B7E\u3002\u65B9\u6848\u6BCF\u5C42 500 \u5B57\uFF08\u6309 ### \u5C42\u5224\uFF0C\u76EE\u6807\u4E0E\u9A8C\u6536\u4E0D\u8BA1\u5165\uFF09\u3001\u7EA6\u675F 300 \u5B57\u3001\u5782\u76F4\u5207\u7247\u5751 300 \u5B57\u3001\u4F1A\u8BDD\u624B\u518C\u6574\u672C 2000 \u5B57\uFF0C\u8D85\u4E86\u62D2\u5199\uFF1B\u52FE\u9009\u8BC1\u636E\u4E0D\u8BA1\u5165\u3002",
    kind: TOOL_KIND.base,
    allowed_states: [...ALL_STATES],
    effect: "write-state",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["target", "action"],
      properties: {
        target: { type: "string", enum: ["session", "project"], description: "Which manual to touch." },
        action: {
          type: "string",
          enum: ["read", "replace_section", "append_entry", "update_entry", "remove_entry", "rename_tag", "extend_scope"],
          description: "read returns text; replace_section rewrites a whole section (session \u65B9\u6848 / project \u6807\u7B7E\u8868); append_entry / update_entry / remove_entry write ONE tagged entry into a project section; rename_tag merges or renames a tag; extend_scope appends implementation scope paths in \u5B9E\u73B0\u4E2D (session only, append-only with reason)."
        },
        section: { type: "string", description: "Section name (e.g. \u65B9\u6848 / \u9879\u76EE\u603B\u89C8 / \u51B3\u7B56\u8BB0\u5F55 / \u7EA6\u675F / \u5751\u4E0E\u9632\u7EBF / \u6807\u7B7E\u8868)." },
        content: { type: "string", description: "Entry text (append_entry / update_entry) or new section body (replace_section)." },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Required for append_entry / update_entry: 1+ tags, each \u226412 chars, no brackets or \uFF5C. Pick from the injected \u6807\u7B7E\u8868 (or a real file name in this project); unknown tags get registered automatically until the table is full."
        },
        entry: { type: "string", description: "update_entry / remove_entry: exact body text of the existing entry (without its [tags] prefix)." },
        from: { type: "string", description: "rename_tag: the tag to replace." },
        to: { type: "string", description: "rename_tag: the tag to keep. Use this to merge synonyms when the table is full." },
        paths: { type: "array", items: { type: "string" }, description: "extend_scope: relative paths/directories to append to the implementation scope (append-only, no shrinking)." },
        reason: { type: "string", description: "extend_scope: why these paths are needed (required)." }
      }
    }
  },
  {
    name: "workflow_check",
    description: "\u52FE\u9009\u6216\u53D6\u6D88\u5B9E\u65BD\u987A\u5E8F\u91CC\u7684\u6761\u76EE\uFF0C\u52FE\u9009\u5FC5\u987B\u5E26\u8BC1\u636E\u3002\u6761\u76EE\u6587\u672C\u5FC5\u987B\u5B8C\u5168\u4E00\u81F4\uFF0C\u4E0D\u80FD\u65B0\u589E\u3001\u6539\u5199\u6216\u91CD\u6392\uFF1B\u8BA8\u8BBA\u4E2D\u4E0D\u53EF\u7528\uFF1B\u5168\u90E8\u52FE\u5B8C\u624D\u80FD\u8FDB\u300C\u9A8C\u6536\u4E2D\u300D\u3002\u8BC1\u636E\u5199\u8FDB\u6E05\u5355\u884C\uFF0C\u4F8B\uFF1A\u8DD1 node test.mjs\uFF0C12 \u9879\u5168\u8FC7\u3002",
    kind: TOOL_KIND.base,
    allowed_states: ["implementing", "verifying", "completed"],
    effect: "write-state",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["item", "done"],
      properties: {
        item: { type: "string", description: "Exact text of an existing checklist item." },
        done: { type: "boolean", description: "true = checked, false = unchecked." },
        evidence: { type: "string", description: "\u52FE\u9009\u65F6\u5FC5\u586B\uFF1A\u8FD9\u4E00\u5C42\u600E\u4E48\u9A8C\u7684\u3001\u7ED3\u679C\u662F\u4EC0\u4E48\uFF08\u81EA\u7531\u6587\u672C\uFF0C\u4F8B\uFF1A\u8DD1 node test.mjs\uFF0C12 \u9879\u5168\u8FC7\uFF09\u3002\u53D6\u6D88\u52FE\u9009\u53EF\u7701\u7565\u3002" }
      }
    }
  },
  {
    name: "workflow_verify_report",
    description: "\u4E3A\u4E03\u9879\u9A8C\u6536\u4E2D\u7684\u4E00\u9879\u63D0\u4EA4\u62A5\u5907\uFF1A\u901A\u8FC7\u8BB0 \u2713\uFF0C\u67E5\u51FA\u95EE\u9898\u4E0D\u4FEE\u8BB0 \uFF1F\u3002\u5FC5\u987B\u5E26\u81F3\u5C11\u4E00\u4E2A\u5DE5\u4F5C\u76EE\u5F55\u5185\u771F\u5B9E\u5B58\u5728\u7684\u951A\u70B9\uFF08\u6587\u4EF6 + \u53EF\u9009\u884C\u53F7\uFF09\uFF1Bdeferred \u8FD8\u8981\u5199 findings\uFF08\u4F4D\u7F6E/\u95EE\u9898/\u4E3A\u4EC0\u4E48\u4E0D\u4FEE/\u5F71\u54CD\uFF09\u3002\u7B2C 1/4/7 \u9879\u5FC5\u987B\u5E26\u590D\u8DD1\u547D\u4EE4\u3002\u6709\u5F3A\u5236\u68C0\u67E5\u5668\u7684\u9879\uFF081/2/3/4/7\uFF09\u62A5 pass \u524D\u5FC5\u987B\u5148\u771F\u8DD1\u8FC7\u5BF9\u5E94 check_*\uFF08\u7528 workflow_tool_call \u8C03\u7528\uFF09\uFF0C\u5E76\u63D0\u4EA4\u5B83\u7684\u771F\u5B9E checker \u7ED3\u679C\uFF08ok/findings \u8981\u4E00\u81F4\uFF09\uFF1B\u68C0\u67E5\u5668\u5931\u8D25\u62A5 pass \u5C5E\u515C\u5E95\uFF0C\u5FC5\u987B\u5E26\u590D\u8DD1\u547D\u4EE4\u3002\u7B2C 6 \u9879\u57CB\u70B9\u68C0\u6D4B\u662F\u534F\u52A9\u578B\uFF1A\u62A5 pass \u524D\u672C\u8F6E\u81F3\u5C11\u8981\u8DD1\u8FC7\u4E00\u6B21 check_instrumentation\uFF08\u626B\u63CF\uFF09\uFF0C\u7ED3\u679C\u4ECD\u7531 AI \u5224\u65AD\u3002\u6BCF\u6B21\u8FDB\u5165\u9A8C\u6536\u4E2D\u8F6E\u6B21 +1\uFF0C\u65E7\u62A5\u5907\u81EA\u52A8\u5931\u6548\u3002",
    kind: TOOL_KIND.base,
    allowed_states: ["verifying"],
    effect: "write-state",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["item", "result", "summary", "anchors"],
      properties: {
        item: { type: "string", anyOf: [{ type: "string" }, { type: "number" }], description: "\u9A8C\u6536\u9879\uFF1Aid 1-7 \u6216\u540D\u79F0\uFF08\u4F8B\uFF1A3 \u6216\u300C\u6B7B\u4EE3\u7801\u626B\u63CF\u300D\uFF09" },
        result: { type: "string", enum: ["pass", "deferred"], description: "pass = \u901A\u8FC7\uFF1Bdeferred = \u67E5\u51FA\u95EE\u9898\u4F46\u672C\u8F6E\u4E0D\u4FEE\uFF08\u8BB0 \uFF1F\uFF09" },
        summary: { type: "string", description: "\u7ED3\u8BBA\u6458\u8981\uFF1A\u505A\u4E86\u4EC0\u4E48\u3001\u770B\u5230\u4EC0\u4E48\u7ED3\u679C\u3002" },
        anchors: { type: "array", items: ANCHOR_SCHEMA, description: "\u8BC1\u636E\u951A\u70B9\uFF0C\u81F3\u5C11\u4E00\u6761\uFF1B\u6587\u4EF6\u5FC5\u987B\u5728\u5DE5\u4F5C\u76EE\u5F55\u5185\u3002" },
        command: { type: "string", description: "\u590D\u8DD1\u547D\u4EE4\uFF1B\u5951\u7EA6\u6D4B\u8BD5 / \u8FB9\u754C\u6D4B\u8BD5 / \u56DE\u5F52\u538B\u6D4B\u4E09\u9879\u5FC5\u586B\u3002" },
        findings: { type: "array", items: FINDING_SCHEMA, description: "deferred \u65F6\u5FC5\u586B\uFF1A\u6BCF\u6761\u5199\u6E05 \u4F4D\u7F6E / \u95EE\u9898 / \u4E3A\u4EC0\u4E48\u4E0D\u4FEE / \u5F71\u54CD\u4EC0\u4E48\u3002" },
        checker: CHECKER_RESULT_SCHEMA
      }
    }
  },
  {
    name: "workflow_verify_check",
    description: "\u64A4\u56DE\u67D0\u9879\u9A8C\u6536\u6807\u8BB0\uFF08\u53EA\u80FD\u64A4\uFF0C\u4E0D\u80FD\u6253\u52FE\uFF09\u3002\u6807\u8BB0\u53EA\u80FD\u7531 workflow_verify_report \u4EA7\u751F\uFF1B\u9700\u8981\u91CD\u65B0\u6253\u52FE\u5C31\u91CD\u65B0\u62A5\u5907\u3002\u53EA\u80FD\u5728\u300C\u9A8C\u6536\u4E2D\u300D\u7528\u3002",
    kind: TOOL_KIND.base,
    allowed_states: ["verifying"],
    effect: "write-state",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["item", "done"],
      properties: {
        item: { type: "string", anyOf: [{ type: "string" }, { type: "number" }], description: "\u9A8C\u6536\u9879\uFF1Aid 1-7 \u6216\u540D\u79F0" },
        done: { type: "boolean", description: "\u53EA\u80FD\u662F false\uFF08\u53D6\u6D88\u52FE\uFF09\u3002\u4F20 true \u4F1A\u88AB\u62D2\u3002" }
      }
    }
  }
];
var EXTENSION_TOOLS = [
  {
    name: "check_contract",
    description: "\u8DD1\u5951\u7EA6\u6D4B\u8BD5\u5E76\u5224\u7ED3\u679C\u3002\u5148\u6267\u884C vitest run test \u751F\u6210\u8BC1\u636E\uFF0C\u518D\u5224\u7528\u4F8B\u6570\u4E0E\u5931\u8D25\u6570\uFF1A0 \u4E2A\u7528\u4F8B\u3001\u6709\u5931\u8D25\u90FD\u62A5\u4E0D\u5408\u683C\u3002\u53EF\u9009\u53C2\u6570 stack\uFF08js / python\uFF09\u663E\u5F0F\u6307\u5B9A\u6280\u672F\u6808\uFF1B\u4E0D\u4F20\u5219\u6309\u5DE5\u4F5C\u76EE\u5F55 marker \u81EA\u52A8\u63A2\u6D4B\u3002",
    kind: TOOL_KIND.extension,
    run: { kind: "checker", checker: "contract" },
    allowed_states: ["implementing", "verifying"],
    effect: "read-state",
    parameters: { type: "object", properties: {}, additionalProperties: true },
    version: 1
  },
  {
    name: "check_deps",
    description: "\u8DD1\u4F9D\u8D56\u8FB9\u754C\u68C0\u67E5\u5E76\u5224\u7ED3\u679C\u3002\u5148\u6267\u884C dependency-cruiser \u626B\u63CF src\uFF0C\u518D\u628A\u5FAA\u73AF\u4F9D\u8D56\u4E0E\u8DE8\u5C42\u5F15\u7528\u62A5\u6210\u4E0D\u5408\u683C\u3002\u53EF\u9009\u53C2\u6570 stack\uFF08js / python\uFF09\u663E\u5F0F\u6307\u5B9A\u6280\u672F\u6808\uFF1B\u4E0D\u4F20\u5219\u6309\u5DE5\u4F5C\u76EE\u5F55 marker \u81EA\u52A8\u63A2\u6D4B\u3002",
    kind: TOOL_KIND.extension,
    run: { kind: "checker", checker: "deps" },
    allowed_states: ["implementing", "verifying"],
    effect: "read-state",
    parameters: { type: "object", properties: {}, additionalProperties: true },
    version: 1
  },
  {
    name: "check_deadcode",
    description: "\u8DD1\u6B7B\u4EE3\u7801\u626B\u63CF\u5E76\u5224\u7ED3\u679C\u3002\u5148\u6267\u884C knip\uFF0C\u518D\u628A\u672A\u4F7F\u7528\u7684\u6587\u4EF6 / \u5BFC\u51FA / \u4F9D\u8D56\u62A5\u6210\u4E0D\u5408\u683C\u3002\u53EF\u9009\u53C2\u6570 stack\uFF08js / python\uFF09\u663E\u5F0F\u6307\u5B9A\u6280\u672F\u6808\uFF1B\u4E0D\u4F20\u5219\u6309\u5DE5\u4F5C\u76EE\u5F55 marker \u81EA\u52A8\u63A2\u6D4B\u3002",
    kind: TOOL_KIND.extension,
    run: { kind: "checker", checker: "deadcode" },
    allowed_states: ["verifying"],
    effect: "read-state",
    parameters: { type: "object", properties: {}, additionalProperties: true },
    version: 1
  },
  {
    name: "check_boundary",
    description: "\u8DD1\u8FB9\u754C\u6D4B\u8BD5\u5E76\u5224\u7ED3\u679C\u3002\u5148\u6267\u884C vitest run test/boundary \u751F\u6210\u8BC1\u636E\uFF0C\u518D\u5224\u7528\u4F8B\u6570\u4E0E\u5931\u8D25\u6570\uFF0C\u4E0E\u5951\u7EA6\u6D4B\u8BD5\u5206\u5F00\u53D6\u8BC1\u636E\u3002\u53EF\u9009\u53C2\u6570 stack\uFF08js / python\uFF09\u663E\u5F0F\u6307\u5B9A\u6280\u672F\u6808\uFF1B\u4E0D\u4F20\u5219\u6309\u5DE5\u4F5C\u76EE\u5F55 marker \u81EA\u52A8\u63A2\u6D4B\u3002",
    kind: TOOL_KIND.extension,
    run: { kind: "checker", checker: "boundary" },
    allowed_states: ["verifying"],
    effect: "read-state",
    parameters: { type: "object", properties: {}, additionalProperties: true },
    version: 1
  },
  {
    name: "check_regression",
    description: "\u8DD1\u56DE\u5F52\u4E0E\u538B\u6D4B\u5E76\u5224\u7ED3\u679C\uFF1A\u5148\u6267\u884C autocannon \u538B\u6D4B\u76EE\u6807\u5730\u5740\uFF08target \u5FC5\u4F20\uFF0C\u538B\u6D4B\u76EE\u6807\u7531\u9879\u76EE\u81EA\u5DF1\u5B9A\uFF09\u751F\u6210\u8BC1\u636E\u3002\u518D\u8BFB .workflow/evidence/regression.json \u5224\u7528\u4F8B\u6570\u4E0E\u5931\u8D25\u6570\uFF0C\u8017\u65F6\u968F\u7ED3\u679C\u8FD4\u56DE\u3002",
    kind: TOOL_KIND.extension,
    run: { kind: "checker", checker: "regression" },
    allowed_states: ["verifying"],
    effect: "read-state",
    parameters: { type: "object", properties: {}, additionalProperties: true },
    version: 1
  },
  {
    name: "check_instrumentation",
    description: "\u534F\u52A9\u578B\u57CB\u70B9\u68C0\u6D4B\uFF1A\u5148\u5199\u57CB\u70B9\u8BA1\u5212\uFF08\u9879\u76EE\u6839 instrumentation.json\uFF0C\u8DDF\u4ED3\u5E93\u8D70\u3001\u53EF\u63D0\u4EA4\uFF09\u518D\u8C03\u5DE5\u5177\uFF1B\u6CA1\u57CB\u70B9\u7684\u9879\u76EE\u9760\u5B83\u5EFA\u6811\uFF08\u5DE5\u5177\u4F1A\u628A\u57CB\u70B9\u63D2\u8FDB\u6E90\u7801\uFF0C\u5C5E\u6B63\u5E38\u4EA4\u4ED8\uFF09\u3002\u5DE5\u5177\u626B\u5DF2\u6709\u57CB\u70B9\uFF08JS logEvent(/clientLog(\uFF1BPython logger.*/log(\uFF09\uFF0C\u6309\u51FD\u6570\u540D\u951A\u70B9\u8865\u63D2\u540E\u91CD\u626B\uFF0C\u843D instrumentation-existing.json \u4E0E instrumentation-apply.json\uFF1B\u5DF2\u6709\u540C\u4E8B\u4EF6\u4F1A\u8DF3\u8FC7\u3001\u4E0D\u91CD\u590D\u63D2\u3002\u6CA1\u8BA1\u5212\u65F6\u5148\u6309\u4EE3\u7801\u51FD\u6570\u5728\u9879\u76EE\u6839\u751F\u6210 instrumentation-skeleton.json \u8349\u7A3F\u5E76\u5E26\u56DE\u683C\u5F0F\uFF0C\u6574\u7406\u6210 instrumentation.json \u518D\u8DD1\u3002\u8DD1\u5B8C\u8BFB instrumentation-apply.json \u7684 scanned / existing / inserted / skipped \u5199\u8FDB\u7B2C 6 \u9879 summary\u3002",
    kind: TOOL_KIND.extension,
    run: { kind: "checker", checker: "instrumentation" },
    allowed_states: ["verifying"],
    effect: "exec",
    parameters: { type: "object", properties: {}, additionalProperties: true },
    version: 1
  },
  {
    name: "check_build",
    description: "\u8DD1\u6784\u5EFA\u4E0E\u5192\u70DF\u5E76\u5224\u7ED3\u679C\uFF1A\u5148 npm run build \u518D npm run smoke\uFF0C\u4EFB\u4E00\u9000\u51FA\u7801\u975E 0 \u62A5\u4E0D\u5408\u683C\u3002\u6539\u4EA7\u7269\u540E\u8868\u73B0\u5C42\u52FE\u9009\u524D\u7528\u5B83\u9A8C\u8BC1 build + smoke \u901A\u8FC7\u3002",
    kind: TOOL_KIND.extension,
    run: { kind: "checker", checker: "build" },
    allowed_states: ["implementing", "verifying"],
    effect: "exec",
    parameters: { type: "object", properties: {}, additionalProperties: true },
    version: 1
  },
  {
    name: "check_naming",
    description: "\u547D\u540D\u5BA1\u67E5\uFF08\u534F\u52A9\u578B\uFF09\uFF1A\u5148\u6267\u884C naming-scan.mjs \u626B src \u7684\u5C01\u6740\u8BCD\uFF08system/data/info/manager/util/utils/common/helper\uFF09\uFF0C\u4EA7\u51FA naming.json \u5E76\u5224\u5B9A\u3002\u8BED\u4E49\u90E8\u5206\uFF08\u53CD\u5411\u5197\u957F / \u8DE8\u6A21\u5757\u66B4\u9732 / \u524D\u7F00\u8D8A\u754C\uFF09\u4ECD\u7531\u4F60\u5224\uFF1B\u62A5\u7B2C 5 \u9879 pass \u524D\u672C\u8F6E\u81F3\u5C11\u8981\u8DD1\u8FC7\u4E00\u6B21\u672C\u5DE5\u5177\u3002",
    kind: TOOL_KIND.extension,
    run: { kind: "checker", checker: "naming" },
    allowed_states: ["verifying"],
    effect: "read-state",
    parameters: { type: "object", properties: {}, additionalProperties: true },
    version: 1
  }
];
var LAYER_GATES = {
  \u5782\u76F4\u5207\u7247: { checker: "deps", require_run: true },
  \u6570\u636E\u5C42: { checker: "", require_run: false },
  \u9886\u57DF\u5C42: { checker: "", require_run: false },
  \u63A5\u53E3\u5C42: { checker: "contract", require_run: true },
  \u8868\u73B0\u5C42: { checker: "build", require_run: true }
};

// src/engine/checkers/types.ts
function missingEvidence(evidence, command) {
  return {
    ok: false,
    findings: [{ location: evidence, problem: `\u7F3A\u8BC1\u636E\u6587\u4EF6\uFF1A\u5148\u8DD1 \`${command}\` \u751F\u6210 .workflow/evidence/${evidence}` }],
    stats: {}
  };
}
function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function asString(value) {
  return typeof value === "string" ? value : "";
}

// src/engine/checkers/normalize.ts
function asObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
function asNumber2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function normalizePytestReport(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { numTotalTests: 0, numFailedTests: 0, exitcode: 0 };
  }
  const root = asObject(parsed);
  const summary = asObject(root.summary);
  return {
    numTotalTests: asNumber2(summary.total),
    numFailedTests: asNumber2(summary.failed) + asNumber2(summary.error),
    // pytest 自己的退出码：判据用它做 fail-closed 交叉校验（异常退出时不完全信 summary）。
    exitcode: asNumber2(root.exitcode)
  };
}
function normalizeImportLinter(raw) {
  const violations = [];
  let currentContract = "";
  let inBrokenSection = false;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "Broken contracts") {
      inBrokenSection = true;
      continue;
    }
    if (!inBrokenSection) continue;
    const violation = /^-\s+(.+?)\s+->\s+(.+?)\s+\(l\.\d+\)$/.exec(trimmed);
    if (violation !== null) {
      violations.push({
        from: violation[1] ?? "",
        to: violation[2] ?? "",
        rule: { name: currentContract || "import-linter-contract", severity: "error" }
      });
      continue;
    }
    if (trimmed !== "" && !trimmed.includes(" ") && !trimmed.startsWith("-")) {
      currentContract = trimmed;
    }
  }
  return { summary: { violations } };
}
function normalizeVulture(raw) {
  const issues = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = /^(.+?):(\d+):\s+(.+)$/.exec(line.trim());
    if (match === null) continue;
    issues.push({
      file: match[1] ?? "",
      line: Number(match[2] ?? 0),
      message: match[3] ?? ""
    });
  }
  return { issues };
}

// src/engine/checkers/contract.ts
var EVIDENCE = "contract.json";
var DEFAULT_TARGET = "test";
var CONTRACT_COMMANDS = {
  js: (target) => `vitest run ${target} --reporter=json --outputFile=.workflow/evidence/${EVIDENCE}`,
  python: (_target, tools) => `"${tools.projectPython ?? tools.python ?? "python"}" -m pytest --json-report --json-report-file=.workflow/evidence/${EVIDENCE}`
};
function buildCommand(target) {
  return CONTRACT_COMMANDS.js(target, {});
}
function failedCaseNames(evidence_json) {
  const names = [];
  for (const suite of asArray(asRecord(evidence_json).testResults)) {
    for (const test of asArray(asRecord(suite).assertionResults)) {
      const record = asRecord(test);
      if (asString(record.status) !== "failed") continue;
      names.push(asString(record.fullName) || asString(record.title) || "(\u672A\u547D\u540D\u7528\u4F8B)");
    }
  }
  return names;
}
function checkTestEvidence(evidence_json, evidence, command) {
  if (evidence_json === null) return missingEvidence(evidence, command);
  const root = asRecord(evidence_json);
  if (typeof root.numTotalTests !== "number" || typeof root.numFailedTests !== "number") {
    return {
      ok: false,
      findings: [{ location: evidence, problem: "\u8BC1\u636E\u683C\u5F0F\u4E0D\u8BA4\u8BC6\uFF1A\u7F3A numTotalTests / numFailedTests\uFF0C\u786E\u8BA4\u7528\u7684\u662F vitest --reporter=json" }],
      stats: {}
    };
  }
  const total = asNumber(root.numTotalTests);
  const failed = asNumber(root.numFailedTests);
  const findings = [];
  if (typeof root.exitcode === "number" && root.exitcode !== 0 && failed === 0) {
    findings.push({
      location: evidence,
      problem: `\u6D4B\u8BD5\u8FD0\u884C\u9000\u51FA\u7801 ${root.exitcode}\uFF08\u975E 0\uFF09\uFF1A\u5373\u4F7F\u8BA1\u6570\u503C\u50CF\u5168\u8FC7\uFF0C\u4E5F\u5224\u4E0D\u5408\u683C\uFF08fail-closed\uFF09`
    });
  }
  if (total <= 0) {
    findings.push({ location: evidence, problem: "\u8BC1\u636E\u91CC\u6CA1\u6709\u4EFB\u4F55\u7528\u4F8B\uFF1A\u7A7A\u8DD1\u4E0D\u7B97\u9A8C\u8BC1\uFF080 \u4E2A\u7528\u4F8B \u2260 \u5168\u8FC7\uFF09" });
  }
  if (failed > 0) {
    const names = failedCaseNames(evidence_json);
    if (names.length === 0) findings.push({ location: evidence, problem: `${failed} \u4E2A\u7528\u4F8B\u5931\u8D25` });
    else for (const name of names) findings.push({ location: name, problem: "\u7528\u4F8B\u5931\u8D25" });
  }
  if (root.success === false && failed === 0) {
    findings.push({ location: evidence, problem: "\u6D4B\u8BD5\u62A5\u544A\u6807\u4E86 success=false\uFF0C\u4F46\u6CA1\u7ED9\u51FA\u5931\u8D25\u6570\uFF1A\u8BC1\u636E\u4E0D\u5B8C\u6574" });
  }
  return { ok: findings.length === 0, findings, stats: { total, failed } };
}
var contractChecker = {
  id: "contract",
  name: "\u5951\u7EA6\u6D4B\u8BD5",
  evidence: EVIDENCE,
  defaultTarget: DEFAULT_TARGET,
  autoRun: true,
  buildCommands: CONTRACT_COMMANDS,
  normalizers: { python: normalizePytestReport },
  buildCommand,
  check(evidence_json) {
    return checkTestEvidence(evidence_json, EVIDENCE, buildCommand(DEFAULT_TARGET));
  }
};

// src/engine/checkers/boundary.ts
var EVIDENCE2 = "boundary.json";
var DEFAULT_TARGET2 = "test/boundary";
var BOUNDARY_COMMANDS = {
  js: (target) => `vitest run ${target} --reporter=json --outputFile=.workflow/evidence/${EVIDENCE2}`,
  python: (_target, tools) => `"${tools.projectPython ?? tools.python ?? "python"}" -m pytest --json-report --json-report-file=.workflow/evidence/${EVIDENCE2}`
};
function buildCommand2(target) {
  return BOUNDARY_COMMANDS.js(target, {});
}
var boundaryChecker = {
  id: "boundary",
  name: "\u8FB9\u754C\u6D4B\u8BD5",
  evidence: EVIDENCE2,
  defaultTarget: DEFAULT_TARGET2,
  autoRun: true,
  buildCommands: BOUNDARY_COMMANDS,
  normalizers: { python: normalizePytestReport },
  buildCommand: buildCommand2,
  check(evidence_json) {
    return checkTestEvidence(evidence_json, EVIDENCE2, buildCommand2(DEFAULT_TARGET2));
  }
};

// src/engine/checkers/build.ts
var EVIDENCE3 = "build.json";
var buildChecker = {
  id: "build",
  name: "\u6784\u5EFA\u4E0E\u5192\u70DF",
  evidence: EVIDENCE3,
  defaultTarget: "",
  autoRun: true,
  script: "build-check.mjs",
  check(evidence_json) {
    if (evidence_json === null) return missingEvidence(EVIDENCE3, "node scripts/build-check.mjs");
    const root = asRecord(evidence_json);
    if (root.skipped === true) {
      return {
        ok: true,
        findings: [],
        stats: { skipped: 1 },
        note: asString(root.reason) || "\u672C\u6808\u6CA1\u6709 build \u6B65\u9AA4\uFF0C\u8DF3\u8FC7"
      };
    }
    if (typeof root.build_exit !== "number") {
      return {
        ok: false,
        findings: [{ location: EVIDENCE3, problem: "\u8BC1\u636E\u683C\u5F0F\u4E0D\u8BA4\u8BC6\uFF1A\u7F3A build_exit\uFF0C\u786E\u8BA4\u7528\u7684\u662F build-check.mjs" }],
        stats: {}
      };
    }
    const buildExit = asNumber(root.build_exit);
    const smokeExit = asNumber(root.smoke_exit);
    const stats = { build_exit: buildExit, smoke_exit: smokeExit, bytes: asNumber(root.bytes) };
    if (buildExit !== 0) {
      return { ok: false, findings: [{ location: EVIDENCE3, problem: `build \u5931\u8D25\uFF08exit=${buildExit}\uFF09` }], stats };
    }
    if (smokeExit !== 0) {
      return { ok: false, findings: [{ location: EVIDENCE3, problem: `smoke \u5931\u8D25\uFF08exit=${smokeExit}\uFF09` }], stats };
    }
    return { ok: true, findings: [], stats };
  }
};

// src/engine/checkers/deadcode.ts
var EVIDENCE4 = "deadcode.json";
var VULTURE_EXCLUDE = ".venv,venv,.git,node_modules,.tox,.pixi,.mypy_cache,.pytest_cache,.ruff_cache";
var DEADCODE_COMMANDS = {
  js: () => `knip --reporter json > .workflow/evidence/${EVIDENCE4}`,
  python: (_target, tools) => `"${tools.python ?? "python"}" -m vulture . --exclude ${VULTURE_EXCLUDE} > .workflow/evidence/${EVIDENCE4}`
};
function buildCommand3(_target) {
  return DEADCODE_COMMANDS.js(_target, {});
}
var UNUSED_KEYS = ["exports", "types", "dependencies", "devDependencies", "unlisted"];
var deadcodeChecker = {
  id: "deadcode",
  name: "\u6B7B\u4EE3\u7801\u626B\u63CF",
  evidence: EVIDENCE4,
  defaultTarget: "",
  autoRun: true,
  buildCommands: DEADCODE_COMMANDS,
  normalizers: { python: normalizeVulture },
  buildCommand: buildCommand3,
  check(evidence_json) {
    if (evidence_json === null) return missingEvidence(EVIDENCE4, buildCommand3(""));
    const root = asRecord(evidence_json);
    if (!Array.isArray(root.issues)) {
      return {
        ok: false,
        findings: [{ location: EVIDENCE4, problem: "\u8BC1\u636E\u683C\u5F0F\u4E0D\u8BA4\u8BC6\uFF1A\u7F3A issues \u6570\u7EC4\uFF0C\u786E\u8BA4\u7528\u7684\u662F knip --reporter json" }],
        stats: {}
      };
    }
    const findings = [];
    for (const issue of asArray(root.issues)) {
      const record = asRecord(issue);
      const message = asString(record.message);
      if (message !== "") {
        const file2 = asString(record.file) || EVIDENCE4;
        const line = asNumber(record.line);
        findings.push({ location: line > 0 ? `${file2}:${line}` : file2, problem: message });
        continue;
      }
      const file = asString(record.file) || EVIDENCE4;
      for (const item of asArray(record.files)) {
        const name = asString(asRecord(item).name) || asString(item);
        if (name !== "") findings.push({ location: name, problem: "\u6587\u4EF6\u6CA1\u6709\u88AB\u4EFB\u4F55\u6A21\u5757\u5F15\u7528" });
      }
      for (const key of UNUSED_KEYS) {
        for (const item of asArray(record[key])) {
          const entry = asRecord(item);
          const name = asString(entry.name) || asString(item) || "(\u672A\u547D\u540D)";
          findings.push({ location: `${file} \u2192 ${name}`, problem: `\u672A\u4F7F\u7528\u7684 ${key}` });
        }
      }
    }
    return { ok: findings.length === 0, findings, stats: { findings: findings.length } };
  }
};

// src/engine/checkers/deps.ts
var EVIDENCE5 = "deps.json";
var DEFAULT_TARGET3 = "src";
var DEPS_COMMANDS = {
  js: (target) => `depcruise ${target} --output-type json --output-to .workflow/evidence/${EVIDENCE5}`,
  // --no-cache：不在项目根留 .import_linter_cache（证据目录自带 .gitignore，缓存不该进仓库）。
  python: (_target, tools) => `"${tools.lintImports ?? "lint-imports"}" --no-cache > .workflow/evidence/${EVIDENCE5}`
};
function buildCommand4(target) {
  return DEPS_COMMANDS.js(target, {});
}
var depsChecker = {
  id: "deps",
  name: "\u4F9D\u8D56\u68C0\u67E5",
  evidence: EVIDENCE5,
  defaultTarget: DEFAULT_TARGET3,
  autoRun: true,
  buildCommands: DEPS_COMMANDS,
  normalizers: { python: normalizeImportLinter },
  buildCommand: buildCommand4,
  check(evidence_json) {
    if (evidence_json === null) return missingEvidence(EVIDENCE5, buildCommand4(DEFAULT_TARGET3));
    const summary = asRecord(asRecord(evidence_json).summary);
    if (!Array.isArray(summary.violations)) {
      return {
        ok: false,
        findings: [{ location: EVIDENCE5, problem: "\u8BC1\u636E\u683C\u5F0F\u4E0D\u8BA4\u8BC6\uFF1A\u7F3A summary.violations\uFF0C\u786E\u8BA4\u7528\u7684\u662F depcruise --output-type json" }],
        stats: {}
      };
    }
    const violations = asArray(summary.violations);
    const findings = [];
    let errors = 0;
    for (const item of violations) {
      const violation = asRecord(item);
      const rule = asRecord(violation.rule);
      const severity = asString(rule.severity) || "error";
      if (severity !== "error") continue;
      errors += 1;
      const from = asString(violation.from) || "(\u672A\u77E5\u6765\u6E90)";
      const to = asString(violation.to) || "(\u672A\u77E5\u76EE\u6807)";
      findings.push({ location: `${from} \u2192 ${to}`, problem: `\u8FDD\u53CD\u4F9D\u8D56\u89C4\u5219\uFF1A${asString(rule.name) || "\u672A\u547D\u540D\u89C4\u5219"}` });
    }
    return {
      ok: errors === 0,
      findings,
      stats: { errors, violations: violations.length, modules: asNumber(summary.totalCruised) }
    };
  }
};

// src/schema/instrumentation.ts
function instrumentationKey(fn, event) {
  return `${fn}::${event}`;
}

// src/engine/instrumentation-rules.ts
var INSTRUMENTATION_LIMITS = {
  maxDepth: 4,
  maxChildren: 5,
  maxTreeNodes: 50,
  maxKvNodes: 200
};
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isInstrument(value) {
  if (!isRecord(value)) return false;
  return typeof value.function === "string" && value.function !== "" && typeof value.event === "string" && value.event !== "" && typeof value.tree_version === "number" && Number.isInteger(value.tree_version) && value.tree_version >= 1 && (value.kind === "path" || value.kind === "field");
}
function isTreeNode(value, depth = 0) {
  if (depth > 100) return false;
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && value.id !== "" && typeof value.label === "string" && (value.instrument === void 0 || isInstrument(value.instrument)) && Array.isArray(value.children) && value.children.every((child) => isTreeNode(child, depth + 1));
}
function sameInstrument(a, b) {
  return a.function === b.function && a.event === b.event && a.kind === b.kind && a.tree_version === b.tree_version;
}
function validateInstrumentation(raw, limits = INSTRUMENTATION_LIMITS) {
  const findings = [];
  const stats = {};
  const root = isRecord(raw) ? raw.root : void 0;
  const nodes = isRecord(raw) ? raw.nodes : void 0;
  const planVersion = isRecord(raw) ? raw.tree_version : void 0;
  const hasPlan = typeof planVersion === "number" && Number.isInteger(planVersion) && planVersion >= 1 && isTreeNode(root);
  if (!hasPlan) {
    return {
      ok: false,
      findings: [],
      stats: { config_missing: 1 },
      note: "\u7F3A\u57CB\u70B9\u8BA1\u5212\uFF08.workflow/evidence/instrumentation.json \u7684 tree_version + tree.root\uFF09\uFF1A\u8FD9\u4E00\u5C42\u8FD8\u6CA1\u505A\uFF0C\u4E0D\u7B97\u7ED3\u6784\u4E0D\u5408\u683C\uFF1B\u5148\u6309\u683C\u5F0F\u5199 tree + \u8282\u70B9 KV \u518D\u8DD1"
    };
  }
  if (!isRecord(nodes)) {
    return {
      ok: false,
      findings: [],
      stats: { config_missing: 1 },
      note: "\u7F3A\u8282\u70B9 KV\uFF08nodes\uFF09\uFF1A\u57CB\u70B9\u8BA1\u5212\u4E0D\u5B8C\u6574\uFF0C\u5148\u8865\u9F50\u518D\u8DD1"
    };
  }
  const expectedVersion = typeof planVersion === "number" ? planVersion : root.instrument?.tree_version ?? 1;
  if (root.id !== "none") {
    findings.push({ location: `root:${root.id}`, problem: "\u6839\u8282\u70B9 id \u5FC5\u987B\u662F none" });
  }
  if (root.instrument !== void 0) {
    findings.push({ location: `root:${root.id}`, problem: "\u6839\u8282\u70B9\u53EA\u662F\u6807\u9898\uFF0C\u4E0D\u8BE5\u5E26\u57CB\u70B9\u4FE1\u606F" });
  }
  let total = 0;
  let maxDepth = 0;
  let duplicates = 0;
  const treeKeys = /* @__PURE__ */ new Set();
  const reachableKeys = /* @__PURE__ */ new Set();
  const walk = (node, depth) => {
    total += 1;
    if (depth > maxDepth) maxDepth = depth;
    if (node.children.length > limits.maxChildren) {
      findings.push({ location: node.id, problem: `\u5B50\u8282\u70B9 ${node.children.length} \u4E2A\uFF0C\u8D85\u8FC7\u4E0A\u9650 ${limits.maxChildren}` });
    }
    if (depth >= 2 && node.instrument === void 0) {
      findings.push({ location: node.id, problem: "\u8DEF\u5F84\u8282\u70B9\u7F3A\u57CB\u70B9\u4FE1\u606F\uFF08\u51FD\u6570\u540D / \u4E8B\u4EF6\u540D\uFF09" });
    } else if (depth === 1 && node.instrument !== void 0) {
      findings.push({ location: node.id, problem: "bug \u6807\u7B7E\u8282\u70B9\u53EA\u662F\u6807\u9898\uFF0C\u4E0D\u8BE5\u5E26\u57CB\u70B9\u4FE1\u606F" });
    }
    if (node.instrument !== void 0) {
      const key = instrumentationKey(node.instrument.function, node.instrument.event);
      reachableKeys.add(key);
      if (treeKeys.has(key)) {
        duplicates += 1;
        findings.push({ location: node.id, problem: `\u91CD\u590D\u57CB\u70B9\uFF1A\u540C\u4E00\u843D\u70B9 ${key} \u5728\u6811\u4E0A\u51FA\u73B0\u4E86\u591A\u6B21` });
      } else {
        treeKeys.add(key);
      }
      const kv = nodes[key];
      if (!isInstrument(kv)) {
        findings.push({ location: node.id, problem: `KV \u7F3A\u8282\u70B9 ${key}\uFF08\u6811\u4E0A\u7684\u57CB\u70B9\u5FC5\u987B\u8FDB KV\uFF09` });
      } else if (!sameInstrument(node.instrument, kv)) {
        findings.push({ location: node.id, problem: `KV \u4E0E\u6811\u8282\u70B9\u4E0D\u4E00\u81F4\uFF1A${key}` });
      }
      if (node.instrument.tree_version !== expectedVersion) {
        findings.push({ location: node.id, problem: `\u7248\u672C\u4E0D\u4E00\u81F4\uFF1A\u8282\u70B9\u662F v${node.instrument.tree_version}\uFF0C\u8BA1\u5212\u662F v${expectedVersion}` });
      }
    }
    for (const child of node.children) walk(child, depth + 1);
  };
  walk(root, 0);
  if (maxDepth > limits.maxDepth) {
    findings.push({ location: "tree", problem: `\u6811\u6DF1 ${maxDepth} \u8D85\u8FC7\u4E0A\u9650 ${limits.maxDepth}` });
  }
  if (total > limits.maxTreeNodes) {
    findings.push({ location: "tree", problem: `\u6811\u8282\u70B9 ${total} \u4E2A\uFF0C\u8D85\u8FC7\u4E0A\u9650 ${limits.maxTreeNodes}` });
  }
  const kvKeys = Object.keys(nodes);
  if (kvKeys.length > limits.maxKvNodes) {
    findings.push({ location: "instrumentation.json", problem: `\u8282\u70B9 KV ${kvKeys.length} \u6761\uFF0C\u8D85\u8FC7\u4E0A\u9650 ${limits.maxKvNodes}` });
  }
  let orphans = 0;
  for (const key of kvKeys) {
    const kv = nodes[key];
    if (!isInstrument(kv)) {
      findings.push({ location: key, problem: "KV \u91CC\u7684\u8282\u70B9\u5F62\u72B6\u4E0D\u5408\u6CD5" });
      continue;
    }
    if (kv.kind === "path" && !reachableKeys.has(key)) {
      orphans += 1;
      findings.push({ location: key, problem: "\u5B64\u513F\u8282\u70B9\uFF1A\u9ED1\u76D2\u8DEF\u5F84\u8282\u70B9\u5728 KV \u91CC\uFF0C\u4F46\u6811\u4E0A\u627E\u4E0D\u5230\u5B83" });
    }
    if (kv.tree_version !== expectedVersion) {
      findings.push({ location: key, problem: `\u7248\u672C\u4E0D\u4E00\u81F4\uFF1AKV \u8282\u70B9\u662F v${kv.tree_version}\uFF0C\u8BA1\u5212\u662F v${expectedVersion}` });
    }
  }
  return {
    ok: findings.length === 0,
    findings,
    stats: {
      tree_nodes: total,
      max_depth: maxDepth,
      kv_nodes: kvKeys.length,
      duplicates,
      orphans
    }
  };
}

// src/engine/checkers/instrumentation.ts
var EVIDENCE6 = "instrumentation.json";
var PLAN_FORMAT_HINT = '{"tree_version":1,"root":{"id":"none","label":"none","children":[{"id":"bug-1","label":"\u73B0\u8C61","children":[{"id":"p-1","label":"\u73AF\u8282","instrument":{"function":"\u51FD\u6570\u540D","event":"\u4E8B\u4EF6\u540D","tree_version":1,"kind":"path"},"children":[]}]}]},"nodes":{"\u51FD\u6570\u540D::\u4E8B\u4EF6\u540D":{"function":"\u51FD\u6570\u540D","event":"\u4E8B\u4EF6\u540D","tree_version":1,"kind":"path"}}}\u3002\u89C4\u5219\uFF1A\u6839 id \u56FA\u5B9A none \u4E14\u4E0D\u5E26\u57CB\u70B9\uFF1B\u6839\u7684\u76F4\u63A5\u5B50\u8282\u70B9\u662F bug \u6807\u7B7E\u3001\u4E0D\u5E26\u57CB\u70B9\uFF1B\u6DF1\u5EA6\u22652 \u7684\u8DEF\u5F84\u8282\u70B9\u5FC5\u987B\u5E26 instrument\uFF1B\u6811\u4E0A\u7684\u6BCF\u4E2A instrument \u8981\u5728 nodes \u91CC\u6709\u540C key \u4E14\u4E00\u81F4\uFF1B\u6DF1\u5EA6\u22644\u3001\u6BCF\u8282\u70B9\u5B50\u22645\u3001\u6811\u226450 \u8282\u70B9\u3001KV\u2264200\u3002';
var instrumentationChecker = {
  id: "instrumentation",
  name: "\u57CB\u70B9\u68C0\u6D4B",
  evidence: EVIDENCE6,
  // 埋点树是项目资产（跟项目走、可提交、可 review），放项目根而不是 .workflow/evidence/。
  evidenceAtProjectRoot: true,
  defaultTarget: "",
  autoRun: true,
  script: "instrument-apply.mjs",
  check(evidence_json, context) {
    const stack = context?.stack;
    if (typeof stack === "string" && stack !== "" && stack !== "js" && stack !== "python") {
      return {
        ok: false,
        findings: [],
        stats: {},
        unsupported: `\u57CB\u70B9\u68C0\u6D4B\u53EA\u652F\u6301 js / python\uFF0C\u5F53\u524D\u6808\u662F ${stack}`
      };
    }
    const result = validateInstrumentation(evidence_json);
    if (result.stats.config_missing === 1) {
      return {
        ...result,
        note: `${result.note ?? ""}\u3000\u5DE5\u5177\u5DF2\u6309\u4EE3\u7801\u91CC\u7684\u51FD\u6570\u751F\u6210\u8349\u7A3F\uFF08\u9879\u76EE\u6839\u7684 instrumentation-skeleton.json\uFF09\uFF1A\u6539 label / event \u6574\u7406\u6210\u6392\u67E5\u8DEF\u5F84\uFF0C\u5B58\u6210**\u9879\u76EE\u6839\u7684 instrumentation.json**\uFF08\u8DDF\u4ED3\u5E93\u8D70\u3001\u53EF\u63D0\u4EA4\uFF09\u518D\u8DD1\u3002\u5DE5\u5177\u4F1A\u6309\u8BA1\u5212\u628A\u7F3A\u5931\u57CB\u70B9\u63D2\u8FDB\u6E90\u7801\uFF08\u6CA1\u57CB\u70B9\u7684\u9879\u76EE\u9760\u8FD9\u4E00\u6B65\u5EFA\u6811\uFF0C\u5C5E\u6B63\u5E38\u4EA4\u4ED8\uFF09\uFF1B\u5DF2\u6709\u540C\u4E8B\u4EF6\u4F1A\u8DF3\u8FC7\u3001\u4E0D\u91CD\u590D\u63D2\u3002\u683C\u5F0F\uFF1A${PLAN_FORMAT_HINT}`
      };
    }
    return result;
  }
};

// src/engine/checkers/naming.ts
var EVIDENCE7 = "naming.json";
var namingChecker = {
  id: "naming",
  name: "\u547D\u540D\u5BA1\u67E5",
  evidence: EVIDENCE7,
  defaultTarget: "",
  autoRun: true,
  script: "naming-scan.mjs",
  check(evidence_json) {
    if (evidence_json === null) return missingEvidence(EVIDENCE7, "node scripts/naming-scan.mjs");
    const root = asRecord(evidence_json);
    if (!Array.isArray(root.violations)) {
      return {
        ok: false,
        findings: [{ location: EVIDENCE7, problem: "\u8BC1\u636E\u683C\u5F0F\u4E0D\u8BA4\u8BC6\uFF1A\u7F3A violations\uFF0C\u786E\u8BA4\u7528\u7684\u662F naming-scan.mjs" }],
        stats: {}
      };
    }
    const findings = [];
    for (const item of asArray(root.violations)) {
      const record = asRecord(item);
      const word = asString(record.word) || "(\u672A\u77E5)";
      const file = asString(record.file) || EVIDENCE7;
      const line = asNumber(record.line);
      const isNew = record.new;
      const prefix = isNew === true ? "[\u65B0\u589E] " : isNew === false ? "[\u5B58\u91CF] " : "";
      findings.push({
        location: line > 0 ? `${file}:${line}` : file,
        problem: `${prefix}\u5C01\u6740\u8BCD\u300C${word}\u300D\uFF1A\u540D\u5B57\u8981\u5199\u51FA\u542B\u4E49\uFF0C\u522B\u7528\u6CDB\u5316\u8BCD`
      });
    }
    const scanned = asNumber(root.scanned);
    return { ok: findings.length === 0, findings, stats: { scanned, findings: findings.length } };
  }
};

// src/engine/checkers/regression.ts
var EVIDENCE8 = "regression.json";
function buildCommand5(target) {
  return `autocannon ${target} -j > .workflow/evidence/${EVIDENCE8}`;
}
var regressionChecker = {
  id: "regression",
  name: "\u56DE\u5F52\u4E0E\u538B\u6D4B",
  evidence: EVIDENCE8,
  defaultTarget: "",
  autoRun: true,
  requiresTarget: true,
  buildCommand: buildCommand5,
  check(evidence_json) {
    if (evidence_json === null) return missingEvidence(EVIDENCE8, `${buildCommand5("http://127.0.0.1:3000")}`);
    const root = asRecord(evidence_json);
    if (typeof root.requests === "object" && root.requests !== null) {
      const requests = asRecord(root.requests);
      const total = asNumber(requests.total) || asNumber(requests.average) || asNumber(requests.sent);
      const failed = asNumber(root.errors) + asNumber(root.timeouts);
      const durationMs = Math.round(asNumber(root.duration) * 1e3);
      const findings = [];
      if (total <= 0) findings.push({ location: EVIDENCE8, problem: "\u538B\u6D4B\u6CA1\u6709\u4EA7\u751F\u4EFB\u4F55\u8BF7\u6C42\uFF1A\u7A7A\u8DD1\u4E0D\u7B97\u9A8C\u8BC1" });
      if (failed > 0) findings.push({ location: EVIDENCE8, problem: `${failed}/${total} \u4E2A\u8BF7\u6C42\u5931\u8D25\uFF08\u9519\u8BEF + \u8D85\u65F6\uFF09` });
      return { ok: findings.length === 0, findings, stats: { total, failed, durationMs } };
    }
    if (typeof root.total === "number" && typeof root.failed === "number") {
      const total = asNumber(root.total);
      const failed = asNumber(root.failed);
      const durationMs = asNumber(root.durationMs);
      const findings = [];
      if (total <= 0) findings.push({ location: EVIDENCE8, problem: "\u8BC1\u636E\u91CC\u6CA1\u6709\u4EFB\u4F55\u7528\u4F8B\uFF1A\u7A7A\u8DD1\u4E0D\u7B97\u56DE\u5F52\u9A8C\u8BC1" });
      if (failed > 0) findings.push({ location: EVIDENCE8, problem: `${failed}/${total} \u4E2A\u7528\u4F8B\u5931\u8D25` });
      return { ok: findings.length === 0, findings, stats: { total, failed, durationMs } };
    }
    return {
      ok: false,
      findings: [{ location: EVIDENCE8, problem: "\u8BC1\u636E\u683C\u5F0F\u4E0D\u8BA4\u8BC6\uFF1A\u65E2\u4E0D\u662F autocannon \u539F\u59CB\u7ED3\u679C\uFF0C\u4E5F\u4E0D\u662F { total, failed, durationMs }" }],
      stats: {}
    };
  }
};

// src/engine/checkers/index.ts
var CHECKERS = [
  contractChecker,
  depsChecker,
  deadcodeChecker,
  boundaryChecker,
  regressionChecker,
  instrumentationChecker,
  namingChecker,
  buildChecker
];
var CHECKER_IDS = CHECKERS.map((checker) => checker.id);
function findChecker(id) {
  return CHECKERS.find((checker) => checker.id === id);
}

// src/engine/tool-policy.ts
var FACTORY_TOOLS = [...BASE_TOOLS, ...EXTENSION_TOOLS];
function deny(code, message) {
  return { allow: false, code, message };
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stateLabel(state) {
  return NODE_STATE_LABEL[state] ?? state;
}
function statesText(states) {
  return states.map(stateLabel).join(" / ");
}
function visibleTools(entries, state) {
  return entries.filter((entry) => entry.allowed_states.includes(state));
}
function validateValue(schema, value, path2) {
  if (schema.anyOf !== void 0) {
    const problems = [];
    for (const option of schema.anyOf) {
      const problem = validateValue(option, value, path2);
      if (problem === void 0) return void 0;
      problems.push(problem);
    }
    return problems[0] ?? `${path2} \u4E0D\u5339\u914D\u4EFB\u4F55\u5141\u8BB8\u7684\u7C7B\u578B`;
  }
  switch (schema.type) {
    case "string":
      if (typeof value !== "string") return `${path2} \u5E94\u4E3A\u5B57\u7B26\u4E32`;
      break;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return `${path2} \u5E94\u4E3A\u6570\u5B57`;
      break;
    case "boolean":
      if (typeof value !== "boolean") return `${path2} \u5E94\u4E3A\u5E03\u5C14\u503C`;
      break;
    case "array":
      if (!Array.isArray(value)) return `${path2} \u5E94\u4E3A\u6570\u7EC4`;
      if (schema.items !== void 0) {
        for (let index = 0; index < value.length; index += 1) {
          const problem = validateValue(schema.items, value[index], `${path2}[${index}]`);
          if (problem !== void 0) return problem;
        }
      }
      break;
    case "object": {
      if (!isPlainObject(value)) return `${path2} \u5E94\u4E3A\u5BF9\u8C61`;
      const properties = schema.properties ?? {};
      for (const key of schema.required ?? []) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) return `${path2}.${key} \u7F3A\u5931\uFF08\u5FC5\u586B\uFF09`;
      }
      for (const [key, item] of Object.entries(value)) {
        const property = properties[key];
        if (property === void 0) {
          if (schema.additionalProperties === false) return `${path2}.${key} \u4E0D\u662F\u53EF\u63A5\u53D7\u7684\u53C2\u6570`;
          continue;
        }
        const problem = validateValue(property, item, `${path2}.${key}`);
        if (problem !== void 0) return problem;
      }
      break;
    }
    default:
      return `${path2} \u7684 schema \u7C7B\u578B\u672A\u77E5`;
  }
  if (schema.enum !== void 0 && !schema.enum.includes(String(value))) {
    return `${path2} \u53EA\u80FD\u662F ${schema.enum.join(" / ")}`;
  }
  return void 0;
}
function validateToolArgs(schema, args) {
  if (!isPlainObject(args)) return "args \u5FC5\u987B\u662F\u5BF9\u8C61";
  return validateValue({ ...schema, type: "object" }, args, "args");
}
function decideToolCall(input) {
  const { entry } = input;
  if (!entry.allowed_states.includes(input.state)) {
    return deny(
      "stage-denied",
      `\u5F53\u524D\u72B6\u6001\u300C${stateLabel(input.state)}\u300D\u4E0D\u5141\u8BB8\u8C03\u7528 ${entry.name}\uFF08\u5141\u8BB8\uFF1A${statesText(entry.allowed_states)}\uFF09\u3002`
    );
  }
  const args = input.args === void 0 || input.args === null ? {} : input.args;
  if (!isPlainObject(args)) return deny("arguments-invalid", `${entry.name} \u7684 args \u5FC5\u987B\u662F\u5BF9\u8C61\u3002`);
  const problem = validateToolArgs(entry.parameters, args);
  if (problem !== void 0) return deny("arguments-invalid", `${entry.name} \u53C2\u6570\u4E0D\u7B26\uFF1A${problem}\u3002`);
  return { allow: true };
}
function summarizeArgs(args, maxChars = 240) {
  let text;
  try {
    text = JSON.stringify(args ?? {});
  } catch {
    text = "[unserializable]";
  }
  const flat = text.replace(/\s+/g, " ");
  return flat.length > maxChars ? `${flat.slice(0, maxChars)}\u2026` : flat;
}
function summarizeDescription(description, maxChars = 90) {
  const firstSentence = description.split("\u3002")[0]?.trim() ?? "";
  const text = firstSentence === "" ? description.trim() : `${firstSentence}\u3002`;
  return Array.from(text).length > maxChars ? `${Array.from(text).slice(0, maxChars).join("")}\u2026` : text;
}
function renderCatalogText(entries, state) {
  const lines = [
    "\u3010\u5DE5\u5177\u76EE\u5F55\u3011\u6A21\u578B\u53EA\u80FD\u901A\u8FC7 workflow_tool_call({name,args}) \u8C03\u7528\u4E0B\u5217\u5DE5\u5177\uFF1B\u65B0\u589E\u5DE5\u5177\u7528 workflow_tool_add\uFF08\u767B\u8BB0\u4E0E\u66F4\u65B0\u90FD\u8981\u7528\u6237\u540C\u610F\u540E\u624D\u751F\u6548\uFF09\u3002"
  ];
  for (const entry of visibleTools(entries, state)) {
    const required = entry.parameters.required ?? [];
    const requiredText = required.length > 0 ? `\u5FC5\u586B\uFF1A${required.join(",")}` : "\u65E0\u5FC5\u586B\u53C2\u6570";
    lines.push(`- ${entry.name}\uFF08${statesText(entry.allowed_states)}\u53EF\u7528\uFF1B${requiredText}\uFF09${summarizeDescription(entry.description)}`);
  }
  return lines.join("\n");
}

// src/engine/degrade.ts
function hasMachineDriver(checker, stack) {
  if (checker.script !== void 0) return stack === "js";
  if (checker.buildCommands !== void 0) {
    return stack !== null && typeof checker.buildCommands[stack] === "function";
  }
  return typeof checker.buildCommand === "function";
}

// src/host/command-runner.ts
import { spawn } from "node:child_process";
import { delimiter } from "node:path";
var COMMAND_TIMEOUT_MS = 12e4;
var TAIL_LIMIT = 4096;
function runCommand(input) {
  return new Promise((resolve5) => {
    const startedAt = Date.now();
    const timeoutMs = typeof input.timeoutMs === "number" && input.timeoutMs > 0 ? input.timeoutMs : COMMAND_TIMEOUT_MS;
    let tail = "";
    let timedOut = false;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve5(result);
    };
    let child;
    try {
      const env = typeof input.binDir === "string" && input.binDir !== "" ? { ...process.env, PATH: `${input.binDir}${delimiter}${process.env.PATH ?? ""}` } : void 0;
      child = spawn(input.command, {
        cwd: input.cwd,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env
      });
    } catch (error) {
      finish({
        ok: false,
        exit_code: null,
        timed_out: false,
        ms: Date.now() - startedAt,
        tail: `[spawn failed] ${String(error?.message ?? error)}`
      });
      return;
    }
    const collect = (chunk) => {
      tail += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (tail.length > TAIL_LIMIT) tail = tail.slice(-TAIL_LIMIT);
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        const pid = child.pid;
        if (typeof pid === "number") {
          if (process.platform === "win32") {
            spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
          } else {
            child.kill("SIGKILL");
          }
        }
      } catch {
      }
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        exit_code: null,
        timed_out: timedOut,
        ms: Date.now() - startedAt,
        tail: `${tail}
[spawn failed] ${String(error?.message ?? error)}`.trim()
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const exitCode = typeof code === "number" ? code : null;
      finish({
        ok: !timedOut && exitCode === 0,
        exit_code: exitCode,
        timed_out: timedOut,
        ms: Date.now() - startedAt,
        tail
      });
    });
  });
}

// src/host/stack-detect.ts
import { access } from "node:fs/promises";
import { dirname as dirname3, join as join4, resolve as resolve2 } from "node:path";

// src/engine/checkers/stack.ts
function stackFromMarkers(markers) {
  if (markers.pyproject) return "python";
  if (markers.packageJson) return "js";
  return null;
}

// src/host/stack-detect.ts
async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
async function detectStack(workingDirectory) {
  if (typeof workingDirectory !== "string" || workingDirectory === "") return { stack: null, root: null };
  let dir = resolve2(workingDirectory);
  for (; ; ) {
    const [pyproject, packageJson] = await Promise.all([
      exists(join4(dir, "pyproject.toml")),
      exists(join4(dir, "package.json"))
    ]);
    const stack = stackFromMarkers({ pyproject, packageJson });
    if (stack !== null) return { stack, root: dir };
    const parent = dirname3(dir);
    if (parent === dir) return { stack: null, root: null };
    dir = parent;
  }
}

// src/host/project-root.ts
import { access as access2, readdir } from "node:fs/promises";
import { dirname as dirname4, join as join5, resolve as resolve3 } from "node:path";
async function exists2(file) {
  try {
    await access2(file);
    return true;
  } catch {
    return false;
  }
}
async function nearestProject(path2) {
  let dir = resolve3(path2);
  for (; ; ) {
    const [pyproject, packageJson] = await Promise.all([
      exists2(join5(dir, "pyproject.toml")),
      exists2(join5(dir, "package.json"))
    ]);
    const stack = stackFromMarkers({ pyproject, packageJson });
    if (stack !== null) return { root: dir, stack };
    const parent = dirname4(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
async function listCandidateProjects(workingDirectory) {
  const candidates = [];
  const base = resolve3(workingDirectory);
  const self = await nearestProject(base);
  if (self !== null && self.root === base) candidates.push(base);
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return candidates;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const child = join5(base, entry.name);
    const found = await nearestProject(child);
    if (found !== null && found.root === resolve3(child) && !candidates.includes(found.root)) {
      candidates.push(found.root);
    }
  }
  return candidates;
}
async function resolveProjects(workingDirectory, scope) {
  const projects = [];
  for (const path2 of scope) {
    const found = await nearestProject(resolve3(workingDirectory, path2));
    if (found !== null && !projects.some((project) => project.root === found.root)) {
      projects.push(found);
    }
  }
  if (projects.length > 0) return { projects, candidates: [] };
  const fallback = await nearestProject(workingDirectory);
  if (fallback !== null) return { projects: [fallback], candidates: [] };
  return { projects: [], candidates: await listCandidateProjects(workingDirectory) };
}

// src/host/tool-locate.ts
import { access as access3 } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as dirname5, join as join6 } from "node:path";
async function defaultExists(file) {
  try {
    await access3(file);
    return true;
  } catch {
    return false;
  }
}
async function resolvePython(deps = {}) {
  const env = deps.env ?? process.env;
  const home = deps.home ?? homedir();
  const platform = deps.platform ?? process.platform;
  const exists3 = deps.exists ?? defaultExists;
  const fromEnv = typeof env.DSH_PYTHON === "string" ? env.DSH_PYTHON.trim() : "";
  if (fromEnv !== "" && await exists3(fromEnv)) return fromEnv;
  const candidates = platform === "win32" ? [join6(home, ".dsh", "dsh-runtimes", "dsh-primary-runtime", "dependencies", "python", "python.exe")] : [join6(home, ".dsh", "dsh-runtimes", "dsh-primary-runtime", "dependencies", "python", "bin", "python3")];
  for (const candidate of candidates) {
    if (await exists3(candidate)) return candidate;
  }
  return null;
}
function pythonScriptsDir(pythonPath) {
  const dir = dirname5(pythonPath);
  return process.platform === "win32" ? join6(dir, "Scripts") : dir;
}
function lintImportsPath(pythonPath) {
  return join6(pythonScriptsDir(pythonPath), process.platform === "win32" ? "lint-imports.exe" : "lint-imports");
}
async function resolveProjectPython(projectRoot, deps = {}) {
  const platform = deps.platform ?? process.platform;
  const exists3 = deps.exists ?? defaultExists;
  if (typeof projectRoot !== "string" || projectRoot === "") return null;
  const candidates = platform === "win32" ? [
    join6(projectRoot, ".venv", "Scripts", "python.exe"),
    join6(projectRoot, "venv", "Scripts", "python.exe")
  ] : [
    join6(projectRoot, ".venv", "bin", "python3"),
    join6(projectRoot, "venv", "bin", "python3")
  ];
  for (const candidate of candidates) {
    if (await exists3(candidate)) return candidate;
  }
  return null;
}

// src/host/workflow-tools.ts
var SIDE_EFFECT_TOOLS = /* @__PURE__ */ new Set(["write", "edit", "apply_patch", "pwsh", "bash", "notebook"]);
var ALLOWED_TRANSITIONS = {
  discussing: ["implementing"],
  implementing: ["verifying", "discussing"],
  verifying: ["completed", "implementing", "discussing"],
  completed: ["verifying", "implementing", "discussing"]
};
var STATE_ORDER = ["discussing", "implementing", "verifying", "completed"];
var WRITABLE_SECTIONS = {
  session: ["\u65B9\u6848", "\u5B9E\u65BD\u987A\u5E8F"],
  project: ["\u9879\u76EE\u603B\u89C8", "\u51B3\u7B56\u8BB0\u5F55", "\u7EA6\u675F", "\u5751\u4E0E\u9632\u7EBF", "\u6807\u7B7E\u8868"]
};
function labelOf(state) {
  return NODE_STATE_LABEL[state] ?? state;
}
function denialFor(state, toolName) {
  if (state !== "discussing") return void 0;
  return `\u5F53\u524D\u72B6\u6001\u662F\u300C\u8BA8\u8BBA\u4E2D\u300D\uFF0C\u4E0D\u5141\u8BB8\u6267\u884C ${toolName}\uFF1A\u8BA8\u8BBA\u9636\u6BB5\u53EA\u51FA\u65B9\u6848\u3001\u4E0D\u6539\u4EE3\u7801\u3002\u5148\u8C03\u7528 workflow_tool_call({ name: "workflow_advance", args: { to: "implementing" } }) \u63A8\u8FDB\u5230\u300C\u5B9E\u73B0\u4E2D\u300D\uFF08\u9700\u8981\u5148\u628A\u65B9\u6848\u5199\u8FDB\u4F1A\u8BDD\u624B\u518C\uFF09\uFF0C\u6216\u8BF7\u7528\u6237\u70B9\u72B6\u6001\u80F6\u56CA\u7684 \u2192\u3002`;
}
function extractWritePath(exec) {
  const containers = [exec?.args, exec?.arguments, exec?.input, exec?.params];
  for (const container of containers) {
    if (typeof container !== "object" || container === null || Array.isArray(container)) continue;
    for (const key of ["path", "file_path", "filePath", "file", "filename", "target", "output", "output_path", "to"]) {
      const value = container[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
  }
  return null;
}
function extractCommand(exec) {
  const containers = [exec?.args, exec?.arguments, exec?.input, exec?.params];
  for (const container of containers) {
    if (typeof container !== "object" || container === null || Array.isArray(container)) continue;
    for (const key of ["command", "cmd", "script"]) {
      const value = container[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
  }
  return null;
}
function isWithinScope(writeAbs, scopes) {
  const target = writeAbs.replace(/\\/g, "/").toLowerCase();
  for (const scope of scopes) {
    const base = scope.replace(/\\/g, "/").toLowerCase();
    if (target === base) return true;
    if (target.startsWith(`${base}/`)) return true;
  }
  return false;
}
function registerWorkflowGuard(ctx, deps) {
  ctx.inject(["tools"], (toolCtx) => {
    toolCtx.effect(() => toolCtx.tools.guard((exec) => {
      const sessionId = exec?.agent?.session?.id;
      if (!deps.isPresetSession(sessionId)) return void 0;
      const toolName = String(exec?.name ?? "");
      if (toolName === "pwsh" || toolName === "bash") {
        const cmd = extractCommand(exec);
        logEvent(ctx.logger, "info", `[workflow] command-tool invoked (session=${sessionId}, tool=${toolName}, cmd=${String(cmd ?? "").slice(0, 200)})`);
      }
      try {
        if (!SIDE_EFFECT_TOOLS.has(toolName)) {
          deps.reportGuardError?.(sessionId, null);
          return void 0;
        }
        const state = deps.getState(sessionId);
        if (state === void 0) {
          void deps.refreshState?.(sessionId);
          logEvent(ctx.logger, "warn", `[workflow] guard denied (session=${sessionId}, tool=${toolName}, state=unknown)`);
          deps.reportGuardError?.(sessionId, null);
          return `\u5F53\u524D\u4F1A\u8BDD\u7684\u5DE5\u4F5C\u6D41\u72B6\u6001\u8FD8\u6CA1\u540C\u6B65\u597D\uFF08\u72B6\u6001\u8868\u7F3A\u8FD9\u4E00\u6761\uFF09\uFF0C\u4E3A\u9632\u7ED5\u8FC7\u9636\u6BB5\u9650\u5236\uFF0C\u5148\u62E6\u4F4F\u8FD9\u6B21\u5199\u64CD\u4F5C\u3002\u5DF2\u89E6\u53D1\u540C\u6B65\uFF0C\u8BF7\u91CD\u8BD5\u4E00\u6B21\uFF1B\u82E5\u53CD\u590D\u51FA\u73B0\uFF0C\u8BF4\u660E\u8FD9\u4E2A\u4F1A\u8BDD\u8FD8\u6CA1\u7ED1\u5B9A workflow \u8282\u70B9\u3002`;
        }
        const reason = denialFor(state, toolName);
        if (reason !== void 0) {
          logEvent(ctx.logger, "info", `[workflow] guard denied (session=${sessionId}, tool=${toolName}, state=${state})`);
          deps.reportGuardError?.(sessionId, null);
          return reason;
        }
        if (state === "implementing") {
          const scopeInfo = deps.getScope?.(sessionId) ?? null;
          if (scopeInfo !== null && scopeInfo.scope.length > 0) {
            const writePath = extractWritePath(exec);
            if (writePath !== null) {
              const writeAbs = resolve4(isAbsolute(writePath) ? writePath : join7(scopeInfo.workingDir, writePath));
              const scopeAbs = scopeInfo.scope.map((scopePath) => resolve4(scopeInfo.workingDir, scopePath));
              if (!isWithinScope(writeAbs, scopeAbs)) {
                logEvent(ctx.logger, "info", `[workflow] guard denied (session=${sessionId}, tool=${toolName}, state=implementing, reason=out-of-scope)`);
                deps.reportGuardError?.(sessionId, null);
                return `\u5F53\u524D\u300C\u5B9E\u73B0\u4E2D\u300D\u7684\u5B9E\u65BD\u8303\u56F4\u53EA\u5141\u8BB8\u6539\u52A8\uFF1A${scopeInfo.scope.join(" / ")}\u3002\u8981\u5199\u300C${writePath}\u300D\u8D85\u51FA\u4E86\u58F0\u660E\u8303\u56F4\uFF1B\u5148\u8FD4\u5DE5\u56DE\u300C\u8BA8\u8BBA\u4E2D\u300D\u8865\u65B9\u6848/\u8303\u56F4\uFF08workflow_advance to: discussing\uFF0C\u5E26 reason\uFF09\uFF0C\u6216\u786E\u8BA4\u8FD9\u662F\u65B9\u6848\u91CC\u5DF2\u58F0\u660E\u7684\u6539\u52A8\u3002`;
              }
            } else {
              logEvent(ctx.logger, "info", `[workflow] guard scope-unknown (session=${sessionId}, tool=${toolName}, state=implementing)`);
            }
          }
        }
        deps.reportGuardError?.(sessionId, null);
        return void 0;
      } catch (error) {
        const message = String(error?.message ?? error);
        deps.reportGuardError?.(sessionId, message);
        logEvent(ctx.logger, "warn", `[workflow] guard-error (session=${sessionId}, tool=${toolName}): ${message}`);
        return `\u95E8\u7981\u5224\u5B9A\u65F6\u53D1\u751F\u5185\u90E8\u9519\u8BEF\uFF08\u5DF2\u6309 fail-closed \u62D2\u7EDD\u672C\u6B21\u5199\u64CD\u4F5C\uFF09\uFF1A${message}\u3002\u8FD9\u8868\u793A\u63D2\u4EF6\u672C\u8EAB\u51FA\u4E86\u95EE\u9898\uFF0C\u4E0D\u662F\u6A21\u578B\u88AB\u6B63\u5E38\u62E6\u622A\uFF1B\u8BF7\u67E5\u770B\u4E8B\u4EF6\u65E5\u5FD7\u6216\u91CD\u542F\u63D2\u4EF6\u3002`;
      }
    }));
  });
}
function renderToolCallResult(value) {
  const head = `\u5DF2\u8C03\u7528 ${value?.name ?? ""}`;
  const inner = value?.value;
  if (inner && typeof inner.checker === "string") {
    const okText = inner.ok === true ? "\u68C0\u67E5\u901A\u8FC7" : "\u68C0\u67E5\u672A\u901A\u8FC7";
    const findingsCount = Array.isArray(inner.findings) ? inner.findings.length : 0;
    const exitText = inner.exit_code === null || inner.exit_code === void 0 ? "exit=n/a" : `exit=${inner.exit_code}`;
    const problems = Array.isArray(inner.findings) ? inner.findings.map((finding) => finding?.problem ? String(finding.problem) : JSON.stringify(finding)).join("\uFF1B") : "";
    const extra = [];
    if (inner.config_missing === true) extra.push("\u7F3A\u914D\u7F6E\uFF08config_missing\uFF09");
    if (typeof inner.unsupported === "string" && inner.unsupported !== "") extra.push(`\u4E0D\u652F\u6301\uFF1A${inner.unsupported}`);
    if (Array.isArray(inner.notes)) {
      for (const note of inner.notes) {
        if (typeof note === "string" && note !== "") extra.push(note);
      }
    }
    const tail = extra.length > 0 ? `\u3000[${extra.join("\uFF1B")}]` : "";
    return `${head}\uFF08${okText}\uFF0Cfindings=${findingsCount}\uFF0C${exitText}\uFF09${problems === "" ? "" : `\uFF1A${problems}`}${tail}`;
  }
  const message = inner?.message;
  return message ? `${head}\uFF1A${message}` : head;
}
function registerWorkflowTools(ctx, deps) {
  ctx.inject(["tools"], (toolCtx) => {
    const whenWorkflow = (context) => deps.isPresetSession(context?.agent?.session?.id);
    const instrument = async (toolName, sessionId, trace, run) => {
      const startedAt = Date.now();
      try {
        const value = await run();
        logEvent(ctx.logger, "info", `[workflow] tool ${toolName} ok (session=${sessionId}, trace=${trace}, ${Date.now() - startedAt}ms)`);
        return value;
      } catch (error) {
        const message = String(error?.message ?? error);
        logEvent(ctx.logger, "warn", `[workflow] tool ${toolName} failed (session=${sessionId}, trace=${trace}, ${Date.now() - startedAt}ms): ${message}`);
        throw error;
      }
    };
    const record = (input) => deps.recordToolEvent?.(input);
    toolCtx.effect(() => toolCtx.tools.register({
      name: "workflow_tool_call",
      description: "\u8C03\u7528\u5DE5\u5177\u76EE\u5F55\u91CC\u7684\u5DE5\u5177\uFF1Aname \u662F\u76EE\u5F55\u91CC\u7684\u5DE5\u5177\u540D\uFF0Cargs \u662F\u5B83\u7684\u53C2\u6570\u3002\u76EE\u5F55\u5728\u7CFB\u7EDF\u63D0\u793A\u91CC\uFF08\u57FA\u7840\u5DE5\u5177 + \u672C\u5DE5\u4F5C\u533A\u7684\u6269\u5C55\u5DE5\u5177\uFF09\u3002\u76EE\u5F55\u5916\u540D\u5B57\u3001\u5F53\u524D\u9636\u6BB5\u4E0D\u53EF\u7528\u3001\u53C2\u6570\u4E0D\u7B26\u3001\u8986\u76D6\u56FA\u5B9A\u53C2\u6570\u90FD\u4F1A\u88AB\u62D2\uFF0C\u62D2\u7EDD\u7406\u7531\u4F1A\u539F\u6837\u8FD4\u56DE\uFF1B\u65B0\u589E\u5DE5\u5177\u7528 workflow_tool_add\u3002",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["name", "args"],
        properties: {
          name: { type: "string", description: "\u76EE\u5F55\u91CC\u7684\u5DE5\u5177\u540D\uFF08\u4F8B\uFF1Aworkflow_manual / check_deps\uFF09\u3002" },
          args: { type: "object", description: "\u8BE5\u5DE5\u5177\u7684\u53C2\u6570\u5BF9\u8C61\uFF1B\u6309\u76EE\u5F55\u91CC\u7684\u5FC5\u586B\u9879\u4E0E\u53C2\u6570\u8BF4\u660E\u4F20\u3002", additionalProperties: true }
        }
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["ok", "name", "run", "value"],
          properties: {
            ok: { type: "boolean" },
            name: { type: "string" },
            run: { type: "string" },
            value: { type: "object" }
          }
        },
        render: (_args, value) => [{
          type: "text",
          text: renderToolCallResult(value)
        }]
      },
      execute: async (args, exec) => {
        const sessionId = requireSession(deps, exec);
        const trace = newTraceId();
        return instrument("workflow_tool_call", sessionId, trace, async () => {
          const found = await deps.repository.findBySession(sessionId);
          if (found === null) throw new Error("\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709 workflow \u8282\u70B9");
          const name = typeof args?.name === "string" ? args.name : "";
          const catalog = await loadCatalog(deps);
          const state = await currentStateOf(deps, sessionId);
          const startedAt = Date.now();
          const entry = catalog.find((item) => item.name === name);
          if (entry === void 0) {
            const message = `\u5DE5\u5177\u76EE\u5F55\u91CC\u6CA1\u6709\u300C${name}\u300D\uFF1A\u53EA\u80FD\u8C03\u7528\u76EE\u5F55\u91CC\u7684\u5DE5\u5177\uFF1B\u8981\u65B0\u589E\u8BF7\u7528 workflow_tool_add\u3002`;
            record({
              kind: "call",
              session: sessionId,
              workflow_id: found.workflowId,
              name,
              trace,
              decision: "deny",
              code: "unknown-tool",
              state,
              args: summarizeArgs(args?.args),
              message
            });
            throw new Error(message);
          }
          const runText = describeRun(entry);
          const decision = decideToolCall({ state, entry, args: args?.args });
          if (!decision.allow) {
            record({
              kind: "call",
              session: sessionId,
              workflow_id: found.workflowId,
              name,
              trace,
              run: runText,
              version: entry.version,
              decision: "deny",
              code: decision.code,
              state,
              args: summarizeArgs(args?.args),
              message: decision.message
            });
            throw new Error(decision.message);
          }
          const merged = args?.args ?? {};
          let value;
          try {
            value = await invokeTool(deps, entry, merged, sessionId);
          } catch (error) {
            const message = String(error?.message ?? error);
            record({
              kind: "call",
              session: sessionId,
              workflow_id: found.workflowId,
              name,
              trace,
              run: runText,
              version: entry.version,
              decision: "error",
              code: "execution-failed",
              state,
              args: summarizeArgs(args?.args),
              ms: Date.now() - startedAt,
              message
            });
            throw error;
          }
          record({
            kind: "call",
            session: sessionId,
            workflow_id: found.workflowId,
            name,
            trace,
            run: runText,
            version: entry.version,
            decision: "allow",
            state,
            args: summarizeArgs(args?.args),
            ms: Date.now() - startedAt,
            ...typeof value?.checker === "string" ? {
              checker: value.checker,
              ok: value.ok === true,
              findings: Array.isArray(value.findings) ? value.findings.length : 0
            } : {}
          });
          return { ok: true, name: entry.name, run: runText, value };
        });
      }
    }, { when: whenWorkflow }));
  });
}
async function loadCatalog(_deps) {
  return FACTORY_TOOLS;
}
function describeRun(entry) {
  if (entry.kind === TOOL_KIND.extension) return `checker:${entry.run?.checker ?? "?"}`;
  return `base:${entry.name}`;
}
async function currentStateOf(deps, sessionId) {
  let state = deps.getState(sessionId);
  if (state === void 0) {
    await deps.refreshState?.(sessionId);
    state = deps.getState(sessionId);
  }
  if (state === void 0) {
    throw new Error("\u8BFB\u4E0D\u5230\u8FD9\u4E2A\u4F1A\u8BDD\u7684\u5DE5\u4F5C\u6D41\u72B6\u6001\uFF08\u53EF\u80FD\u8FD8\u6CA1\u7ED1\u5B9A workflow \u8282\u70B9\uFF09\u3002\u5DF2\u89E6\u53D1\u540C\u6B65\uFF0C\u8BF7\u91CD\u8BD5\u4E00\u6B21\u3002");
  }
  return state;
}
async function invokeTool(deps, entry, args, sessionId) {
  if (entry.kind === TOOL_KIND.extension) return invokeChecker(deps, entry, args, sessionId);
  return invokeBaseTool(deps, entry.name, args, sessionId);
}
async function invokeBaseTool(deps, name, args, sessionId) {
  switch (name) {
    case "workflow_advance":
      return invokeAdvance(deps, sessionId, args);
    case "workflow_manual":
      return invokeManual(deps, sessionId, args);
    case "workflow_check":
      return invokeCheck(deps, sessionId, args);
    case "workflow_verify_report":
      return invokeVerifyReport(deps, sessionId, args);
    case "workflow_verify_check":
      return invokeVerifyCheck(deps, sessionId, args);
    default:
      throw new Error(`\u672A\u77E5\u7684\u57FA\u7840\u5DE5\u5177\uFF1A${name}`);
  }
}
function commandForChecker(checker, target, stack, tools, packageRoot) {
  if (checker.script !== void 0) {
    if (typeof packageRoot !== "string" || packageRoot === "") {
      throw new Error(`\u68C0\u67E5\u5668\u300C${checker.id}\u300D\u7528\u811A\u672C\u6267\u884C\uFF0C\u4F46\u5BBF\u4E3B\u6CA1\u7ED9\u51FA packageRoot\uFF1A\u5148\u4FEE\u5BBF\u4E3B\u6CE8\u5165`);
    }
    return `node "${join7(packageRoot, "scripts", checker.script)}"`;
  }
  if (typeof stack === "string" && stack !== "" && typeof checker.buildCommands?.[stack] === "function") {
    return checker.buildCommands[stack](target, tools);
  }
  if (checker.buildCommands !== void 0) {
    throw new Error(
      `\u68C0\u67E5\u5668\u300C${checker.id}\u300D\u9700\u8981\u6280\u672F\u6808\uFF08${Object.keys(checker.buildCommands).join(" / ")}\uFF09\uFF0C\u4F46\u5DE5\u4F5C\u76EE\u5F55\u63A2\u6D4B\u4E0D\u5230\uFF1B\u5148\u628A\u5DE5\u4F5C\u76EE\u5F55\u6307\u5230\u9879\u76EE\u6839\uFF08pyproject.toml / package.json\uFF09`
    );
  }
  if (typeof checker.buildCommand !== "function") {
    throw new Error(`\u68C0\u67E5\u5668\u300C${checker.id}\u300D\u65E2\u6CA1\u6709 script \u4E5F\u6CA1\u6709 buildCommand`);
  }
  return checker.buildCommand(target);
}
function ensurePythonTools(python, packageRoot) {
  const probe = spawnSync(python, ["-c", "import pytest, importlinter, vulture"], { stdio: "ignore" });
  if (probe.status === 0) return true;
  const wheelsDir = join7(packageRoot, "python-wheels");
  if (!existsSync(wheelsDir)) return false;
  const install = spawnSync(
    python,
    ["-m", "pip", "install", "--no-index", "--find-links", wheelsDir, "pytest", "pytest-json-report", "import-linter", "vulture"],
    { stdio: "ignore" }
  );
  if (install.status !== 0) return false;
  return spawnSync(python, ["-c", "import pytest, importlinter, vulture"], { stdio: "ignore" }).status === 0;
}
async function resolveToolsFor(stack, projectRoot, packageRoot, ensure = ensurePythonTools) {
  if (stack === "python") {
    const python = await resolvePython();
    const projectPython = await resolveProjectPython(projectRoot ?? "");
    if (python === null && projectPython === null) return null;
    const toolPython = python ?? projectPython;
    if (!ensure(toolPython, packageRoot ?? "")) return null;
    return {
      python: toolPython,
      projectPython: projectPython ?? void 0,
      lintImports: lintImportsPath(toolPython)
    };
  }
  return {};
}
async function invokeChecker(deps, entry, args, sessionId) {
  const found = await deps.repository.findBySession(sessionId);
  if (found === null) throw new Error("\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709 workflow \u8282\u70B9");
  const run = entry.run;
  const checker = findChecker(run.checker);
  if (checker === void 0) {
    throw new Error(`\u5DE5\u5177\u300C${entry.name}\u300D\u6307\u5411\u7684\u68C0\u67E5\u5668\u300C${run.checker}\u300D\u4E0D\u5728\u6CE8\u518C\u8868\u91CC\uFF1A\u5148\u8865\u5B9E\u73B0\u518D\u767B\u8BB0`);
  }
  const snapshot = await deps.repository.get(found.workflowId);
  const workingDirectory = snapshot?.working_directory;
  if (typeof workingDirectory !== "string" || workingDirectory === "") {
    throw new Error("\u8BE5 workflow \u6CA1\u6709\u5DE5\u4F5C\u76EE\u5F55\uFF0C\u68C0\u67E5\u5668\u8DD1\u4E0D\u4E86\uFF1A\u5148\u7ED9\u5B83\u6307\u5B9A\u5DE5\u4F5C\u76EE\u5F55");
  }
  const target = resolveCheckerTarget(args?.target, checker);
  const requestedStack = args?.stack === "js" || args?.stack === "python" ? args.stack : null;
  const requestedProject = typeof args?.project === "string" && args.project.trim() !== "" ? args.project.trim() : null;
  let projects;
  let candidates = [];
  if (requestedProject !== null) {
    const picked = await nearestProject(resolve4(workingDirectory, requestedProject));
    projects = picked !== null ? [picked] : [];
    if (projects.length === 0) candidates = await listCandidateProjects(workingDirectory);
  } else {
    const scopeInfo = await deps.repository.getChecklistScope?.(found.workflowId, found.nodeId);
    const resolution = await resolveProjects(workingDirectory, scopeInfo?.scope ?? []);
    projects = resolution.projects;
    candidates = resolution.candidates;
  }
  if (projects.length === 0) {
    const problem = candidates.length > 0 ? "\u627E\u4E0D\u5230\u9879\u76EE\u6839\uFF1A\u7528\u9009\u62E9\u6846\u8BA9\u7528\u6237\u4ECE\u5019\u9009\u76EE\u5F55\u91CC\u6311\u4E00\u4E2A\uFF0C\u518D\u5E26 project \u53C2\u6570\u91CD\u8DD1 `check_*`" : "\u627E\u4E0D\u5230\u9879\u76EE\u6839\uFF1A\u5DE5\u4F5C\u76EE\u5F55\u53CA\u4E0A\u5C42\u6CA1\u6709 pyproject.toml / package.json\uFF0C\u4E5F\u6CA1\u6709\u5E26 marker \u7684\u4E00\u7EA7\u5B50\u76EE\u5F55\uFF1B\u5148\u628A\u5DE5\u4F5C\u76EE\u5F55\u6307\u5230\u9879\u76EE\u6839";
    await deps.repository.recordCheckerRun?.({
      workflowId: found.workflowId,
      nodeId: found.nodeId,
      checkerId: checker.id,
      ok: false,
      findings: 1,
      exit_code: null,
      evidence: `.workflow/evidence/${checker.evidence}`
    });
    logEvent(deps.logger, "warn", `[workflow] checker project not found (session=${sessionId}, checker=${checker.id}, candidates=${candidates.length})`);
    return {
      ok: false,
      checker: checker.id,
      project_candidates: candidates,
      command: null,
      exit_code: null,
      timed_out: false,
      findings: [{ location: checker.evidence, problem }],
      stats: {}
    };
  }
  const perProject = [];
  for (const project of projects) {
    const stack = requestedStack ?? project.stack;
    const result = await runCheckerInProject(deps, checker, args, target, project.root, stack);
    perProject.push({ root: project.root, stack, result });
  }
  const multi = perProject.length > 1;
  const ok = perProject.every((item) => item.result.ok);
  const findings = perProject.flatMap((item) => {
    const label = relative(workingDirectory, item.root) || ".";
    const prefix = multi ? `[${label}] ` : "";
    return item.result.findings.map((finding) => ({
      location: `${prefix}${finding.location}`,
      problem: finding.problem
    }));
  });
  const stats = { projects: perProject.length };
  for (const item of perProject) {
    for (const [key, value] of Object.entries(item.result.stats ?? {})) {
      stats[key] = (stats[key] ?? 0) + Number(value);
    }
  }
  const per_project = perProject.map((item) => ({
    root: relative(workingDirectory, item.root) || ".",
    stack: item.stack,
    ok: item.result.ok,
    stats: item.result.stats
  }));
  const notes = perProject.map((item) => item.result.note).filter((note) => typeof note === "string" && note !== "");
  const unsupported = perProject.map((item) => item.result.unsupported).filter((reason) => typeof reason === "string" && reason !== "");
  const sameAsWorking = perProject.length === 1 && perProject[0] !== void 0 && perProject[0].root === resolve4(workingDirectory);
  if (!sameAsWorking) {
    const recordPath = join7(workingDirectory, ".workflow", "evidence", checker.evidence);
    await ensureWorkflowDir(join7(workingDirectory, ".workflow"));
    await mkdir2(dirname6(recordPath), { recursive: true });
    await writeFile(
      recordPath,
      JSON.stringify({ checker: checker.id, ok, findings, per_project, stats }, null, 2),
      "utf8"
    ).catch(() => {
    });
  }
  try {
    await deps.repository.recordCheckerRun?.({
      workflowId: found.workflowId,
      nodeId: found.nodeId,
      checkerId: checker.id,
      ok,
      findings: findings.length,
      exit_code: perProject[0]?.result.exit_code ?? null,
      evidence: `.workflow/evidence/${checker.evidence}`
    });
  } catch (error) {
    logEvent(
      deps.logger,
      "warn",
      `[workflow] checker run record failed (session=${sessionId}, checker=${checker.id}): ${String(error?.message ?? error)}`
    );
  }
  logEvent(
    deps.logger,
    "info",
    `[workflow] checker run (session=${sessionId}, tool=${entry.name}, checker=${checker.id}, projects=${perProject.length}, stacks=${perProject.map((item) => item.stack).join(",")}, ok=${String(ok)}, findings=${findings.length})`
  );
  return {
    ok,
    checker: checker.id,
    command: perProject.length === 1 ? perProject[0].result.command : null,
    exit_code: perProject[0]?.result.exit_code ?? null,
    timed_out: perProject.some((item) => item.result.timed_out === true),
    findings,
    stats,
    per_project,
    ...notes.length > 0 ? { notes } : {},
    // 缺配置（比如没写埋点计划）≠ 检查不合格：给个顶层标记，验收时能判「这层做没做」。
    ...Number(stats.config_missing) > 0 ? { config_missing: true } : {},
    // 当前栈上不可验证（比如埋点检测不支持该栈）：既不算通过也不算不合格，单列出来。
    ...unsupported.length > 0 ? { unsupported: unsupported.join("\uFF1B") } : {}
  };
}
async function ensureWorkflowDir(dir) {
  await mkdir2(dir, { recursive: true });
  const ignore = join7(dir, ".gitignore");
  if (!existsSync(ignore)) {
    await writeFile(ignore, "*\n!.gitignore\n", "utf8").catch(() => {
    });
  }
}
async function runCheckerInProject(deps, checker, args, target, projectRoot, stack) {
  if (checker.id === "deps" && stack === "python") {
    const pyproject = join7(projectRoot, "pyproject.toml");
    const text = existsSync(pyproject) ? await readFile(pyproject, "utf8").catch(() => "") : "";
    if (!text.includes("[tool.importlinter]")) {
      const problem = text === "" ? `\u7F3A pyproject.toml\uFF1A[tool.importlinter] \u5951\u7EA6\u901A\u5E38\u5199\u5728 pyproject.toml \u91CC\uFF0C\u4F46 ${pyproject} \u4E0D\u5B58\u5728\u6216\u8BFB\u4E0D\u5230\uFF1B\u786E\u8BA4\u9879\u76EE\u7528\u7684\u662F\u522B\u7684 import-linter \u914D\u7F6E\u6587\u4EF6\uFF1B\u8FD9\u4E00\u9879\u53EF\u964D\u7EA7\u4E3A AI \u8BC1\u636E` : "\u7F3A [tool.importlinter] \u5951\u7EA6\u914D\u7F6E\uFF1A\u8BF7\u5728 pyproject.toml \u91CC\u58F0\u660E\u67B6\u6784\u5951\u7EA6\uFF08layers / forbidden \u7B49\uFF09\uFF0C\u5426\u5219 lint-imports \u65E0\u6CD5\u5224\u4F9D\u8D56\uFF1B\u8FD9\u4E00\u9879\u53EF\u964D\u7EA7\u4E3A AI \u8BC1\u636E";
      return {
        ok: false,
        command: null,
        exit_code: null,
        timed_out: false,
        findings: [{ location: pyproject, problem }],
        stats: {}
      };
    }
  }
  const tools = await resolveToolsFor(stack, projectRoot, deps.packageRoot, deps.ensurePythonTools ?? ensurePythonTools);
  if (tools === null) {
    return {
      ok: false,
      command: null,
      exit_code: null,
      timed_out: false,
      findings: [{ location: checker.evidence, problem: "\u5DE5\u5177\u7F3A\u5931\uFF1ADSH Python \u6CA1\u627E\u5230\uFF08\u5148\u88C5/\u914D\u7F6E\u597D\u518D\u91CD\u8BD5\uFF1B\u8FD9\u4E00\u9879\u53EF\u964D\u7EA7\u4E3A AI \u8BC1\u636E\uFF09" }],
      stats: {}
    };
  }
  const command = commandForChecker(checker, target, stack, tools, deps.packageRoot);
  const projectEvidence = checker.evidenceAtProjectRoot === true ? join7(projectRoot, checker.evidence) : null;
  const legacyEvidence = join7(projectRoot, ".workflow", "evidence", checker.evidence);
  const evidencePath = projectEvidence !== null && existsSync(projectEvidence) ? projectEvidence : legacyEvidence;
  await ensureWorkflowDir(join7(projectRoot, ".workflow"));
  await mkdir2(dirname6(evidencePath), { recursive: true });
  let commandResult = null;
  if (checker.autoRun) {
    const execute = deps.runCommand ?? runCommand;
    commandResult = await execute({ cwd: projectRoot, command, binDir: deps.nodeModulesBin });
  }
  const normalizer = typeof stack === "string" && stack !== "" && typeof checker.normalizers?.[stack] === "function" ? checker.normalizers[stack] : null;
  let evidenceJson = null;
  let parseError = "";
  try {
    const rawText = await readFile(evidencePath, "utf8");
    evidenceJson = normalizer !== null ? normalizer(rawText) : JSON.parse(rawText);
    if (normalizer !== null) {
      try {
        await writeFile(`${evidencePath}.raw`, rawText, "utf8");
        await writeFile(evidencePath, `${JSON.stringify(evidenceJson, null, 2)}
`, "utf8");
      } catch {
      }
    }
  } catch (error) {
    const code = error?.code;
    if (code !== "ENOENT") parseError = String(error?.message ?? error);
  }
  let result = parseError === "" ? checker.check(evidenceJson, { stack }) : {
    ok: false,
    findings: [{ location: checker.evidence, problem: `\u8BC1\u636E\u6587\u4EF6\u89E3\u6790\u5931\u8D25\uFF1A${parseError}` }],
    stats: {}
  };
  if (commandResult !== null && commandResult.ok !== true && result.ok === true) {
    result = {
      ok: false,
      findings: [
        ...result.findings,
        {
          location: checker.evidence,
          problem: `\u53D6\u8BC1\u547D\u4EE4\u5931\u8D25\uFF08exit=${commandResult.exit_code ?? "?"}\uFF09\u4E14\u6CA1\u5224\u51FA\u4E0D\u5408\u683C\u9879\uFF1A\u8BC1\u636E\u53EF\u80FD\u6CA1\u751F\u6210\uFF0C\u4E0D\u80FD\u5F53\u300C\u96F6\u8FDD\u89C4\u300D`
        }
      ],
      stats: result.stats
    };
  }
  return {
    ok: result.ok,
    command: checker.autoRun ? command : null,
    exit_code: commandResult?.exit_code ?? null,
    timed_out: commandResult?.timed_out ?? false,
    findings: result.findings,
    stats: result.stats,
    ...typeof result.note === "string" && result.note !== "" ? { note: result.note } : {},
    ...typeof result.unsupported === "string" && result.unsupported !== "" ? { unsupported: result.unsupported } : {},
    ...commandResult !== null && commandResult.ok !== true ? { command_output: commandResult.tail.slice(-800) } : {}
  };
}
function resolveCheckerTarget(raw, checker) {
  const text = raw === void 0 || raw === null ? "" : String(raw).trim();
  if (text === "") {
    if (checker.requiresTarget === true) {
      throw new Error('\u8FD9\u4E00\u9879\u9700\u8981\u76EE\u6807\u5730\u5740\uFF1A\u8C03\u7528\u65F6\u4F20 target\uFF08\u4F8B\uFF1A{"target":"http://127.0.0.1:3000"}\uFF09');
    }
    return checker.defaultTarget;
  }
  if (/^https?:\/\//i.test(text)) {
    if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._/-]*)?$/i.test(text)) {
      throw new Error("target \u4F5C\u4E3A URL \u65F6\u53EA\u5141\u8BB8 http(s)://\u4E3B\u673A[:\u7AEF\u53E3][/\u8DEF\u5F84]\uFF0C\u4E0D\u80FD\u5E26\u67E5\u8BE2\u4E32\u6216\u7279\u6B8A\u5B57\u7B26");
    }
    return text;
  }
  if (!/^[A-Za-z0-9_.@/-]+$/.test(text)) {
    throw new Error("target \u53EA\u80FD\u662F\u76F8\u5BF9\u8DEF\u5F84\u7247\u6BB5\uFF08\u5B57\u6BCD/\u6570\u5B57/. _ - / @\uFF09\uFF0C\u4E0D\u80FD\u542B\u7A7A\u683C\u3001\u5F15\u53F7\u3001\u5206\u53F7\u6216\u91CD\u5B9A\u5411");
  }
  if (text.startsWith("/") || /^[A-Za-z]:/.test(text) || text.includes("..")) {
    throw new Error("target \u4E0D\u80FD\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u4E5F\u4E0D\u80FD\u542B ..");
  }
  return text;
}
async function invokeAdvance(deps, sessionId, args) {
  const found = await deps.repository.findBySession(sessionId);
  if (found === null) throw new Error("\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709 workflow \u8282\u70B9");
  const from = String(found.current_state);
  const to = String(args?.to ?? "");
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`\u4E0D\u80FD\u4ECE\u300C${labelOf(from)}\u300D\u76F4\u63A5\u5230\u300C${labelOf(to)}\u300D\uFF1B\u5F53\u524D\u53EF\u53BB\uFF1A${allowed.map(labelOf).join(" / ")}`);
  }
  const backward = STATE_ORDER.indexOf(to) < STATE_ORDER.indexOf(from);
  if (backward && (typeof args?.reason !== "string" || args.reason.trim() === "")) {
    throw new Error("\u8FD4\u5DE5\u9700\u8981 reason\uFF1A\u8BF4\u660E\u4E0A\u4E00\u9636\u6BB5\u54EA\u91CC\u4E0D\u591F");
  }
  await assertAdvanceAllowed(deps.repository, found, from, to);
  deps.requestAdvance({ sessionId, to, ...typeof args?.reason === "string" ? { reason: args.reason } : {} });
  logEvent(deps.logger, "info", `[workflow] advance requested (session=${sessionId}, ${from}\u2192${to}${backward ? ", rework" : ""})`);
  return {
    requested: to,
    status: "awaiting-approval",
    message: `\u5DF2\u8BF7\u6C42\u4ECE\u300C${labelOf(from)}\u300D\u5207\u6362\u5230\u300C${labelOf(to)}\u300D\uFF0C\u7B49\u5F85\u7528\u6237\u5728\u4F1A\u8BDD\u91CC\u786E\u8BA4\uFF1B\u540C\u610F\u4E4B\u524D\u72B6\u6001\u4E0D\u4F1A\u53D8\u3002`
  };
}
async function invokeManual(deps, sessionId, args) {
  const found = await deps.repository.findBySession(sessionId);
  if (found === null) throw new Error("\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709 workflow \u8282\u70B9");
  const target = String(args?.target ?? "");
  if (target !== "session" && target !== "project") throw new Error("target \u53EA\u80FD\u662F session \u6216 project");
  const action = String(args?.action ?? "");
  const nodeId = target === "session" ? found.nodeId : null;
  if (action === "read") {
    const text = await deps.repository.readManual(found.workflowId, nodeId);
    return { ok: true, text };
  }
  if (action === "extend_scope") {
    if (target !== "session") {
      throw new Error("extend_scope \u53EA\u5BF9\u4F1A\u8BDD\u624B\u518C\uFF08target=session\uFF09\u53EF\u7528");
    }
    if (deps.getState(sessionId) === void 0) await deps.refreshState?.(sessionId);
    const state = deps.getState(sessionId);
    if (state !== "implementing") {
      throw new Error("\u300C\u8303\u56F4\u8FFD\u52A0\u300D\u53EA\u5728\u300C\u5B9E\u73B0\u4E2D\u300D\u53EF\u7528\uFF1A\u8BA8\u8BBA\u4E2D\u8BF7\u76F4\u63A5\u6539\u5B9E\u65BD\u987A\u5E8F\u7684\u300C\uFF5C \u8303\u56F4\uFF1A\u300D\uFF0C\u9A8C\u6536 / \u5DF2\u5B8C\u7ED3\u6CA1\u6709\u8303\u56F4\u62E6\u622A");
    }
    const paths = Array.isArray(args?.paths) ? args.paths : [];
    const result2 = await deps.repository.extendSessionScope({
      workflowId: found.workflowId,
      nodeId: found.nodeId,
      paths,
      reason: String(args?.reason ?? "")
    });
    logEvent(deps.logger, "info", `[workflow] scope extended (session=${sessionId}, appended=${result2.appended.length})`);
    await deps.refreshScope?.(sessionId);
    return { ok: true, scope: result2.scope, appended: result2.appended };
  }
  if (action === "append_entry" || action === "update_entry" || action === "remove_entry" || action === "rename_tag") {
    if (target !== "project") {
      throw new Error("\u6761\u76EE\u7EA7\u5199\u5165\u53EA\u5BF9\u9879\u76EE\u624B\u518C\uFF08target=project\uFF09\u53EF\u7528\uFF1B\u4F1A\u8BDD\u624B\u518C\u7528 replace_section \u5199\u65B9\u6848");
    }
    const section2 = String(args?.section ?? "").trim();
    const tags = Array.isArray(args?.tags) ? args.tags.map((tag) => String(tag)) : [];
    const entry = String(args?.entry ?? "").trim();
    try {
      if (action === "append_entry") {
        const written = await deps.repository.appendProjectEntry({
          workflowId: found.workflowId,
          section: section2,
          tags,
          content: String(args?.content ?? "")
        });
        logEvent(deps.logger, "info", `[workflow] manual entry appended (session=${sessionId}, section=${section2}, table=${written.tags.length}, registered=${written.registered.length})`);
        return { ok: true, section: section2, entry: written.entry, tags: written.tags, registered: written.registered };
      }
      if (action === "update_entry") {
        const written = await deps.repository.updateProjectEntry({
          workflowId: found.workflowId,
          section: section2,
          entry,
          tags,
          content: String(args?.content ?? "")
        });
        logEvent(deps.logger, "info", `[workflow] manual entry updated (session=${sessionId}, section=${section2}, tags=${written.tags.length})`);
        return { ok: true, section: section2, entry: written.entry, tags: written.tags };
      }
      if (action === "remove_entry") {
        const removed = await deps.repository.removeProjectEntry({ workflowId: found.workflowId, section: section2, entry });
        logEvent(deps.logger, "info", `[workflow] manual entry removed (session=${sessionId}, section=${section2})`);
        return { ok: true, section: section2, removed: removed.removed };
      }
      const from = String(args?.from ?? "");
      const to = String(args?.to ?? "");
      const renamed = await deps.repository.renameProjectTag({ workflowId: found.workflowId, from, to });
      logEvent(deps.logger, "info", `[workflow] manual tag renamed (session=${sessionId}, from=${from}, to=${to}, rewritten=${renamed.rewritten}, table=${renamed.tags.length})`);
      return { ok: true, tags: renamed.tags, rewritten: renamed.rewritten };
    } catch (error) {
      logEvent(
        deps.logger,
        "warn",
        `[workflow] manual entry rejected (session=${sessionId}, action=${action}, section=${section2}): ${String(error?.message ?? error)}`
      );
      throw error;
    }
  }
  if (action !== "replace_section") {
    throw new Error("action \u53EA\u80FD\u662F read / replace_section / extend_scope / append_entry / update_entry / remove_entry / rename_tag");
  }
  const section = String(args?.section ?? "").trim();
  const writable = WRITABLE_SECTIONS[target];
  if (!writable.includes(section)) {
    throw new Error(`\u300C${target}\u300D\u624B\u518C\u53EA\u80FD\u6539\u8FD9\u4E9B\u5C0F\u8282\uFF1A${writable.join(" / ")}\uFF1B${section === "\u5B9E\u65BD\u987A\u5E8F" ? "\u6E05\u5355\u8BF7\u7528 workflow_check \u52FE\u9009\u3002" : ""}`);
  }
  if (typeof args?.content !== "string" || args.content.trim() === "") throw new Error("content \u4E0D\u80FD\u4E3A\u7A7A");
  if (target === "session" && (section === "\u5B9E\u65BD\u987A\u5E8F" || section === "\u65B9\u6848")) {
    if (deps.getState(sessionId) === void 0) await deps.refreshState?.(sessionId);
    const state = deps.getState(sessionId);
    if (state === void 0) {
      throw new Error("\u8BFB\u4E0D\u5230\u8FD9\u4E2A\u4F1A\u8BDD\u7684\u5DE5\u4F5C\u6D41\u72B6\u6001\uFF08\u53EF\u80FD\u8FD8\u6CA1\u7ED1\u5B9A workflow \u8282\u70B9\uFF09\uFF1A\u5148\u8BA9\u5BBF\u4E3B\u5B8C\u6210\u8BA4\u9886\uFF0C\u518D\u5199\u5165\u3002");
    }
    if (state !== "discussing") {
      throw new Error(
        section === "\u5B9E\u65BD\u987A\u5E8F" ? "\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\u53EA\u80FD\u5728\u300C\u8BA8\u8BBA\u4E2D\u300D\u5B9A\u4E49\uFF1B\u8FDB\u5165\u5B9E\u73B0\u4E2D\u4E4B\u540E\u8BF7\u7528 workflow_check \u9010\u6761\u52FE\u9009\uFF0C\u4E0D\u8981\u6539\u5199\u6761\u76EE\u3002" : "\u300C\u65B9\u6848\u300D\u53EA\u80FD\u5728\u300C\u8BA8\u8BBA\u4E2D\u300D\u5B9A\u4E49\uFF1B\u8FDB\u5165\u5B9E\u73B0\u4E2D\u4E4B\u540E\u65B9\u6848\u5DF2\u9501\u5B9A\uFF0C\u8981\u6539\u8BF7\u5148\u8FD4\u5DE5\u56DE\u300C\u8BA8\u8BBA\u4E2D\u300D\uFF08workflow_advance to: discussing\uFF0C\u5E26 reason\uFF09\u3002"
      );
    }
  }
  let result;
  try {
    result = await deps.repository.replaceManualSection({ workflowId: found.workflowId, nodeId, section, content: args.content });
  } catch (error) {
    if (error?.code === "manual-limit") {
      logEvent(
        deps.logger,
        "warn",
        `[workflow] manual gate rejected (session=${sessionId}, target=${target}, section=${section}): ${String(error?.message ?? error)}`
      );
    }
    throw error;
  }
  logEvent(deps.logger, "info", `[workflow] manual write (session=${sessionId}, target=${target}, section=${section}, bytes=${result.bytes}, chars=${result.chars})`);
  return { ok: true, bytes: result.bytes, section };
}
function layerGateFor(label) {
  for (const [layer, gate] of Object.entries(LAYER_GATES)) {
    if (label.startsWith(layer)) return gate;
  }
  return null;
}
async function invokeCheck(deps, sessionId, args) {
  const state = deps.getState(sessionId);
  if (state === void 0) await deps.refreshState?.(sessionId);
  const stateNow = deps.getState(sessionId);
  if (stateNow === "discussing") throw new Error("\u300C\u8BA8\u8BBA\u4E2D\u300D\u8FD8\u4E0D\u52FE\u6E05\u5355\uFF1A\u5148\u628A\u65B9\u6848\u5199\u8FDB\u4F1A\u8BDD\u624B\u518C\uFF0C\u63A8\u8FDB\u5230\u300C\u5B9E\u73B0\u4E2D\u300D\u518D\u52FE\u3002");
  const found = await deps.repository.findBySession(sessionId);
  if (found === null) throw new Error("\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709 workflow \u8282\u70B9");
  const label = String(args?.item ?? "").trim();
  if (label === "") throw new Error("item \u4E0D\u80FD\u4E3A\u7A7A");
  if (args?.done === true) {
    const gate = layerGateFor(label);
    if (gate !== null && gate.require_run && gate.checker !== "") {
      const verification = await deps.repository.getVerification(found.workflowId, found.nodeId);
      const runs = verification.checker_runs.filter((run) => run.checker_id === gate.checker);
      if (runs.length === 0) {
        throw new Error(`\u52FE\u9009\u300C${label}\u300D\u524D\u5FC5\u987B\u5148\u771F\u8DD1\u8FC7 check_${gate.checker}\uFF08\u5C0F\u9A8C\u6536\u95E8\u7981\uFF1A\u8FD9\u4E00\u5C42\u505A\u5B8C\u518D\u6539\u8D35\uFF0C\u5F97\u5148\u673A\u5668\u9A8C\u8FC7\uFF09`);
      }
    }
  }
  const items = await deps.repository.setChecklistItem({
    workflowId: found.workflowId,
    nodeId: found.nodeId,
    label,
    done: args?.done === true,
    evidence: typeof args?.evidence === "string" ? args.evidence : ""
  });
  return { items };
}
async function invokeVerifyReport(deps, sessionId, args) {
  const found = await requireVerifyingNode(deps, sessionId);
  const itemId = resolveVerifyCheckId(args?.item);
  const check = VERIFY_CHECKS.find((entry) => entry.id === itemId);
  if (check === void 0) throw new Error(`\u6CA1\u6709 ${itemId} \u53F7\u9A8C\u6536\u9879`);
  const report = validateVerifyReportInput(check, args);
  const checkerMeta = check.checker;
  if (checkerMeta?.require_run === true && report.result === "pass") {
    const verification = await deps.repository.getVerification(found.workflowId, found.nodeId);
    const runs = verification.checker_runs.filter((run) => run.checker_id === checkerMeta.id);
    if (runs.length === 0) {
      const toolName = `check_${checkerMeta.id}`;
      throw new Error(
        `\u300C${check.name}\u300D\u62A5 pass \u524D\u672C\u8F6E\u81F3\u5C11\u8981\u8DD1\u8FC7\u4E00\u6B21 ${toolName}\uFF08\u5148\u771F\u8DD1\u4E00\u6B21\u68C0\u67E5\u5668\uFF09\uFF1B\u6CA1\u8DD1\u5C31\u58F0\u79F0\u5230\u4F4D\u4E0D\u7B97\u6570\uFF08\u81F3\u5C11\u8DD1\u4E00\u6B21\u95E8\u7981\uFF09`
      );
    }
  }
  const requiredChecker = checkerMeta?.enforcement === "required" ? findChecker(checkerMeta.id) : void 0;
  const requiredSnapshot = requiredChecker !== void 0 ? await deps.repository.get(found.workflowId) : null;
  const requiredDetection = requiredChecker !== void 0 ? await detectStack(requiredSnapshot?.working_directory) : null;
  const requiredStack = requiredDetection?.stack ?? null;
  if (checkerMeta?.enforcement === "required" && report.result === "pass" && requiredChecker !== void 0 && hasMachineDriver(requiredChecker, requiredStack)) {
    const verification = await deps.repository.getVerification(found.workflowId, found.nodeId);
    const toolName = `check_${checkerMeta.id}`;
    const runs = verification.checker_runs.filter((run) => run.checker_id === checkerMeta.id);
    const latest = runs.length > 0 ? runs[runs.length - 1] : void 0;
    if (latest === void 0) {
      throw new Error(
        `\u300C${check.name}\u300D\u62A5 pass \u524D\u5FC5\u987B\u5148\u771F\u7684\u8DD1\u8FC7 ${toolName}\uFF08\u7528 workflow_tool_call \u8C03\u7528\uFF09\uFF0C\u4E0D\u662F\u53EA\u5728\u62A5\u5907\u91CC\u586B checker \u7ED3\u679C\uFF08\u5F3A\u5236\u4F7F\u7528\u95E8\u7981\uFF09`
      );
    }
    const submitted = report.checker;
    const okMatch = submitted?.ok === latest.ok;
    const findingsMatch = submitted?.findings === latest.findings;
    const submittedExit = submitted?.exit_code ?? null;
    const exitMatch = submittedExit === null || submittedExit === latest.exit_code;
    if (!okMatch || !findingsMatch || !exitMatch) {
      throw new Error(
        `\u63D0\u4EA4\u7684 checker \u4E0E ${toolName} \u7684\u771F\u5B9E\u8F93\u51FA\u4E0D\u4E00\u81F4\uFF08\u5F3A\u5236\u63D0\u4EA4\u5DE5\u5177\u8F93\u51FA\uFF09\uFF1A\u6700\u8FD1\u4E00\u6B21\u662F ok=${latest.ok}\u3001findings=${latest.findings}\u3001exit=${latest.exit_code ?? "n/a"}\uFF0C\u8BF7\u4EE5\u5DE5\u5177\u8FD4\u56DE\u4E3A\u51C6`
      );
    }
    const evidence = latest.evidence;
    if (typeof evidence === "string" && evidence !== "") {
      const normalize = (file) => file.replace(/\\/g, "/").replace(/^\.\//, "");
      const target = normalize(evidence);
      const hasEvidenceAnchor = report.anchors.some((anchor) => normalize(anchor.file) === target);
      if (!hasEvidenceAnchor) {
        throw new Error(
          `\u62A5\u5907\u951A\u70B9\u5FC5\u987B\u5305\u542B\u672C\u6B21 ${toolName} \u751F\u6210\u7684\u8BC1\u636E\u6587\u4EF6\u300C${evidence}\u300D\uFF08\u5F3A\u5236\u951A\u70B9\u5F52\u5C5E\uFF09\uFF1A\u4E0D\u8981\u628A\u68C0\u67E5\u5668\u7ED3\u679C\u6302\u5728\u522B\u7684\u6587\u4EF6\u4E0A`
        );
      }
    }
  }
  const { state } = await deps.repository.submitVerifyReport({
    workflowId: found.workflowId,
    nodeId: found.nodeId,
    itemId,
    report
  });
  const progress = summarizeVerification(state);
  const item = state.items.find((entry) => entry.id === itemId);
  logEvent(
    deps.logger,
    "info",
    `[workflow] verify report (session=${sessionId}, item=${itemId}, mark=${item?.mark ?? "pending"}, round=${state.round}, pending=${progress.pending})`
  );
  deps.notify?.(sessionId, "verify");
  if (itemId === 8 && report.result === "pass" && progress.complete) {
    await deps.repository.transitionNode({ id: found.workflowId, nodeId: found.nodeId, to: "completed" });
    logEvent(deps.logger, "info", `[workflow] auto completed (session=${sessionId}, round=${state.round})`);
    deps.notify?.(sessionId, "advance");
  }
  return {
    item: { id: itemId, name: check.name, mark: item?.mark ?? "pending" },
    progress: {
      pass: progress.pass,
      deferred: progress.deferred,
      pending: progress.pending,
      total: progress.total
    }
  };
}
async function invokeVerifyCheck(deps, sessionId, args) {
  if (args?.done !== false) {
    throw new Error("AI \u4E0D\u80FD\u76F4\u63A5\u6253\u9A8C\u6536\u52FE\uFF1A\u5148\u8C03\u7528 workflow_verify_report \u63D0\u4EA4\u62A5\u5907\uFF0C\u6807\u8BB0\u7531\u62A5\u5907\u843D\u3002\u53D6\u6D88\u52FE\u8BF7\u4F20 done=false\u3002");
  }
  const found = await requireVerifyingNode(deps, sessionId);
  const itemId = resolveVerifyCheckId(args?.item);
  const { state, item } = await deps.repository.cancelVerifyMark({
    workflowId: found.workflowId,
    nodeId: found.nodeId,
    itemId
  });
  const progress = summarizeVerification(state);
  logEvent(
    deps.logger,
    "info",
    `[workflow] verify cancel (session=${sessionId}, item=${itemId}, round=${state.round}, pending=${progress.pending})`
  );
  deps.notify?.(sessionId, "verify");
  return {
    item: { id: itemId, mark: item.mark },
    progress: {
      pass: progress.pass,
      deferred: progress.deferred,
      pending: progress.pending,
      total: progress.total
    }
  };
}
function requireSession(deps, exec) {
  const sessionId = exec?.agent?.session?.id;
  if (typeof sessionId !== "string" || sessionId === "") throw new Error("\u8FD9\u4E2A\u5DE5\u5177\u9700\u8981\u4E00\u4E2A\u4F1A\u8BDD");
  if (!deps.isPresetSession(sessionId)) throw new Error("\u8FD9\u4E2A\u5DE5\u5177\u53EA\u5BF9\u300C\u95E8\u7981\u5DE5\u4F5C\u6D41\u6A21\u5F0F\u300D\u9884\u8BBE\u7684\u4F1A\u8BDD\u53EF\u7528");
  return sessionId;
}
async function requireVerifyingNode(deps, sessionId) {
  let state = deps.getState(sessionId);
  if (state === void 0) {
    await deps.refreshState?.(sessionId);
    state = deps.getState(sessionId);
  }
  if (state === void 0) throw new Error("\u8BFB\u4E0D\u5230\u8FD9\u4E2A\u4F1A\u8BDD\u7684\u5DE5\u4F5C\u6D41\u72B6\u6001\uFF08\u53EF\u80FD\u8FD8\u6CA1\u7ED1\u5B9A workflow \u8282\u70B9\uFF09");
  if (state !== "verifying") {
    throw new Error(`\u9A8C\u6536\u62A5\u5907\u53EA\u80FD\u5728\u300C\u9A8C\u6536\u4E2D\u300D\u63D0\u4EA4\uFF08\u5F53\u524D\u662F\u300C${labelOf(state)}\u300D\uFF09\uFF1A\u5148\u8BA9\u7528\u6237\u63A8\u8FDB\u5230\u9A8C\u6536\u4E2D\u3002`);
  }
  const found = await deps.repository.findBySession(sessionId);
  if (found === null) throw new Error("\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709 workflow \u8282\u70B9");
  return found;
}
async function assertAdvanceAllowed(repository, found, from, to) {
  if (to === "implementing" && from === "discussing") {
    const meta = await repository.getManualMeta(found.workflowId, found.nodeId);
    if (meta === null || meta.hasPlan !== true) {
      throw new Error(
        '\u4F1A\u8BDD\u624B\u518C\u7684\u300C\u65B9\u6848\u300D\u8FD8\u662F\u7A7A\u7684\uFF1A\u5148\u7528 workflow_tool_call({ name: "workflow_manual", args: { target: "session", action: "replace_section", section: "\u65B9\u6848", content: "..." } }) \u5199\u5165\u65B9\u6848\uFF0C\u518D\u63A8\u8FDB\u5230\u300C\u5B9E\u73B0\u4E2D\u300D\u3002'
      );
    }
  }
  if (to === "verifying" && from === "implementing") {
    const meta = await repository.getManualMeta(found.workflowId, found.nodeId);
    const items = meta?.checklist ?? [];
    if (items.length === 0) {
      throw new Error("\u300C\u5B9E\u65BD\u987A\u5E8F\u300D\u91CC\u8FD8\u6CA1\u6709\u6761\u76EE\uFF1A\u5148\u7528 workflow_manual \u5199\u5165\u65B9\u6848\u548C\u5B9E\u65BD\u987A\u5E8F\uFF0C\u518D\u9010\u6761\u7528 workflow_check \u52FE\u9009\u3002");
    }
    const unchecked = items.filter((item) => item.done !== true);
    if (unchecked.length > 0) {
      throw new Error(`\u8FD8\u6709 ${unchecked.length} \u6761\u6CA1\u52FE\u5B8C\uFF0C\u4E0D\u80FD\u8FDB\u300C\u9A8C\u6536\u4E2D\u300D\uFF1A${unchecked.map((item) => item.label).join(" / ")}`);
    }
  }
  if (to === "completed" && from === "verifying") {
    const verification = await repository.getVerification(found.workflowId, found.nodeId);
    const summary = summarizeVerification(verification);
    if (!summary.complete) {
      throw new Error(
        `\u9A8C\u6536\u8FD8\u6709 ${summary.pending} \u9879\u6CA1\u5904\u7406\uFF08${describePendingItems(verification)}\uFF09\uFF1A\u9010\u9879\u7528 workflow_verify_report \u62A5\u5907\uFF08pass \u8BB0 \u2713\uFF0Cdeferred \u8BB0 \uFF1F\uFF09\uFF0C\u5168\u90E8\u5904\u7406\u5B8C\u624D\u80FD\u8FDB\u300C\u5DF2\u5B8C\u7ED3\u300D\u3002`
      );
    }
    await repository.assertVerificationFresh(found.workflowId, found.nodeId);
  }
}

// src/host/session-claim.ts
function resolveSessionWorkingDirectory(ctx, sessionId) {
  if (typeof sessionId !== "string" || sessionId === "") return "";
  try {
    const session = ctx.get("sessions")?.get?.(sessionId);
    if (session === void 0 || session === null) return "";
    const fromService = ctx.get("workingDirectory")?.get?.(session);
    if (typeof fromService === "string" && fromService.trim() !== "") return fromService.trim();
    const fromHeader = session?.header?.cwd;
    return typeof fromHeader === "string" ? fromHeader.trim() : "";
  } catch {
    return "";
  }
}
async function ensureClaimedSessionNode(deps, sessionId, trigger) {
  const workingDirectory = deps.resolveWorkingDirectory(sessionId);
  if (workingDirectory === "") {
    deps.log("warn", `[workflow] auto-claim skipped (session=${sessionId}, trigger=${trigger}, reason=no-working-directory)`);
    return null;
  }
  const startedAt = Date.now();
  try {
    const node = await deps.repository.ensureNode({ sessionId, workingDirectory });
    const state = String(node.current_state);
    deps.setState(sessionId, state);
    deps.log(
      "info",
      `[workflow] auto-claim ok (session=${sessionId}, node=${node.nodeId}, state=${state}, trigger=${trigger}, ${Date.now() - startedAt}ms)`
    );
    return state;
  } catch (error) {
    deps.log(
      "warn",
      `[workflow] auto-claim failed (session=${sessionId}, trigger=${trigger}, ${Date.now() - startedAt}ms): ${String(error?.message ?? error)}`
    );
    return null;
  }
}

// src/engine/plan-sections.ts
var SECTION_HEADING = /^###\s+(\d+)\.\s*(.+?)\s*$/;
var HINT_BLOCK = /<!--([\s\S]*?)-->/;
function planSectionsFromTemplate(template) {
  const lines = template.split(/\r?\n/);
  const sections = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = SECTION_HEADING.exec(lines[index] ?? "");
    if (heading === null) continue;
    const id = Number(heading[1]);
    const title = heading[2] ?? "";
    let hint = "";
    for (let scan = index + 1; scan < lines.length; scan += 1) {
      const line = lines[scan] ?? "";
      if (SECTION_HEADING.test(line)) break;
      const hintBlock = HINT_BLOCK.exec(line);
      if (hintBlock !== null) {
        hint = (hintBlock[1] ?? "").trim();
        break;
      }
      if (line.trim() !== "") break;
    }
    sections.push({ id, title, hint });
  }
  const complete = sections.length === 6 && sections.every((section, index) => section.id === index + 1);
  return complete ? sections : [];
}

// src/host.ts
var inject = [];
function resolveDataDir() {
  const profileDir = process.env.DSH_PROFILE_DIR;
  const base = profileDir && profileDir.trim() !== "" ? profileDir : join8(homedir2(), ".dsh");
  return join8(base, "dsh-gated-workflow");
}
function resolvePackageRoot() {
  return join8(dirname7(fileURLToPath(import.meta.url)), "..");
}
function isLoopbackRequest(req) {
  try {
    const host = String(req?.headers?.host ?? "");
    return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host);
  } catch {
    return false;
  }
}
function denyRequest(res) {
  try {
    res.statusCode = 403;
    res.end("forbidden");
  } catch {
  }
}
function sendJson(res, status, value) {
  try {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(value));
  } catch {
  }
}
function readJsonBody(req) {
  return new Promise((resolve5, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("\u8BF7\u6C42\u4F53\u8FC7\u5927"));
        req.destroy?.();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve5(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("JSON \u89E3\u6790\u5931\u8D25"));
      }
    });
    req.on("error", reject);
  });
}
function routeNameOf(req) {
  const routePath = String(req?.url ?? "").split("?")[0];
  return routePath.replace(/^\/dsh-gated-workflow\//, "") || "(root)";
}
function makeHandler(ctx, repository, method, run) {
  return async (req, res) => {
    if (!isLoopbackRequest(req)) return denyRequest(res);
    if (req.method !== method) return sendJson(res, 405, { ok: false, error: `\u53EA\u63A5\u53D7 ${method}` });
    const traceId = newTraceId();
    const routeName = routeNameOf(req);
    const startedAt = Date.now();
    let body = {};
    let query = new URLSearchParams();
    try {
      if (req.method === "POST") body = await readJsonBody(req);
      const rawQuery = String((req.url ?? "").split("?")[1] ?? "");
      query = new URLSearchParams(rawQuery);
    } catch (error) {
      const message = String(error.message ?? error);
      logEvent(ctx.logger, "warn", `[workflow] route rejected (route=${routeName}, trace=${traceId}, ${Date.now() - startedAt}ms): ${message}`, traceId);
      return sendJson(res, 400, { ok: false, error: message, traceId });
    }
    try {
      const value = await run(body, query, traceId);
      sendJson(res, 200, { ok: true, traceId, ...value });
    } catch (error) {
      const message = String(error?.message ?? error);
      logEvent(ctx.logger, "warn", `[workflow] route failed (route=${routeName}, trace=${traceId}, ${Date.now() - startedAt}ms): ${message}`, traceId);
      sendJson(res, 500, { ok: false, error: message, traceId });
    }
  };
}
function apply(ctx) {
  const packageRoot = resolvePackageRoot();
  const settingsDir = join8(packageRoot, "settings");
  const toolsDir = join8(packageRoot, "tools");
  const nodeModulesBin = join8(packageRoot, "node_modules", ".bin");
  configureEventLog(resolveDataDir());
  const repository = new WorkflowRepository(resolveDataDir(), settingsDir);
  const streamClients = /* @__PURE__ */ new Set();
  const CLIENT_LOG_LIMIT = 30;
  const CLIENT_LOG_WINDOW_MS = 6e4;
  const clientLogWindow = { startedAt: 0, count: 0 };
  const clientLogAccepted = (now) => {
    if (now - clientLogWindow.startedAt >= CLIENT_LOG_WINDOW_MS) {
      clientLogWindow.startedAt = now;
      clientLogWindow.count = 0;
    }
    if (clientLogWindow.count >= CLIENT_LOG_LIMIT) return false;
    clientLogWindow.count += 1;
    return true;
  };
  const broadcast = (sessionId, reason, state) => {
    if (typeof sessionId !== "string" || sessionId === "") return;
    if (streamClients.size === 0) return;
    const payload = { sessionId, reason };
    if (typeof state === "string" && state !== "") payload.state = state;
    const frame = `data: ${JSON.stringify(payload)}

`;
    for (const client of streamClients) {
      try {
        client.write(frame);
      } catch {
        streamClients.delete(client);
      }
    }
  };
  const WORKFLOW_PRESET_ID = "workflow";
  const presetSessions = /* @__PURE__ */ new Set();
  const presetIdOf = (agentCtx) => {
    try {
      const registry = ctx.get("agentPresets");
      if (registry === void 0 || agentCtx === void 0) return null;
      return registry.composedPreset(agentCtx) ?? null;
    } catch {
      return null;
    }
  };
  const isPresetSession = (sessionId) => typeof sessionId === "string" && presetSessions.has(sessionId);
  const claim = (agent) => {
    const sessionId = agent?.session?.id;
    if (typeof sessionId !== "string" || sessionId === "") return;
    const preset = presetIdOf(agent?.ctx);
    if (preset !== WORKFLOW_PRESET_ID) {
      if (typeof preset === "string") releaseClaim(sessionId, `preset=${preset}`);
      return;
    }
    if (presetSessions.has(sessionId)) return;
    presetSessions.add(sessionId);
    void refreshSessionState(sessionId);
    void ensureNodeAndPublish(sessionId, "claim");
  };
  ctx.on("agent/created", (payload) => claim(payload?.agent));
  ctx.on("agent/pre-step", (payload, next) => {
    claim(payload?.agent);
    return next();
  });
  const sessionState = /* @__PURE__ */ new Map();
  const sessionScope = /* @__PURE__ */ new Map();
  async function refreshSessionState(sessionId) {
    try {
      const found = await repository.findBySession(sessionId);
      if (found !== null) sessionState.set(sessionId, String(found.current_state));
    } catch {
    }
    await refreshSessionScope(sessionId);
  }
  async function refreshSessionScope(sessionId) {
    try {
      const found = await repository.findBySession(sessionId);
      if (found === null || found.current_state !== "implementing") {
        sessionScope.delete(sessionId);
        return;
      }
      const checklistScope = await repository.getChecklistScope(found.workflowId, found.nodeId);
      if (checklistScope === null || checklistScope.scope.length === 0) {
        sessionScope.delete(sessionId);
      } else {
        sessionScope.set(sessionId, { workingDir: checklistScope.workingDir, scope: checklistScope.scope });
      }
    } catch {
      sessionScope.delete(sessionId);
    }
  }
  const releaseClaim = (sessionId, reason) => {
    if (!presetSessions.delete(sessionId)) return;
    sessionState.delete(sessionId);
    logEvent(ctx.logger, "info", `[workflow] released (session=${sessionId}, reason=${reason})`);
    broadcast(sessionId, "released");
  };
  const claimNodeDeps = {
    repository,
    resolveWorkingDirectory: (id) => resolveSessionWorkingDirectory(ctx, id),
    setState: (id, state) => sessionState.set(id, state),
    log: (level, message) => logEvent(ctx.logger, level, message)
  };
  const ensureNodeAndPublish = async (sessionId, trigger) => {
    const state = await ensureClaimedSessionNode(claimNodeDeps, sessionId, trigger);
    if (state !== null) broadcast(sessionId, "created", state);
    return state;
  };
  const SELF_HEAL_COOLDOWN_MS = 30 * 1e3;
  const selfHealAttemptAt = /* @__PURE__ */ new Map();
  const claimBySession = (sessionId) => {
    let currentPreset = null;
    try {
      const registry = ctx.get("agentPresets");
      const session = ctx.get("sessions")?.get?.(sessionId);
      if (registry !== void 0 && session !== void 0) {
        currentPreset = registry.presetForSession(session) ?? null;
      }
    } catch {
    }
    if (typeof currentPreset === "string" && currentPreset !== WORKFLOW_PRESET_ID) {
      releaseClaim(sessionId, `preset=${currentPreset}`);
      return false;
    }
    if (presetSessions.has(sessionId)) {
      if (!sessionState.has(sessionId)) void refreshSessionState(sessionId);
      return true;
    }
    if (currentPreset === WORKFLOW_PRESET_ID) {
      presetSessions.add(sessionId);
      void refreshSessionState(sessionId);
      void ensureNodeAndPublish(sessionId, "preset-projection");
      return true;
    }
    try {
      const agent = ctx.get("agents")?.get?.(sessionId);
      if (agent !== void 0) claim(agent);
    } catch {
    }
    return presetSessions.has(sessionId);
  };
  const stateContext = registerWorkflowStateContext(ctx, repository, isPresetSession, {
    catalogTextOf: async (state) => renderCatalogText(FACTORY_TOOLS, state)
  });
  const workflowPresetNow = (sessionId) => {
    try {
      const registry = ctx.get("agentPresets");
      const session = ctx.get("sessions")?.get?.(sessionId);
      if (registry === void 0 || session === void 0) return null;
      const preset = registry.presetForSession(session);
      if (typeof preset !== "string" || preset === "") return null;
      return preset === WORKFLOW_PRESET_ID;
    } catch {
      return null;
    }
  };
  const sessionHasMessages = (sessionId) => {
    try {
      const session = ctx.get("sessions")?.get?.(sessionId);
      const events2 = session?.snapshotEvents?.();
      if (!Array.isArray(events2)) return false;
      return events2.some((event) => event?.type === "user/message" || event?.type === "assistant/message");
    } catch {
      return false;
    }
  };
  const rawPresetOf = (sessionId) => {
    try {
      const registry = ctx.get("agentPresets");
      const session = ctx.get("sessions")?.get?.(sessionId);
      if (registry === void 0) return "(no-registry)";
      if (session === void 0) return "(no-session)";
      const preset = registry.presetForSession(session);
      return typeof preset === "string" && preset !== "" ? preset : "(empty)";
    } catch {
      return "(error)";
    }
  };
  const PENDING_ADVANCE_TTL_MS = 5 * 60 * 1e3;
  const pendingAdvances = /* @__PURE__ */ new Map();
  const guardErrors = /* @__PURE__ */ new Map();
  const readPendingAdvance = (sessionId) => {
    const pending = pendingAdvances.get(sessionId);
    if (pending === void 0) return null;
    if (Date.now() - pending.at > PENDING_ADVANCE_TTL_MS) {
      pendingAdvances.delete(sessionId);
      return null;
    }
    return { to: pending.to, ...pending.reason === void 0 ? {} : { reason: pending.reason } };
  };
  const toolsDeps = {
    repository,
    stateContext,
    nodeModulesBin,
    packageRoot,
    isPresetSession,
    /**
     * 登记 / 更新工具前的宿主审批。
     *
     * 拿不到审批服务、或它抛错，一律返回 'unavailable'——调用方按拒绝处理（fail-closed）。
     * 审批只挂「造工具」这一个动作，workflow_tool_call 不走这里。
     */
    requestApproval: async (input) => {
      try {
        const approval = ctx.get("approval");
        if (approval === void 0 || typeof approval.request !== "function") return "unavailable";
        const outcome = await approval.request({
          agent: input.agent,
          toolName: input.toolName,
          reason: input.reason
        });
        return typeof outcome === "string" ? outcome : "unavailable";
      } catch (error) {
        logEvent(
          ctx.logger,
          "warn",
          `[workflow] approval request failed (session=${input.sessionId}, tool=${input.toolName}): ${String(error?.message ?? error)}`
        );
        return "unavailable";
      }
    },
    getState: (sessionId) => sessionState.get(sessionId),
    /** 实现中范围拦截的同步缓存：null = 无范围限制（保守放行）。 */
    getScope: (sessionId) => sessionScope.get(sessionId) ?? null,
    /** extend_scope 之后刷新范围缓存，让门禁立刻读到新范围。 */
    refreshScope: (sessionId) => refreshSessionScope(sessionId),
    /** 状态表里没有这条时由工具调用方补一次（异步，能读盘）：修「认领早于绑节点 → 永久缺条」。 */
    refreshState: (sessionId) => refreshSessionState(sessionId),
    setState: (sessionId, state) => sessionState.set(sessionId, state),
    logger: ctx.logger,
    requestAdvance: (input) => {
      pendingAdvances.set(input.sessionId, {
        to: input.to,
        ...typeof input.reason === "string" && input.reason !== "" ? { reason: input.reason } : {},
        at: Date.now()
      });
      broadcast(input.sessionId, "pending");
    },
    pendingAdvanceOf: (sessionId) => readPendingAdvance(sessionId),
    clearPendingAdvance: (sessionId) => {
      pendingAdvances.delete(sessionId);
      broadcast(sessionId, "pending-cleared");
    },
    // 报备 / 撤勾不动状态，但徽标 n/7 会变：复用同一条推送通道让页面重取。
    notify: (sessionId, reason) => broadcast(sessionId, reason),
    // 门禁异常：记录错误（徽标变红）或清除；变化时推一帧让开着的那一页立刻重取。
    reportGuardError: (sessionId, message) => {
      if (typeof message === "string" && message !== "") {
        if (guardErrors.get(sessionId) !== message) {
          guardErrors.set(sessionId, message);
          broadcast(sessionId, "guard");
        }
      } else if (guardErrors.delete(sessionId)) {
        broadcast(sessionId, "guard");
      }
    }
  };
  registerWorkflowGuard(ctx, toolsDeps);
  registerWorkflowTools(ctx, toolsDeps);
  const markState = (sessionId, state) => {
    sessionState.set(sessionId, state);
  };
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/stream",
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) return denyRequest(res);
        try {
          res.writeHead(200, {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
            connection: "keep-alive",
            // 有些反代会攒包，显式关掉缓冲；本机访问通常用不到，但写了不亏。
            "x-accel-buffering": "no"
          });
          res.write(": connected\n\n");
        } catch {
          return;
        }
        streamClients.add(res);
        logEvent(ctx.logger, "info", `[workflow] stream connected (clients=${streamClients.size})`);
        const heartbeat = setInterval(() => {
          try {
            res.write(": ping\n\n");
          } catch {
          }
        }, 2e4);
        const cleanup = () => {
          clearInterval(heartbeat);
          streamClients.delete(res);
        };
        req.on?.("close", cleanup);
        res.on?.("close", cleanup);
        res.on?.("error", cleanup);
      }
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/list",
      handler: makeHandler(ctx, repository, "GET", async () => ({ items: await repository.list() }))
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/create",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.path !== "string" || body.path.trim() === "") {
          throw new Error("\u7F3A\u5C11\u5DE5\u4F5C\u76EE\u5F55 path");
        }
        const workspace = await repository.create({
          title: body.title,
          path: body.path.trim(),
          hostWorkspaceId: typeof body.hostWorkspaceId === "string" ? body.hostWorkspaceId : void 0
        });
        return { workspace };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/get",
      handler: makeHandler(ctx, repository, "GET", async (_body, query) => {
        const id = query.get("id");
        if (typeof id !== "string" || id === "") throw new Error("\u7F3A\u5C11 id");
        const snapshot = await repository.get(id);
        if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
        return { snapshot };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/state-context",
      handler: makeHandler(ctx, repository, "GET", async (_body, query) => {
        const sessionId = query.get("sessionId");
        if (typeof sessionId !== "string" || sessionId === "") throw new Error("\u7F3A\u5C11 sessionId");
        return { text: await stateContext.peek(sessionId) };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/app-settings",
      handler: makeHandler(ctx, repository, "GET", async () => {
        const settings = await repository.getAppSettings();
        return { autoSendEnterTrigger: settings.autoSendEnterTrigger, manualLimits: settings.manualLimits };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/app-settings-save",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        const saved = await repository.updateAppSettings({
          autoSendEnterTrigger: body?.autoSendEnterTrigger === void 0 ? void 0 : body.autoSendEnterTrigger === true,
          manualLimits: body?.manualLimits
        });
        logEvent(ctx.logger, "info", `[workflow] app-settings saved (autoSend=${saved.autoSendEnterTrigger}, \u7EA6\u675F=${saved.manualLimits.constraints_chars}\u5B57, \u65B9\u6848=${saved.manualLimits.plan_chars}\u5B57, \u6574\u672C=${saved.manualLimits.session_total_chars}\u5B57)`);
        return { autoSendEnterTrigger: saved.autoSendEnterTrigger, manualLimits: saved.manualLimits };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/appendix",
      handler: makeHandler(ctx, repository, "GET", async (_body, _query, traceId) => {
        const startedAt = Date.now();
        const template = await repository.readSessionManualTemplate();
        const planSections = planSectionsFromTemplate(template);
        const verifyItems = VERIFY_CHECKS.map((check) => ({
          id: check.id,
          name: check.name,
          judge: check.judge,
          needsCommand: check.needs_command
        }));
        logEvent(
          ctx.logger,
          "info",
          `[workflow] appendix (plan=${planSections.length}/5, verify=${verifyItems.length}, fallback=${String(planSections.length === 0)}, ${Date.now() - startedAt}ms)`,
          traceId
        );
        return {
          planSections,
          // 解析凑不齐五节时给整段原文兜底：宁可显示得丑，不能显示成空清单。
          planFallback: planSections.length === 0 ? template : "",
          verifyItems
        };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/global-settings",
      handler: makeHandler(ctx, repository, "GET", async (_body, _query, traceId) => {
        const startedAt = Date.now();
        const globalOperationDetail = await repository.getAppGlobalOperationDetail();
        const profiles = await repository.listProfiles();
        logEvent(ctx.logger, "info", `[workflow] global-settings ok (active=${profiles.active}, ${Date.now() - startedAt}ms)`, traceId);
        return { globalOperationDetail, defaults: DEFAULT_GLOBAL_OPERATION_DETAIL, profiles: profiles.names, activeProfile: profiles.active };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/global-settings-save",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (body?.globalOperationDetail === void 0 || body.globalOperationDetail === null) {
          throw new Error("\u7F3A\u5C11 globalOperationDetail");
        }
        const startedAt = Date.now();
        const globalOperationDetail = await repository.updateAppGlobalOperationDetail(body.globalOperationDetail);
        logEvent(ctx.logger, "info", `[workflow] global-settings-save ok (shared=${Buffer.byteLength(String(globalOperationDetail.shared_detail ?? ""), "utf8")}B, ${Date.now() - startedAt}ms)`, traceId);
        return { globalOperationDetail };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/profiles-save",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (typeof body?.name !== "string" || body.name.trim() === "") throw new Error("\u7F3A\u5C11 name");
        const profiles = await repository.saveProfile(body.name, body.globalOperationDetail);
        const globalOperationDetail = await repository.getAppGlobalOperationDetail();
        logEvent(ctx.logger, "info", `[workflow] profiles-save ok (name=${profiles.active}, total=${profiles.names.length})`, traceId);
        return { active: profiles.active, profiles: profiles.names, globalOperationDetail };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/profiles-activate",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (typeof body?.name !== "string" || body.name === "") throw new Error("\u7F3A\u5C11 name");
        const profiles = await repository.activateProfile(body.name);
        const globalOperationDetail = await repository.getAppGlobalOperationDetail();
        logEvent(ctx.logger, "info", `[workflow] profiles-activate ok (active=${profiles.active})`, traceId);
        return { active: profiles.active, profiles: profiles.names, globalOperationDetail };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/profiles-delete",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (typeof body?.name !== "string" || body.name === "") throw new Error("\u7F3A\u5C11 name");
        const profiles = await repository.deleteProfile(body.name);
        const globalOperationDetail = await repository.getAppGlobalOperationDetail();
        logEvent(ctx.logger, "info", `[workflow] profiles-delete ok (deleted=${body.name}, active=${profiles.active})`, traceId);
        return { active: profiles.active, profiles: profiles.names, globalOperationDetail };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/profiles-export",
      handler: makeHandler(ctx, repository, "POST", async (_body, _query, traceId) => {
        const exported = await repository.exportActiveProfile();
        spawn2("explorer.exe", [join8(exported.path, "..")], { stdio: "ignore", detached: true }).unref();
        logEvent(ctx.logger, "info", `[workflow] profiles-export ok (name=${exported.name})`, traceId);
        return exported;
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/profiles-import",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (typeof body?.json !== "string" || body.json.trim() === "") throw new Error("\u7F3A\u5C11 json\uFF1A\u8BF7\u7C98\u8D34\u5BFC\u51FA\u7684\u6587\u4EF6\u5185\u5BB9");
        const result = await repository.importProfile(typeof body.name === "string" ? body.name : "", body.json);
        logEvent(ctx.logger, "info", `[workflow] profiles-import ok (name=${result.imported})`, traceId);
        return { imported: result.imported, profiles: result.names };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/node-detail",
      handler: makeHandler(ctx, repository, "GET", async (_body, query) => {
        const id = query.get("id");
        const nodeId = query.get("nodeId");
        if (typeof id !== "string" || id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof nodeId !== "string" || nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        const snapshot = await repository.get(id);
        if (snapshot === null) throw new Error("\u627E\u4E0D\u5230\u8BE5 workflow");
        const node = snapshot.nodes.find((candidate) => candidate.node_id === nodeId);
        if (node === void 0) throw new Error("\u627E\u4E0D\u5230\u8282\u70B9");
        const global = await repository.getAppGlobalOperationDetail();
        return {
          node: { node_id: node.node_id, title: node.title ?? "", current_state: node.current_state, history: node.history ?? [] },
          global,
          effective: effectiveDetail(node.current_state, node, global),
          overrides: node.state_detail_overrides ?? null,
          additional: node.additional_detail ?? null
        };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/node-note",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.nodeId !== "string" || body.nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        if (typeof body?.state !== "string" || body.state === "") throw new Error("\u7F3A\u5C11 state");
        if (typeof body?.text !== "string") throw new Error("\u7F3A\u5C11 text");
        const startedAt = Date.now();
        try {
          const snapshot = await repository.setNodeNote({ id: body.id, nodeId: body.nodeId, state: body.state, text: body.text });
          logEvent(ctx.logger, "info", `[workflow] node-note ok (node=${body.nodeId}, state=${body.state}, ${Date.now() - startedAt}ms)`);
          return { snapshot };
        } catch (error) {
          logEvent(ctx.logger, "warn", `[workflow] node-note failed (node=${body.nodeId}, state=${body.state}, ${Date.now() - startedAt}ms): ${String(error?.message ?? error)}`);
          throw error;
        }
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/node-by-session",
      handler: makeHandler(ctx, repository, "GET", async (_body, query, traceId) => {
        const sessionId = query.get("sessionId");
        if (typeof sessionId !== "string" || sessionId === "") throw new Error("\u7F3A\u5C11 sessionId");
        const hasMessages = sessionHasMessages(sessionId);
        if (!claimBySession(sessionId)) return { node: null, enabled: false, hasMessages };
        const startedAt = Date.now();
        let node = await repository.findBySession(sessionId);
        if (node === null && Date.now() - (selfHealAttemptAt.get(sessionId) ?? 0) >= SELF_HEAL_COOLDOWN_MS) {
          selfHealAttemptAt.set(sessionId, Date.now());
          const healedState = await ensureNodeAndPublish(sessionId, "node-by-session");
          if (healedState !== null) node = await repository.findBySession(sessionId);
        }
        if (node === null) {
          logEvent(ctx.logger, "info", `[workflow] node-by-session none (session=${sessionId}, ${Date.now() - startedAt}ms)`, traceId);
          return { node: null, hasMessages };
        }
        const snapshot = await repository.get(node.workflowId);
        const found = snapshot?.nodes.find((candidate) => candidate.node_id === node.nodeId);
        let enterTrigger = "";
        if (found !== void 0) {
          const global = await repository.getAppGlobalOperationDetail();
          const effective = effectiveDetail(found.current_state, found, global);
          enterTrigger = typeof effective.enter_trigger === "string" ? effective.enter_trigger : "";
        }
        logEvent(ctx.logger, "info", `[workflow] node-by-session ok (node=${node.nodeId}, state=${node.current_state}, ${Date.now() - startedAt}ms)`, traceId);
        return { node: { ...node, enter_trigger: enterTrigger }, pendingAdvance: readPendingAdvance(sessionId), guardError: guardErrors.get(sessionId) ?? null, hasMessages };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/sidebar-nodes",
      handler: makeHandler(ctx, repository, "GET", async (_body, query) => {
        const path2 = query.get("path");
        const startedAt = Date.now();
        const onBroken = (fileName, error) => {
          logEvent(ctx.logger, "warn", `[workflow] sidebar-nodes skipped broken snapshot (file=${fileName}): ${String(error?.message ?? error)}`);
        };
        const nodes = await readSidebarNodes(repository, path2, onBroken);
        let hiddenByPreset = 0;
        for (const sessionId of Object.keys(nodes)) {
          if (workflowPresetNow(sessionId) === false) {
            delete nodes[sessionId];
            hiddenByPreset += 1;
          }
        }
        const mode = typeof path2 === "string" && path2.trim() !== "" ? "directory" : "all";
        const hiddenNote = hiddenByPreset === 0 ? "" : `, hidden=${hiddenByPreset}`;
        logEvent(ctx.logger, "info", `[workflow] sidebar-nodes ok (mode=${mode}, nodes=${Object.keys(nodes).length}${hiddenNote}, ${Date.now() - startedAt}ms)`);
        return { nodes };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/events",
      handler: makeHandler(ctx, repository, "GET", async (_body, query) => {
        const rawLimit = Number(query.get("limit") ?? "100");
        return { events: recentEvents(Number.isFinite(rawLimit) ? rawLimit : 100) };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/client-log",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        const level = body?.level === "warn" ? "warn" : "info";
        const message = typeof body?.message === "string" ? body.message.trim() : "";
        if (message === "") throw new Error("\u7F3A\u5C11 message");
        if (!clientLogAccepted(Date.now())) {
          return { accepted: false };
        }
        logEvent(ctx.logger, level, `[workflow] client ${message.slice(0, 200)}`, traceId);
        return { accepted: true };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/bind-session",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.nodeId !== "string" || body.nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        if (typeof body?.sessionId !== "string") throw new Error("\u7F3A\u5C11 sessionId");
        const startedAt = Date.now();
        const snapshot = await repository.bindSession({ id: body.id, nodeId: body.nodeId, sessionId: body.sessionId });
        const sessionId = body.sessionId.trim();
        if (sessionId !== "") await stateContext.refreshNow(sessionId);
        logEvent(ctx.logger, "info", `[workflow] bind-session (node=${body.nodeId}, bound=${sessionId !== ""}, ${Date.now() - startedAt}ms)`, traceId);
        return { snapshot };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/approve-advance",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.sessionId !== "string" || body.sessionId === "") throw new Error("\u7F3A\u5C11 sessionId");
        const pending = readPendingAdvance(body.sessionId);
        if (pending === null) throw new Error("\u6CA1\u6709\u5F85\u786E\u8BA4\u7684\u63A8\u8FDB\u8BF7\u6C42\uFF08\u53EF\u80FD\u5DF2\u8D85\u65F6\u6216\u5DF2\u5904\u7406\uFF09");
        if (body.accept !== true) {
          pendingAdvances.delete(body.sessionId);
          logEvent(ctx.logger, "info", `[workflow] advance rejected by user (session=${body.sessionId}, to=${pending.to})`);
          broadcast(body.sessionId, "pending-cleared");
          return { accepted: false, requested: pending.to };
        }
        const found = await repository.findBySession(body.sessionId);
        if (found === null) throw new Error("\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709 workflow \u8282\u70B9");
        const from = String(found.current_state);
        await assertAdvanceAllowed(repository, found, from, pending.to);
        const snapshot = await repository.transitionNode({ id: found.workflowId, nodeId: found.nodeId, to: pending.to, by: "agent-request" });
        pendingAdvances.delete(body.sessionId);
        markState(body.sessionId, pending.to);
        await refreshSessionScope(body.sessionId);
        await stateContext.refreshNow(body.sessionId);
        logEvent(ctx.logger, "info", `[workflow] advance accepted by user (session=${body.sessionId}, ${from}\u2192${pending.to})`);
        broadcast(body.sessionId, "state", pending.to);
        return { accepted: true, snapshot };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/delete",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        await repository.remove(body.id);
        logEvent(ctx.logger, "info", `[workflow] delete\u2192trash (id=${body.id})`);
        return { deleted: body.id };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/trash-list",
      handler: makeHandler(ctx, repository, "GET", async () => ({ items: await repository.listTrash() }))
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/trash-restore",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        const restored = await repository.restoreFromTrash(body.id);
        logEvent(ctx.logger, "info", `[workflow] trash-restore (id=${body.id}, ok=${String(restored)})`);
        return { restored };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/link-workspace",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.hostWorkspaceId !== "string") throw new Error("\u7F3A\u5C11 hostWorkspaceId");
        const snapshot = await repository.linkWorkspace({ id: body.id, hostWorkspaceId: body.hostWorkspaceId });
        return { snapshot };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/ensure-node",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.sessionId !== "string" || body.sessionId === "") throw new Error("\u7F3A\u5C11 sessionId");
        const workingDirectory = typeof body?.workingDirectory === "string" && body.workingDirectory.trim() !== "" ? body.workingDirectory.trim() : resolveSessionWorkingDirectory(ctx, body.sessionId);
        if (workingDirectory === "") throw new Error("\u7F3A\u5C11 workingDirectory\uFF08\u5BBF\u4E3B\u4E5F\u89E3\u6790\u4E0D\u5230\u8BE5\u4F1A\u8BDD\u7684\u5DE5\u4F5C\u76EE\u5F55\uFF09");
        if (!claimBySession(body.sessionId)) {
          const knownSession = (() => {
            try {
              return ctx.get("sessions")?.get?.(body.sessionId);
            } catch {
              return void 0;
            }
          })();
          if (knownSession !== void 0) {
            logEvent(ctx.logger, "info", `[workflow] ensure-node skipped (session=${body.sessionId}, preset=${rawPresetOf(body.sessionId)})`);
            return { node: null, enabled: false };
          }
          if (body.test !== true) {
            logEvent(ctx.logger, "warn", `[workflow] ensure-node refused (session=${body.sessionId}, reason=unknown-session-without-test-flag)`);
            return { node: null, enabled: false };
          }
          presetSessions.add(body.sessionId);
          logEvent(ctx.logger, "info", `[workflow] ensure-node for test session (session=${body.sessionId})`);
        }
        const startedAt = Date.now();
        try {
          const node = await repository.ensureNode({ sessionId: body.sessionId, workingDirectory });
          logEvent(ctx.logger, "info", `[workflow] ensure-node ok (node=${node.nodeId}, ${Date.now() - startedAt}ms)`);
          broadcast(body.sessionId, "created", String(node.current_state));
          return { node };
        } catch (error) {
          logEvent(ctx.logger, "warn", `[workflow] ensure-node failed (${Date.now() - startedAt}ms): ${String(error?.message ?? error)}`);
          throw error;
        }
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/node-manual",
      handler: makeHandler(ctx, repository, "GET", async (_body, query, traceId) => {
        const id = query.get("id");
        const nodeId = query.get("nodeId");
        if (typeof id !== "string" || id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof nodeId !== "string" || nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        const startedAt = Date.now();
        const manual = await repository.readNodeManual(id, nodeId);
        const globalManual = await repository.readGlobalManual(id);
        logEvent(ctx.logger, "info", `[workflow] node-manual (node=${nodeId}, exists=${String(manual !== null)}, manual=${manual === null ? 0 : Buffer.byteLength(manual.manual, "utf8")}B, global=${Buffer.byteLength(globalManual, "utf8")}B, ${Date.now() - startedAt}ms)`, traceId);
        return { manual, globalManual };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/node-checklist",
      handler: makeHandler(ctx, repository, "GET", async (_body, query, traceId) => {
        const id = query.get("id");
        const nodeId = query.get("nodeId");
        if (typeof id !== "string" || id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof nodeId !== "string" || nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        const startedAt = Date.now();
        const meta = await repository.getManualMeta(id, nodeId);
        const verification = await repository.getVerification(id, nodeId);
        const verificationView = verification.items.map((item) => ({
          id: item.id,
          name: VERIFY_CHECKS.find((check) => check.id === item.id)?.name ?? "",
          mark: item.mark,
          summary: item.report?.summary ?? ""
        }));
        logEvent(ctx.logger, "info", `[workflow] node-checklist (node=${nodeId}, exists=${String(meta !== null)}, items=${meta?.checklist.length ?? 0}, verify=${verificationView.filter((item) => item.mark !== "pending").length}/7, ${Date.now() - startedAt}ms)`, traceId);
        return {
          exists: meta !== null,
          checklist: meta?.checklist ?? [],
          hasPlan: meta?.hasPlan ?? false,
          verification: verificationView,
          verificationRound: verification.round
        };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/node-verification",
      handler: makeHandler(ctx, repository, "GET", async (_body, query, traceId) => {
        const id = query.get("id");
        const nodeId = query.get("nodeId");
        if (typeof id !== "string" || id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof nodeId !== "string" || nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        const verification = await repository.getVerification(id, nodeId);
        const items = verification.items.map((item) => {
          const check = VERIFY_CHECKS.find((candidate) => candidate.id === item.id);
          const report = item.report;
          const runs = verification.checker_runs.filter((run) => run.checker_id === check?.checker?.id);
          const latestRun = runs.length > 0 ? runs[runs.length - 1] : void 0;
          return {
            id: item.id,
            name: check?.name ?? "",
            mark: item.mark,
            summary: report?.summary ?? "",
            command: typeof report?.command === "string" ? report.command : "",
            checker: report?.checker ?? null,
            findings: Array.isArray(report?.findings) ? report.findings : [],
            at: report?.at ?? "",
            latestRun: latestRun ?? null
          };
        });
        logEvent(ctx.logger, "info", `[workflow] node-verification (node=${nodeId}, round=${verification.round}, runs=${verification.checker_runs.length})`, traceId);
        return { round: verification.round, items, checkerRuns: verification.checker_runs };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/export-report",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.nodeId !== "string" || body.nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        const exported = await repository.exportVerificationReport(body.id, body.nodeId);
        spawn2("explorer.exe", [dirname7(exported.path)], { stdio: "ignore", detached: true }).unref();
        logEvent(ctx.logger, "info", `[workflow] export-report ok (node=${body.nodeId}, name=${exported.name})`, traceId);
        return exported;
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/open-folder",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        const target = body?.path;
        if (typeof target !== "string" || target.trim() === "") throw new Error("\u7F3A\u5C11 path");
        spawn2("explorer.exe", [target.trim()], { stdio: "ignore", detached: true }).unref();
        return { opened: true };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/verify-report",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.nodeId !== "string" || body.nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        const itemId = resolveVerifyCheckId(body?.item);
        const check = VERIFY_CHECKS.find((entry) => entry.id === itemId);
        if (check === void 0) throw new Error(`\u6CA1\u6709 ${itemId} \u53F7\u9A8C\u6536\u9879`);
        const startedAt = Date.now();
        const report = validateVerifyReportInput(check, body);
        const { state, item } = await repository.submitVerifyReport({
          workflowId: body.id,
          nodeId: body.nodeId,
          itemId,
          report
        });
        logEvent(
          ctx.logger,
          "info",
          `[workflow] verify report via http (node=${body.nodeId}, item=${itemId}, mark=${item?.mark ?? "pending"}, round=${state.round}, ${Date.now() - startedAt}ms)`,
          traceId
        );
        return { item: { id: itemId, mark: item?.mark ?? "pending" }, round: state.round };
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/transition",
      handler: makeHandler(ctx, repository, "POST", async (body, _query, traceId) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        if (typeof body?.nodeId !== "string" || body.nodeId === "") throw new Error("\u7F3A\u5C11 nodeId");
        if (typeof body?.to !== "string" || body.to === "") throw new Error("\u7F3A\u5C11 to");
        const startedAt = Date.now();
        try {
          const before = await repository.get(body.id);
          const nodeBefore = before?.nodes.find((node) => node.node_id === body.nodeId);
          if (nodeBefore !== void 0) {
            await assertAdvanceAllowed(
              repository,
              { workflowId: body.id, nodeId: body.nodeId, current_state: nodeBefore.current_state },
              String(nodeBefore.current_state),
              body.to
            );
          }
          const snapshot = await repository.transitionNode({ id: body.id, nodeId: body.nodeId, to: body.to, by: "human" });
          const moved = snapshot.nodes.find((node) => node.node_id === body.nodeId);
          if (typeof moved?.session_id === "string" && moved.session_id !== "") {
            pendingAdvances.delete(moved.session_id);
            markState(moved.session_id, body.to);
            await refreshSessionScope(moved.session_id);
            await stateContext.refreshNow(moved.session_id);
            broadcast(moved.session_id, "state", body.to);
          }
          const lastEntry = moved?.history?.[moved.history.length - 1];
          logEvent(ctx.logger, "info", `[workflow] transition ok (node=${body.nodeId}, from=${lastEntry?.from ?? "?"}, to=${body.to}, ${Date.now() - startedAt}ms)`, traceId);
          return { snapshot };
        } catch (error) {
          logEvent(ctx.logger, "warn", `[workflow] transition failed (node=${body.nodeId}, to=${body.to}, ${Date.now() - startedAt}ms): ${String(error?.message ?? error)}`, traceId);
          throw error;
        }
      })
    }));
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/dsh-gated-workflow/pin",
      handler: makeHandler(ctx, repository, "POST", async (body) => {
        if (typeof body?.id !== "string" || body.id === "") throw new Error("\u7F3A\u5C11 id");
        const snapshot = await repository.setPinned({ id: body.id, pinned: body.pinned === true });
        return { snapshot };
      })
    }));
  });
}
export {
  apply,
  inject
};
