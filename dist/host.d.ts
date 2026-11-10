/**
 * dsh-agent-workflow 宿主半（cordis 插件）。
 *
 * 职责：给浏览器半暴露 3 个本机 HTTP 路由（list / create / get），
 * 背后读写我们自己的 WorkflowRepository。客户端用 `fetch('/dsh-agent-workflow/*')` 调用，
 * 与 model-router 的路由写法一致（webServer.register + kind: 'exact'）。
 */
export declare const inject: never[];
export declare function apply(ctx: any): void;
//# sourceMappingURL=host.d.ts.map