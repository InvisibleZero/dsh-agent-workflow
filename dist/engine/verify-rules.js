/**
 * 验收七项的纯规则：解析条目、校验报备形状、汇总进度。
 *
 * 全是字符串/数组处理、不读盘：盘上的锚点校验在仓储（数据层），
 * 这里只判「报备本身是否说得清」——分层跟手册那套一致。
 */
import { VERIFY_CHECKS, createVerification, } from '../schema/verify-checks';
/** 数字或名称 → 条目 id；两种都认不出时抛错，并把可选项列出来。 */
export function resolveVerifyCheckId(raw) {
    const text = String(raw ?? '').trim();
    const asNumber = Number(text);
    if (Number.isInteger(asNumber)) {
        const found = VERIFY_CHECKS.find((check) => check.id === asNumber);
        if (found !== undefined)
            return found.id;
    }
    const byName = VERIFY_CHECKS.find((check) => check.name === text);
    if (byName !== undefined)
        return byName.id;
    throw new Error(`「${text}」不是验收项：用 id 1-${VERIFY_CHECKS.length} 或名称（${VERIFY_CHECKS.map((check) => `${check.id} ${check.name}`).join(' / ')}）`);
}
/** 证据路径的形状限制：只允许工作目录内的相对路径，挡绝对路径与 ../。 */
export function assertAnchorPathShape(file) {
    const normalized = file.replace(/\\/g, '/');
    if (normalized.trim() === '')
        throw new Error('证据路径不能为空');
    if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
        throw new Error(`证据路径必须是工作目录内的相对路径（不认绝对路径）：${file}`);
    }
    if (normalized.split('/').some((segment) => segment === '..')) {
        throw new Error(`证据路径不能含 ..（不许跑出工作目录）：${file}`);
    }
}
/** 有检查器的验收项现在从 VERIFY_CHECKS 的 checker.enforcement 推导，不再硬编码 id 集合。 */
/** 从报备入参里解析检查器结果：缺字段给 undefined，形状坏了抛错。 */
export function parseCheckerResult(raw) {
    if (raw === undefined || raw === null)
        return undefined;
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('checker 必须是对象：{ checker_id, ok, findings, exit_code }');
    }
    const record = raw;
    const checker_id = typeof record.checker_id === 'string' ? record.checker_id.trim() : '';
    if (checker_id === '')
        throw new Error('checker.checker_id 不能为空');
    const ok = record.ok;
    if (typeof ok !== 'boolean')
        throw new Error('checker.ok 必须是布尔值');
    const findings = record.findings;
    if (typeof findings !== 'number' || !Number.isInteger(findings) || findings < 0) {
        throw new Error('checker.findings 必须是非负整数');
    }
    const exitCodeRaw = record.exit_code;
    if (exitCodeRaw !== null && exitCodeRaw !== undefined
        && (typeof exitCodeRaw !== 'number' || !Number.isInteger(exitCodeRaw))) {
        throw new Error('checker.exit_code 必须是整数或 null');
    }
    const exit_code = exitCodeRaw === undefined || exitCodeRaw === null
        ? null
        : exitCodeRaw;
    return { checker_id, ok, findings, exit_code };
}
/**
 * 两层门禁判定（纯函数，不读盘）：
 * 第一层：有检查器的项报 pass 前必须带检查器结果，且 checker.ok=true（跑成且证据非空）。
 * 第二层：检查器失败（报错/非0/证据空，即 ok=false）才准 AI 兜底，但兜底必须可复跑（带 command）。
 * 返回 undefined = 通过；否则返回拒报理由。
 */
export function validateCheckerGate(check, checker, result, command) {
    // 只有 required 型检查器才走门禁；assistive（或没挂检查器）的项照旧由 AI 判断。
    if (check.checker?.enforcement !== 'required')
        return undefined;
    if (result !== 'pass')
        return undefined;
    if (checker === undefined) {
        return `「${check.name}」有检查器，报 pass 前必须先跑对应 check_* 并带 checker 结果（第一层门禁）`;
    }
    if (checker.ok === false && command === '') {
        return `「${check.name}」检查器失败（报错/非0/证据空），报 pass 属 AI 兜底，必须带可复跑命令 command（第二层门禁）`;
    }
    return undefined;
}
/**
 * 校验报备的「说得清」部分，通过则返回规范化后的输入。
 *
 * 分档口径：这里只判字段齐不齐、格式对不对；文件在不在、行号越不越界由仓储判
 * （要读盘）。两处都过，才算一份可落标记的报备。
 */
