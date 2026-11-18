// @ts-nocheck
/**
 * 从「改动范围」推断要检查的项目根。
 *
 * - 每个范围路径向上找最近的 marker（pyproject.toml / package.json）→ 项目根。
 * - 去重：多个范围落到不同项目 → 多个根（每个都要测，各自的语言）。
 * - 一个都找不到 → 返回候选（工作目录下一级里带 marker 的目录），供选择框用。
 */
import { access, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { stackFromMarkers } from '../engine/checkers/stack';
async function exists(file) {
    try {
        await access(file);
        return true;
    }
    catch {
        return false;
    }
}
/** 从某个路径向上找最近的 marker 目录 + 栈；一路到根都没有 → null。 */
export async function nearestProject(path) {
    let dir = resolve(path);
    for (;;) {
        const [pyproject, packageJson] = await Promise.all([
            exists(join(dir, 'pyproject.toml')),
            exists(join(dir, 'package.json')),
        ]);
        const stack = stackFromMarkers({ pyproject, packageJson });
        if (stack !== null)
            return { root: dir, stack };
        const parent = dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
}
/** 工作目录下一级里带 marker 的目录（含工作目录自己），作为「找不到项目」时的候选。 */
export async function listCandidateProjects(workingDirectory) {
    const candidates = [];
    const base = resolve(workingDirectory);
    const self = await nearestProject(base);
    if (self !== null && self.root === base)
        candidates.push(base);
    let entries;
    try {
        entries = await readdir(base, { withFileTypes: true });
    }
    catch {
        return candidates;
    }
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        if (entry.name.startsWith('.') || entry.name === 'node_modules')
            continue;
        const child = join(base, entry.name);
        const found = await nearestProject(child);
        if (found !== null && found.root === resolve(child) && !candidates.includes(found.root)) {
            candidates.push(found.root);
        }
    }
    return candidates;
}
/** 范围 → 项目根列表；范围为空 / 没命中时退回「工作目录所属的项目」；连这个都没有才给候选。 */
export async function resolveProjects(workingDirectory, scope) {
    const projects = [];
    for (const path of scope) {
        const found = await nearestProject(resolve(workingDirectory, path));
        if (found !== null && !projects.some((project) => project.root === found.root)) {
            projects.push(found);
        }
    }
    if (projects.length > 0)
        return { projects, candidates: [] };
    const fallback = await nearestProject(workingDirectory);
    if (fallback !== null)
        return { projects: [fallback], candidates: [] };
    return { projects: [], candidates: await listCandidateProjects(workingDirectory) };
}
//# sourceMappingURL=project-root.js.map