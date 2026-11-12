// @ts-nocheck
/**
 * 别名目录的持久化：<baseDir>/tool-aliases.json，按 workflow_id 分组。
 *
 * 只暴露 load / list / add / snapshot 四个口，上层不直接碰文件。
 * 文件损坏时返回 corrupt=true + 空别名（基础工具不受影响），
 * 让调用方把「别名不可用」和「没有别名」分开记。
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ALL_STATES } from '../schema/tool-catalog';
const FILE_VERSION = 1;
function emptyFile() {
    return { version: FILE_VERSION, byWorkflow: {} };
}
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** 单个条目收窄：任何必填字段缺失都丢弃该条（坏数据不能进目录）。 */
function normalizeEntry(raw) {
    if (!isPlainObject(raw))
        return null;
    const toolId = typeof raw.tool_id === 'string' ? raw.tool_id : '';
    const name = typeof raw.name === 'string' ? raw.name : '';
    const description = typeof raw.description === 'string' ? raw.description : '';
    const baseTool = typeof raw.base_tool === 'string' ? raw.base_tool : '';
    const createdAt = typeof raw.created_at === 'string' ? raw.created_at : '';
    const version = typeof raw.version === 'number' ? raw.version : 0;
    const fixedArgs = isPlainObject(raw.fixed_args) ? raw.fixed_args : {};
    const states = Array.isArray(raw.allowed_states)
        ? raw.allowed_states.filter((state) => typeof state === 'string' && ALL_STATES.includes(state))
        : [];
    if (toolId === '' || name === '' || description === '' || baseTool === '' || createdAt === '' || version <= 0)
        return null;
    return {
        tool_id: toolId,
        name,
        description,
        base_tool: baseTool,
        fixed_args: fixedArgs,
        allowed_states: states,
        created_at: createdAt,
        version,
    };
}
function normalizeFile(raw) {
    if (!isPlainObject(raw) || !isPlainObject(raw.byWorkflow))
        return { file: emptyFile(), corrupt: true };
    let corrupt = raw.version !== FILE_VERSION;
    const byWorkflow = {};
    for (const [workflowId, value] of Object.entries(raw.byWorkflow)) {
        if (!Array.isArray(value)) {
            corrupt = true;
            continue;
        }
        const entries = [];
        for (const item of value) {
            const entry = normalizeEntry(item);
            if (entry === null)
                corrupt = true;
            else
                entries.push(entry);
        }
        byWorkflow[workflowId] = entries;
    }
    return { file: { version: FILE_VERSION, byWorkflow }, corrupt };
}
export class ToolAliasStore {
    baseDir;
    /** 同一文件的读改写串行：并发 apply 不会互相覆盖。 */
    chain = Promise.resolve();
    constructor(baseDir) {
        this.baseDir = baseDir;
    }
    filePath() {
        return join(this.baseDir, 'tool-aliases.json');
    }
    serial(task) {
        const run = this.chain.then(task, task);
        this.chain = run.then(() => undefined, () => undefined);
        return run;
    }
    async readFile() {
        try {
            const raw = JSON.parse(await fs.readFile(this.filePath(), 'utf8'));
            return normalizeFile(raw);
        }
        catch (error) {
            // 文件不存在是正常初始状态；其余（读失败 / JSON 坏）都算 corrupt。
            if (error?.code === 'ENOENT')
                return { file: emptyFile(), corrupt: false };
            return { file: emptyFile(), corrupt: true };
        }
    }
    async list(workflowId) {
        const { file, corrupt } = await this.readFile();
        return { aliases: file.byWorkflow[workflowId] ?? [], corrupt };
    }
    async add(workflowId, entry) {
        return this.serial(async () => {
            const { file } = await this.readFile();
            const current = file.byWorkflow[workflowId] ?? [];
            const next = [...current, entry];
            const nextFile = {
                version: FILE_VERSION,
                byWorkflow: { ...file.byWorkflow, [workflowId]: next },
            };
            await fs.mkdir(this.baseDir, { recursive: true });
            const target = this.filePath();
            const tmp = `${target}.tmp`;
            await fs.writeFile(tmp, JSON.stringify(nextFile, null, 2), 'utf8');
            await fs.rename(tmp, target);
            return next;
        });
    }
    async snapshot() {
        const { file, corrupt } = await this.readFile();
        return { byWorkflow: file.byWorkflow, corrupt };
    }
}
//# sourceMappingURL=tool-alias-store.js.map