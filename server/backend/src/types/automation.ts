import { z } from 'zod';

const comparisonOpSchema = z.enum(['gt', 'gte', 'lt', 'lte', 'eq']);

export const automationConditionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('attr'),
    deviceId: z.string().min(1),
    path: z.string().min(1),
    op: comparisonOpSchema,
    value: z.union([z.number(), z.string(), z.boolean()]),
  }),
  z.object({
    kind: z.literal('event'),
    deviceId: z.string().min(1),
    eventType: z.string().min(1),
  }),
  z.object({
    kind: z.literal('time'),
    cron: z.string().min(1),
  }),
  z.object({
    kind: z.literal('external'),
    source: z.enum(['weather', 'season']),
    key: z.string().min(1),
    op: comparisonOpSchema,
    value: z.union([z.number(), z.string()]),
  }),
]);

export const automationActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('command'),
    deviceId: z.string().min(1),
    method: z.string().min(1),
    params: z.record(z.unknown()).default({}),
  }),
  z.object({
    kind: z.literal('notify'),
    channel: z.literal('log'),
    message: z.string().min(1),
  }),
  z.object({
    kind: z.literal('llm'),
    role: z.literal('back'),
    prompt: z.string().min(1),
  }),
]);

export const automationDefinitionSchema = z
  .object({
    conditions: z.array(automationConditionSchema).min(1),
    actions: z.array(automationActionSchema).min(1),
  })
  .passthrough();

export type Condition = z.infer<typeof automationConditionSchema>;
export type Action = z.infer<typeof automationActionSchema>;
export type AutomationRule = z.infer<typeof automationDefinitionSchema>;
