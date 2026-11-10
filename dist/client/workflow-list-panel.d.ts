/**
 * Workflow 工作区的入口与面板（浏览器半）。
 *
 * 入口 = 侧栏底部 `sidebar.footer.action` 的一个「Workflow」按钮；
 * 点开 = 居中弹窗，里面是**我们自己的 workflow 列表**（不是 dsh 的目录工作区）。
 * 数据走宿主半的 `/dsh-agent-workflow/list|create|get` 三个本机路由。
 *
 * 与 dsh workspace 完全解耦：这里只读写 WorkflowSnapshot，不碰 workspaces.create。
 */
/** 侧栏底部入口：宽栏显示文字，窄栏只显示图标。 */
export declare function WorkflowFooterButton(props: {
    ctx?: any;
    wide?: boolean;
}): import("react").JSX.Element;
//# sourceMappingURL=workflow-list-panel.d.ts.map