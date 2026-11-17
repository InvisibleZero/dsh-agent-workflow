/**
 * 埋点计划证据的读写口（数据层，第 6 项「埋点检测」专用）。
 *
 * 只对外暴露 `loadInstrumentationJson` / `saveInstrumentationJson`：上层（领域 / 接口）
 * 不直接拼 `.workflow/evidence/` 路径、不直接碰磁盘。证据落在工作目录的
 * `.workflow/evidence/instrumentation.json`，和 regression.json 这一批产物同目录。
 *
 * 轮次约定：计划按验收轮次重建（下一轮重新扫、重新建树后覆盖），不做跨轮继承——
 * 和 `checker_runs` 随轮次清空是同一个口径。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const EVIDENCE_DIR = join('.workflow', 'evidence');
const PLAN_FILE = 'instrumentation.json';
/** 计划证据文件的绝对路径（只在本模块内用，上层不拼路径）。 */
function planPath(workingDirectory) {
    return join(workingDirectory, EVIDENCE_DIR, PLAN_FILE);
}
/**
 * 读埋点计划：文件不存在返回 null（还没建树），JSON 坏掉抛错（证据坏了要显式报，不能当成没建）。
 */
export async function loadInstrumentationJson(workingDirectory) {
    const file = planPath(workingDirectory);
    let text;
    try {
        text = await readFile(file, 'utf8');
    }
    catch (error) {
        if (error?.code === 'ENOENT')
            return null;
        throw error;
    }
    try {
        return JSON.parse(text);
    }
    catch (error) {
        throw new Error(`instrumentation.json 解析失败：${String(error?.message ?? error)}`);
    }
}
/** 写埋点计划：目录不存在先建，再整份覆盖（树重建就是覆盖，不做增量合并）。 */
export async function saveInstrumentationJson(workingDirectory, plan) {
    const file = planPath(workingDirectory);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
}
//# sourceMappingURL=instrumentation-store.js.map