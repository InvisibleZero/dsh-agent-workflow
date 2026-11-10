/**
 * dsh 客户端插件入口（浏览器半）。
 *
 * 只做一件事：注册伪装层 `sidebar.workspaces`（替换宿主的目录工作区浏览器）。
 * workflow 工作区不是独立入口，而是「添加工作区」下拉框里的一个类型，
 * 在侧栏工作区区域内原地渲染（每种类型一个可嵌入渲染器）。
 */
export declare const name = "dsh-agent-workflow-client";
export declare const inject: string[];
export declare function apply(ctx: any): void;
//# sourceMappingURL=dsh-plugin.d.ts.map