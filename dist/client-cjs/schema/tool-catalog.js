"use strict";
/**
 * 工具目录的数据形状与基础工具定义。
 *
 * 为什么要有目录：模型不再直接看到 5 个原生工具，只能通过网关按名字调用；
 * 目录是「有哪些工具、各在什么阶段可用、参数长什么样」的唯一真源。
 *
 * 本文件必须保持**无运行时依赖**：客户端半的 tsconfig 也会编译 src/schema，
 * 这里不能引 zod、不能引 node 内置模块。
 *
 * 2026-11-13 起工具集分两类：基础工具（代码定义）与扩展工具（登记而来，执行体只能是脚本）。
 * 两类同型（ToolEntry），靠 kind 区分；分类名只在这里定义，别处一律读标签表。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTENSION_TOOLS = exports.BASE_TOOLS = exports.ALL_STATES = exports.TOOL_KIND_LABEL = exports.TOOL_KIND = void 0;
/** 工具分类：定义在 tool-kind.ts（客户端只引那一份），这里 re-export 方便宿主侧使用。 */
var tool_kind_1 = require("./tool-kind");
Object.defineProperty(exports, "TOOL_KIND", { enumerable: true, get: function () { return tool_kind_1.TOOL_KIND; } });
Object.defineProperty(exports, "TOOL_KIND_LABEL", { enumerable: true, get: function () { return tool_kind_1.TOOL_KIND_LABEL; } });
const tool_kind_2 = require("./tool-kind");
exports.ALL_STATES = ['discussing', 'implementing', 'verifying', 'completed'];
const ANCHOR_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['file'],
    properties: {
        file: { type: 'string', description: '工作目录内的相对路径' },
        line: { type: 'number', description: '可选行号；程序会核对它不超过文件行数' },
    },
};
const FINDING_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['location', 'problem', 'why_not_fixed', 'impact'],
    properties: {
        location: { type: 'string' },
        problem: { type: 'string' },
        why_not_fixed: { type: 'string' },
        impact: { type: 'string' },
    },
};
/**
 * 五个基础工具：name 就是分派键，parameters 是给模型的参数 schema。
 * description 的第一句会被注入系统提示（见 tool-policy 的 summarizeDescription），
 * 所以第一句必须能独立说明「什么时候用」。
 */
exports.BASE_TOOLS = [
    {
        name: 'workflow_advance',
        description: '请求把工作流推进到下一阶段，需要你点同意。'
            + '只登记请求、不改状态：用户必须在界面上点「同意」才生效（5 分钟未处理作废）；返工（向后）必须给 reason。'
            + '讨论中→实现中前方案必须已写入会话手册；实现中→验收中前实施顺序必须全部勾选；验收中→已完结前七项必须全部报备。'
            + '收尾时把四件事写进项目手册（新决策 / 新坑 / 都没有写「无」 / 文档与实现是否一致），再同步会话手册。',
        kind: tool_kind_2.TOOL_KIND.base,
        allowed_states: [...exports.ALL_STATES],
        effect: 'write-state',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['to'],
            properties: {
                to: {
                    type: 'string',
                    enum: ['discussing', 'implementing', 'verifying', 'completed'],
                    description: 'Requested stage. Forward = normal progression; backward = rework.',
                },
                reason: { type: 'string', description: 'Required when moving backward (rework): why the previous stage was insufficient.' },
            },
        },
    },
    {
        name: 'workflow_manual',
        description: '读写会话手册与项目手册。'
            + '会话手册只能改「方案」和「实施顺序」（后者仅讨论中，之后只能勾选）；项目手册条目用 append_entry / update_entry 写，必须带 1 个以上标签。'
            + 'replace_section 只替换一个小节正文；remove_entry 删除条目、rename_tag 合并标签。'
            + '方案上限 1200 字、约束 300 字、会话手册整本 2000 字，超了拒写；勾选证据不计入。',
        kind: tool_kind_2.TOOL_KIND.base,
        allowed_states: [...exports.ALL_STATES],
        effect: 'write-state',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['target', 'action'],
            properties: {
                target: { type: 'string', enum: ['session', 'project'], description: 'Which manual to touch.' },
                action: {
                    type: 'string',
                    enum: ['read', 'replace_section', 'append_entry', 'update_entry', 'remove_entry', 'rename_tag'],
                    description: 'read returns text; replace_section rewrites a whole section (session 方案 / project 标签表); append_entry / update_entry / remove_entry write ONE tagged entry into a project section; rename_tag merges or renames a tag and rewrites every entry that uses it.',
                },
                section: { type: 'string', description: 'Section name (e.g. 方案 / 项目总览 / 决策记录 / 约束 / 坑与防线 / 标签表).' },
                content: { type: 'string', description: 'Entry text (append_entry / update_entry) or new section body (replace_section).' },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Required for append_entry / update_entry: 1+ tags, each ≤12 chars, no brackets or ｜. Pick from the injected 标签表 (or a real file name in this project); unknown tags get registered automatically until the table is full.',
                },
                entry: { type: 'string', description: 'update_entry / remove_entry: exact body text of the existing entry (without its [tags] prefix).' },
                from: { type: 'string', description: 'rename_tag: the tag to replace.' },
                to: { type: 'string', description: 'rename_tag: the tag to keep. Use this to merge synonyms when the table is full.' },
            },
        },
    },
    {
        name: 'workflow_check',
        description: '勾选或取消实施顺序里的条目，勾选必须带证据。'
            + '条目文本必须完全一致，不能新增、改写或重排；讨论中不可用；全部勾完才能进「验收中」。'
            + '证据写进清单行，例：跑 node test.mjs，12 项全过。',
        kind: tool_kind_2.TOOL_KIND.base,
        allowed_states: ['implementing', 'verifying', 'completed'],
        effect: 'write-state',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['item', 'done'],
            properties: {
                item: { type: 'string', description: 'Exact text of an existing checklist item.' },
                done: { type: 'boolean', description: 'true = checked, false = unchecked.' },
                evidence: { type: 'string', description: '勾选时必填：这一层怎么验的、结果是什么（自由文本，例：跑 node test.mjs，12 项全过）。取消勾选可省略。' },
            },
        },
    },
    {
        name: 'workflow_verify_report',
        description: '为七项验收中的一项提交报备：通过记 ✓，查出问题不修记 ？。'
            + '必须带至少一个工作目录内真实存在的锚点（文件 + 可选行号）；deferred 还要写 findings（位置/问题/为什么不修/影响）。'
            + '第 1/4/7 项必须带复跑命令。每次进入验收中轮次 +1，旧报备自动失效。',
        kind: tool_kind_2.TOOL_KIND.base,
        allowed_states: ['verifying'],
        effect: 'write-state',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['item', 'result', 'summary', 'anchors'],
            properties: {
                item: { type: 'string', anyOf: [{ type: 'string' }, { type: 'number' }], description: '验收项：id 1-7 或名称（例：3 或「死代码扫描」）' },
                result: { type: 'string', enum: ['pass', 'deferred'], description: 'pass = 通过；deferred = 查出问题但本轮不修（记 ？）' },
                summary: { type: 'string', description: '结论摘要：做了什么、看到什么结果。' },
                anchors: { type: 'array', items: ANCHOR_SCHEMA, description: '证据锚点，至少一条；文件必须在工作目录内。' },
                command: { type: 'string', description: '复跑命令；契约测试 / 边界测试 / 回归压测三项必填。' },
                findings: { type: 'array', items: FINDING_SCHEMA, description: 'deferred 时必填：每条写清 位置 / 问题 / 为什么不修 / 影响什么。' },
            },
        },
    },
    {
        name: 'workflow_verify_check',
        description: '撤回某项验收标记（只能撤，不能打勾）。'
            + '标记只能由 workflow_verify_report 产生；需要重新打勾就重新报备。只能在「验收中」用。',
        kind: tool_kind_2.TOOL_KIND.base,
        allowed_states: ['verifying'],
        effect: 'write-state',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['item', 'done'],
            properties: {
                item: { type: 'string', anyOf: [{ type: 'string' }, { type: 'number' }], description: '验收项：id 1-7 或名称' },
                done: { type: 'boolean', description: '只能是 false（取消勾）。传 true 会被拒。' },
            },
        },
    },
];
/**
 * 出厂扩展工具：全部指向 `src/engine/checkers` 里的检查器，随代码分发。
 *
 * 为什么在代码里而不是 JSON：checker 的实现也在代码里，定义和实现分开两处迟早对不上。
 * 开发期仍可用 `workflow_tool_add` 往 `tools/tool-registry.json` 加额外工具，那是增量，不在这里。
 */
