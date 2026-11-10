/**
 * Workflow 的主面板：一个居中弹窗（不是贴在左上角的表单卡片）。
 *
 * 流程（没有任何假控件）：
 *   点「创建」→ 弹宿主原生目录选择（`uiWorkspace.pickDirectory`）
 *   → 选好直接把该目录注册成工作区（`workspaces.create`）→ 名称非空再改名
 *   → 切成 success 面（明确显示"已创建 + 路径"），不再回到空白表单。
 *
 * 槽位关系（改之前先看这里）：
 * - `sidebar.panellist` 每一项就是「一个主面板的图标」，id 与 `main` 的 key 一一对应；
 *   宿主自己画按钮、自己管选中态，所以这里只交一个图标组件。
 * - 点图标＝切到 key 同名的主面板，所以必须同时占住 `main` 的同一个 key。
 *
 * 样式一律走宿主主题 token，不写死 #fff / #ddd。
 */
export declare function WorkflowPanel(props: {
    ctx?: any;
}): import("react").JSX.Element;
//# sourceMappingURL=workflow-panel.d.ts.map