export function validateVerifyReportInput(check, raw) {
    const result = raw?.result;
    if (result !== 'pass' && result !== 'deferred') {
        throw new Error('报备结论只能是 pass（通过）或 deferred（查出问题但本轮不修，记 ？）');
    }
    const summary = typeof raw?.summary === 'string' ? raw.summary.trim() : '';
    if (summary === '')
        throw new Error('报备要写结论摘要：做了什么、看到什么结果');
    const rawAnchors = Array.isArray(raw?.anchors) ? raw.anchors : [];
    if (rawAnchors.length === 0) {
        throw new Error('报备至少要给一条证据锚点 anchors：[{ file, line? }]（文件必须在工作目录内）');
    }
    const anchors = rawAnchors.map((anchor, index) => {
        const file = typeof anchor?.file === 'string' ? anchor.file.trim() : '';
        if (file === '')
            throw new Error(`第 ${index + 1} 条锚点缺 file`);
        assertAnchorPathShape(file);
        const line = anchor?.line;
        if (line !== undefined && line !== null) {
            if (!Number.isInteger(line) || line <= 0)
                throw new Error(`锚点行号必须是正整数：${file}:${String(line)}`);
            return { file, line };
        }
        return { file };
    });
    const command = typeof raw?.command === 'string' ? raw.command.trim() : '';
    if (check.needs_command && command === '') {
        throw new Error(`「${check.name}」必须写复跑命令 command（例：npx vitest run test/xxx.test.ts）`);
    }
    const findings = [];
    if (result === 'deferred') {
        const rawFindings = Array.isArray(raw?.findings) ? raw.findings : [];
        if (rawFindings.length === 0) {
            throw new Error('结论 deferred 必须带 findings：每条写清 位置 / 问题 / 为什么不修 / 影响什么');
        }
        rawFindings.forEach((finding, index) => {
            const fields = ['location', 'problem', 'why_not_fixed', 'impact'];
            const parsed = {};
            for (const field of fields) {
                const value = typeof finding?.[field] === 'string' ? finding[field].trim() : '';
                if (value === '')
                    throw new Error(`第 ${index + 1} 条 findings 缺「${field}」`);
                parsed[field] = value;
            }
            findings.push(parsed);
        });
    }
    const checker = parseCheckerResult(raw?.checker);
    const gateError = validateCheckerGate(check, checker, result, command);
    if (gateError !== undefined)
        throw new Error(gateError);
    return {
        result,
        summary,
        anchors,
        ...(command === '' ? {} : { command }),
        ...(findings.length === 0 ? {} : { findings }),
        ...(checker === undefined ? {} : { checker }),
    };
}
/** 从任意 JSON 里收一条检查器运行记录；形状不对就给 null（被 pickVerification 丢弃）。 */
function normalizeCheckerRun(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
        return null;
    const record = raw;
    const checker_id = typeof record.checker_id === 'string' ? record.checker_id : '';
    const at = typeof record.at === 'string' ? record.at : '';
    if (checker_id === '' || at === '')
        return null;
    const ok = record.ok === true;
    const findings = typeof record.findings === 'number' && Number.isInteger(record.findings) && record.findings >= 0
        ? record.findings
        : 0;
    const exitRaw = record.exit_code;
    const exit_code = typeof exitRaw === 'number' || exitRaw === null ? exitRaw : null;
    const evidence = typeof record.evidence === 'string' && record.evidence !== '' ? record.evidence : undefined;
    return { checker_id, ok, exit_code, findings, ...(evidence === undefined ? {} : { evidence }), at };
}
/**
 * 把快照里的未知值收成合法状态：缺字段 / 坏字段一律回落到七项全空。
 * 旧快照没有 verification 字段，走的就是这里——不做数据迁移。
 */
export function pickVerification(raw) {
    if (raw === null || typeof raw !== 'object')
        return createVerification(0);
    const source = raw;
    const round = typeof source.round === 'number' && Number.isInteger(source.round) && source.round >= 0
        ? source.round
        : 0;
    const incoming = Array.isArray(source.items) ? source.items : [];
    const items = VERIFY_CHECKS.map((check) => {
        const found = incoming.find((item) => item?.id === check.id);
        if (found === undefined || found === null)
            return { id: check.id, mark: 'pending', report: null };
        const mark = found.mark === 'pass' || found.mark === 'deferred' ? found.mark : 'pending';
        const report = mark !== 'pending' && found.report !== null && typeof found.report === 'object'
            ? found.report
            : null;
        return { id: check.id, mark: report === null ? 'pending' : mark, report };
    });
    const checker_runs = Array.isArray(source.checker_runs)
        ? source.checker_runs
            .map((run) => normalizeCheckerRun(run))
            .filter((run) => run !== null)
        : [];
    return { round, items, checker_runs };
}
export function summarizeVerification(state) {
    const pass = state.items.filter((item) => item.mark === 'pass').length;
    const deferred = state.items.filter((item) => item.mark === 'deferred').length;
    const pending = state.items.filter((item) => item.mark === 'pending').length;
    return {
        total: state.items.length,
        pass,
        deferred,
        pending,
        complete: pending === 0,
    };
}
/** 未处理项的展示文本：报错与注入共用，避免两处措辞各写一套。 */
export function describePendingItems(state) {
    return state.items
        .filter((item) => item.mark === 'pending')
        .map((item) => `${item.id} ${VERIFY_CHECKS.find((check) => check.id === item.id)?.name ?? ''}`.trim())
        .join(' / ');
}
//# sourceMappingURL=verify-rules.js.map