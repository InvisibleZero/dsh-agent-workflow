import { z } from 'zod';
import { NodeState } from './node-state';
import { WorkflowFault } from './fault';

/** 全链路跟踪日志。 */
export const TraceLog = z.object({
  trace_id: z.string(),
  node_id: z.string(),
  action: z.string(),
  latency_ms: z.number().nonnegative(),
  token_usage: z.object({
    input_tokens: z.number().nonnegative(),
    output_tokens: z.number().nonnegative(),
  }),
  state_from: NodeState,
  state_to: NodeState,
  fault: WorkflowFault.optional(),
});
export type TraceLog = z.infer<typeof TraceLog>;
