"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWorkspaceKindPlugin = registerWorkspaceKindPlugin;
exports.getWorkspaceKindPlugin = getWorkspaceKindPlugin;
exports.nonUsualWorkspaceKinds = nonUsualWorkspaceKinds;
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
//# sourceMappingURL=workspace-kind-registry.js.map