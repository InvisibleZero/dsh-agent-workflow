/**
 * 伪装层：注册 `sidebar.workspaces`，替换宿主的 WorkspaceBrowser。
 *
 * 结构照抄宿主 `@deepseek-ai/dsh-client-ui-workspace` 的会话行 / 工作区行 / 浏览器外壳；
 * 只改三处：数据来源（框架给的 useWorkspaces/useSessions）、翻译（本地 ZH 表）、
 * 砍掉暂不需要的拖拽 / 水印 / 动画。
 *
 * 关键契约（来自宿主源码）：
 * - single 槽同优先级会抛，所以用 priority: -1 压过宿主的 0；
 * - 子槽必须由正在渲染的这份注册声明，否则 renderSlot 拿不到条目；
 * - 菜单项经 renderSlot 第三参 { hookContext: [open, setOpen] } 传开合状态。
 */
export declare function applyWorkspaceBrowser(ctx: any): void;
//# sourceMappingURL=workspace-browser.d.ts.map