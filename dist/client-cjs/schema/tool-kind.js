"use strict";
/**
 * 工具分类：分类名只在这里定义，别处读标签表，不写死字面量。
 *
 * 单独成文件是为了客户端包瘦身：客户端只需要标签表，
 * 不需要为了它把整份工具目录（含 10 条工具描述）打进去。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_KIND_LABEL = exports.TOOL_KIND = void 0;
exports.TOOL_KIND = { base: 'base', extension: 'extension' };
exports.TOOL_KIND_LABEL = {
    base: '基础工具',
    extension: '扩展工具',
};
//# sourceMappingURL=tool-kind.js.map