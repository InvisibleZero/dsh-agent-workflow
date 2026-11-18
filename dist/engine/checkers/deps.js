/**
 * 第 2 项：依赖检查。
 *
 * 在工作目录跑 dependency-cruiser，再读它的 JSON 产物。
 * 判据：severity=error 的违规为空（循环依赖、跨层引用都算违规）。
 *
 * 致谢：dependency-cruiser（MIT）——
 * https://github.com/sverweij/dependency-cruiser
 */
import { asArray, asNumber, asRecord, asString, missingEvidence, } from './types';
import { normalizeImportLinter } from './normalize';
const EVIDENCE = 'deps.json';
const DEFAULT_TARGET = 'src';
/** 各技术栈的依赖取证命令：都用宿主定位到的绝对路径，不靠 PATH。 */
const DEPS_COMMANDS = {
    js: (target) => `depcruise ${target} --output-type json --output-to .workflow/evidence/${EVIDENCE}`,
    // --no-cache：不在项目根留 .import_linter_cache（证据目录自带 .gitignore，缓存不该进仓库）。
    python: (_target, tools) => `"${tools.lintImports ?? 'lint-imports'}" --no-cache > .workflow/evidence/${EVIDENCE}`,
};
/** 按技术栈选依赖取证命令。 */
export function depsCommandFor(stack, target) {
    return DEPS_COMMANDS[stack](target, {});
}
/** 命令模板：默认 JS，只把 target 填进去。 */
function buildCommand(target) {
    return DEPS_COMMANDS.js(target, {});
}
export const depsChecker = {
    id: 'deps',
    name: '依赖检查',
    evidence: EVIDENCE,
    defaultTarget: DEFAULT_TARGET,
    autoRun: true,
    buildCommands: DEPS_COMMANDS,
    normalizers: { python: normalizeImportLinter },
    buildCommand: buildCommand,
    check(evidence_json) {
        if (evidence_json === null)
            return missingEvidence(EVIDENCE, buildCommand(DEFAULT_TARGET));
        const summary = asRecord(asRecord(evidence_json).summary);
        // 格式不认识时必须报错，不能当「没有违规」。
        if (!Array.isArray(summary.violations)) {
            return {
                ok: false,
                findings: [{ location: EVIDENCE, problem: '证据格式不认识：缺 summary.violations，确认用的是 depcruise --output-type json' }],
                stats: {},
            };
        }
        const violations = asArray(summary.violations);
        const findings = [];
        let errors = 0;
        for (const item of violations) {
            const violation = asRecord(item);
            const rule = asRecord(violation.rule);
            const severity = asString(rule.severity) || 'error';
            if (severity !== 'error')
                continue;
            errors += 1;
            const from = asString(violation.from) || '(未知来源)';
            const to = asString(violation.to) || '(未知目标)';
            findings.push({ location: `${from} → ${to}`, problem: `违反依赖规则：${asString(rule.name) || '未命名规则'}` });
        }
        return {
            ok: errors === 0,
            findings,
            stats: { errors, violations: violations.length, modules: asNumber(summary.totalCruised) },
        };
    },
};
//# sourceMappingURL=deps.js.map