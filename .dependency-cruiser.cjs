/**
 * dependency-cruiser 配置：本项目的分层规则。
 *
 * 这是「第 2 项 依赖检查」的判据来源——插件只读它的 JSON 产物。
 * 别的项目要查跨层，照这份改自己的 import 路径即可。
 *
 * 分层（自底向上）：schema → engine → host；client 只能碰 schema。
 * 不写这份配置时，depcruise 只能查循环依赖，查不了跨层引用。
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: '循环依赖一律不允许',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'client-must-not-touch-host-or-engine',
      comment: '客户端半不能 import 宿主半或引擎',
      severity: 'error',
      from: { path: '^src/client' },
      to: { path: '^src/(host|engine)' },
    },
    {
      name: 'lower-layers-must-not-touch-upper',
      comment: 'schema / engine 是底层，不能反向依赖 client 或 host',
      severity: 'error',
      from: { path: '^src/(schema|engine)/' },
      to: { path: '^src/(client|host)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|logs|node_modules)/' },
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
