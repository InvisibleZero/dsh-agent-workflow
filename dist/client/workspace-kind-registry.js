const plugins = new Map();
export function registerWorkspaceKindPlugin(plugin) {
    plugins.set(plugin.kind, plugin);
}
export function getWorkspaceKindPlugin(kind) {
    return plugins.get(kind);
}
/** 侧栏需要合并显示的非 usual 类型（当前只有 workflow）。 */
export function nonUsualWorkspaceKinds() {
    return Array.from(plugins.keys());
}
//# sourceMappingURL=workspace-kind-registry.js.map