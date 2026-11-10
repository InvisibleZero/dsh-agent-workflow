"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWorkspaceKindPlugin = registerWorkspaceKindPlugin;
exports.getWorkspaceKindPlugin = getWorkspaceKindPlugin;
exports.nonUsualWorkspaceKinds = nonUsualWorkspaceKinds;
exports.normalizeWorkspacePath = normalizeWorkspacePath;
exports.workspaceKindClaims = workspaceKindClaims;
const plugins = new Map();
function registerWorkspaceKindPlugin(plugin) {
    plugins.set(plugin.kind, plugin);
}
function getWorkspaceKindPlugin(kind) {
    return plugins.get(kind);
}
/** 侧栏需要合并显示的非 usual 类型（当前只有 workflow）。 */
function nonUsualWorkspaceKinds() {
    return Array.from(plugins.keys());
}
/** 目录路径归一化：Windows 下大小写、路径分隔符、结尾斜杠都不敏感。 */
function normalizeWorkspacePath(path) {
    return path.trim().replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
}
/** 这一项类型工作区是否认领了某个宿主目录工作区。 */
function workspaceKindClaims(kind, item, workspace) {
    const plugin = plugins.get(kind);
    if (plugin === undefined || typeof plugin.matchWorkspace !== 'function')
        return false;
    return plugin.matchWorkspace(item, workspace) === true;
}
//# sourceMappingURL=workspace-kind-registry.js.map