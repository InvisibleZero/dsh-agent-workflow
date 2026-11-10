/**
 * Workflow 工作区面板（浏览器半）。
 *
 * 形态：居中弹窗（`main[key=agent-workflow]`），入口是左侧导航项。
 * 列表项**就地展开**成嵌套子树：父节点 → 子节点 → 更深的子节点，逐级开合，
 * 不跳转页面。每个节点可以就地加子节点（宿主 /add-node）。
 *
 * 数据是一份全局列表（宿主半 /dsh-agent-workflow/list|create|get|add-node）。
 */
/** 左侧导航项图标：外框与文字由宿主负责，这里只画图形。 */
export declare function WorkflowPanelIcon(props: {
    size?: number;
    active?: boolean;
}): import("react").JSX.Element;
export declare function WorkflowPage(props: {
    ctx?: any;
}): import("react").JSX.Element;
//# sourceMappingURL=workflow-page.d.ts.map