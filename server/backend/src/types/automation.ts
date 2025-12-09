export type Condition =
  | { kind: 'attr'; deviceId: string; path: string; op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'; value: number | string | boolean }
  | { kind: 'event'; deviceId: string; eventType: string }
  | { kind: 'time'; cron: string }
  | { kind: 'external'; source: 'weather' | 'season'; key: string; op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'; value: number | string };

export type Action =
  | { kind: 'command'; deviceId: string; method: string; params: Record<string, unknown> }
  | { kind: 'notify'; channel: 'log'; message: string }
  | { kind: 'llm'; role: 'back'; prompt: string };

export interface AutomationRule {
  name: string;
  enabled: boolean;
  conditions: Condition[];
  actions: Action[];
  scope?: string;
}

