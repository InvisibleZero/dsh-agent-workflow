export async function readSidebarNodes(repository, workingDirectory, onBroken) {
    const path = typeof workingDirectory === 'string' ? workingDirectory.trim() : '';
    if (path === '')
        return repository.getAllNodeStates(onBroken);
    return repository.getNodeStatesByDirectory(path, onBroken);
}
//# sourceMappingURL=sidebar-nodes.js.map