exports.EXTENSION_TOOLS = [
    {
        name: 'check_contract',
        description: '跑契约测试并判结果。先执行 vitest run test 生成证据，再判用例数与失败数：0 个用例、有失败都报不合格。',
        kind: tool_kind_2.TOOL_KIND.extension,
        run: { kind: 'checker', checker: 'contract' },
        allowed_states: ['verifying'],
        effect: 'read-state',
        parameters: { type: 'object', properties: {}, additionalProperties: true },
        version: 1,
    },
    {
        name: 'check_deps',
        description: '跑依赖边界检查并判结果。先执行 dependency-cruiser 扫描 src，再把循环依赖与跨层引用报成不合格。',
        kind: tool_kind_2.TOOL_KIND.extension,
        run: { kind: 'checker', checker: 'deps' },
        allowed_states: ['verifying'],
        effect: 'read-state',
        parameters: { type: 'object', properties: {}, additionalProperties: true },
        version: 1,
    },
    {
        name: 'check_deadcode',
        description: '跑死代码扫描并判结果。先执行 knip，再把未使用的文件 / 导出 / 依赖报成不合格。',
        kind: tool_kind_2.TOOL_KIND.extension,
        run: { kind: 'checker', checker: 'deadcode' },
        allowed_states: ['verifying'],
        effect: 'read-state',
        parameters: { type: 'object', properties: {}, additionalProperties: true },
        version: 1,
    },
    {
        name: 'check_boundary',
        description: '跑边界测试并判结果。先执行 vitest run test/boundary 生成证据，再判用例数与失败数，与契约测试分开取证据。',
        kind: tool_kind_2.TOOL_KIND.extension,
        run: { kind: 'checker', checker: 'boundary' },
        allowed_states: ['verifying'],
        effect: 'read-state',
        parameters: { type: 'object', properties: {}, additionalProperties: true },
        version: 1,
    },
    {
        name: 'check_regression',
        description: '检查回归与压测证据（不自动跑，压测目标由项目自己定）。读 .workflow/evidence/regression.json，判用例数与失败数，耗时随结果返回。',
        kind: tool_kind_2.TOOL_KIND.extension,
        run: { kind: 'checker', checker: 'regression' },
        allowed_states: ['verifying'],
        effect: 'read-state',
        parameters: { type: 'object', properties: {}, additionalProperties: true },
        version: 1,
    },
];
//# sourceMappingURL=tool-catalog.js.map