"use strict";
/**
 * 验收七项：固定条目（对应全局「七项体检」）。
 *
 * 只放常量与类型，**不引 zod**：客户端徽标要读条目名，客户端包里不能出现 zod
 * （client-bundle-purity 会拦）。
 *
 * 七项的顺序与名称是协议的一部分：报备按 id 落标记，不按文本匹配——
 * 文本是人写的，改一个字就再也勾不上（和手册「实施顺序」按文本匹配相反）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERIFY_CHECKS = void 0;
exports.verifyMarkSymbol = verifyMarkSymbol;
exports.createVerification = createVerification;
exports.VERIFY_CHECKS = [
    { id: 1, name: '契约测试', needs_command: true, judge: '对外行为与原实现一致或按新契约验证，要有可复现对照' },
    { id: 2, name: '依赖检查', needs_command: false, judge: '无反向依赖、无循环依赖、无跨层引用' },
    { id: 3, name: '死代码扫描', needs_command: false, judge: '无用导出 / 参数 / 字段，且要证明确实可删（引用计数为零）' },
    { id: 4, name: '边界测试', needs_command: true, judge: '外部依赖可 mock，模块能独立测试' },
    { id: 5, name: '命名与边界审查', needs_command: false, judge: '泛化词、跨模块暴露、反向冗长、前缀越界四项' },
    { id: 6, name: '埋点检测', needs_command: false, judge: '黑盒逐跳三问 + 白盒五字段，三类结论：断点 / 无效埋点 / 质量盲区' },
    { id: 7, name: '回归与压测', needs_command: true, judge: '跑现有测试套件，给 pass / fail + 证据（耗时、错误率、埋点抽样）' },
];
/** 标记的显示符号：徽标、菜单、注入文本共用一套，避免三处各写一份。 */
function verifyMarkSymbol(mark) {
    if (mark === 'pass')
        return '✓';
    if (mark === 'deferred')
        return '？';
    return '○';
}
/** 按当前轮次造一份全空清单（七项固定顺序）。 */
function createVerification(round) {
    return {
        round,
        items: exports.VERIFY_CHECKS.map((check) => ({ id: check.id, mark: 'pending', report: null })),
    };
}
//# sourceMappingURL=verify-checks.js.map