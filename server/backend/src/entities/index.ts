import { User } from './user.js';
import { Home } from './home.js';
import { Room } from './room.js';
import { Device } from './device.js';
import { DeviceCapability } from './deviceCapability.js';
import { DeviceAttrsSnapshot } from './deviceAttrsSnapshot.js';
import { TelemetryLog } from './telemetryLog.js';
import { DeviceEvent } from './deviceEvent.js';
import { Command } from './command.js';
import { Automation } from './automation.js';
import { AutomationRun } from './automationRun.js';
import { LLMSession } from './llmSession.js';
import { LLMInvocation } from './llmInvocation.js';
import { ExternalDataCache } from './externalDataCache.js';
import { AuditLog } from './auditLog.js';
import { ChatSession } from './chatSession.js';
import { ChatMessage } from './chatMessage.js';

export const entities = [
  User,
  Home,
  Room,
  Device,
  DeviceCapability,
  DeviceAttrsSnapshot,
  TelemetryLog,
  DeviceEvent,
  Command,
  Automation,
  AutomationRun,
  LLMSession,
  LLMInvocation,
  ChatSession,
  ChatMessage,
  ExternalDataCache,
  AuditLog,
];

export {
  User,
  Home,
  Room,
  Device,
  DeviceCapability,
  DeviceAttrsSnapshot,
  TelemetryLog,
  DeviceEvent,
  Command,
  Automation,
  AutomationRun,
  LLMSession,
  LLMInvocation,
  ChatSession,
  ChatMessage,
  ExternalDataCache,
  AuditLog,
};
