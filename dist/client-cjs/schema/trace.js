"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraceLog = void 0;
const zod_1 = require("zod");
const node_state_1 = require("./node-state");
const fault_1 = require("./fault");
/** 全链路跟踪日志。 */
exports.TraceLog = zod_1.z.object({
    trace_id: zod_1.z.string(),
    node_id: zod_1.z.string(),
    action: zod_1.z.string(),
    latency_ms: zod_1.z.number().nonnegative(),
    token_usage: zod_1.z.object({
        input_tokens: zod_1.z.number().nonnegative(),
        output_tokens: zod_1.z.number().nonnegative(),
    }),
    state_from: node_state_1.NodeState,
    state_to: node_state_1.NodeState,
    fault: fault_1.WorkflowFault.optional(),
});
//# sourceMappingURL=trace.js.map