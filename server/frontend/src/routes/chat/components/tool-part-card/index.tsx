import { getToolName, isToolUIPart, type UIMessage } from 'ai';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../../../components/ui/alert';
import { Card, CardContent, CardHeader } from '../../../../components/ui/card';
import { cn } from '../../../../lib/utils';
import type { DeviceStatusData, RoomSummaryData } from '../../types';
import {
  extractDeviceStatusCards,
  extractRoomCards,
  formatPrimitiveStatusValue,
  formatToolState,
  isPrimitiveStatusValue,
  isSettledToolState,
  toJson,
} from '../../utils';

const DeviceStatusCard = ({ device }: { device: DeviceStatusData }) => {
  const statusEntries = Object.entries(device.attrs).filter(([, value]) =>
    isPrimitiveStatusValue(value),
  );

  return (
    <Card className="inset-panel rounded-[1rem] border-border/65 bg-card/88">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">{device.name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {device.deviceId}
            </p>
          </div>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${
              device.status === 'online'
                ? 'status-live border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-100 text-slate-500'
            }`}
          >
            {device.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">房间: {device.roomName}</p>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {statusEntries.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/80 px-3 py-2 text-xs text-muted-foreground">
            暂无可展示的设备状态字段
          </div>
        ) : (
          <div className="space-y-2">
            {statusEntries.map(([key, rawValue]) => {
              const value = rawValue as string | number | boolean;
              const toneClass =
                typeof value === 'boolean'
                  ? value
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-100 text-slate-600'
                  : typeof value === 'number'
                    ? 'border-sky-200 bg-sky-50 text-sky-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700';

              return (
                <div
                  key={`${device.deviceId}-${key}`}
                  className="rounded-md border border-border/80 bg-background/90 px-2.5 py-2"
                >
                  <div className="text-[11px] text-muted-foreground">{key}</div>
                  <div
                    className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass}`}
                  >
                    {formatPrimitiveStatusValue(value)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const RoomSummaryCard = ({ room }: { room: RoomSummaryData }) => {
  return (
    <Card className="inset-panel rounded-[1rem] border-border/65 bg-card/88">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">{room.name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {room.roomId}
            </p>
          </div>
          <span className="data-pill py-0.5 text-[11px]">{room.onlineDevicesCount} 在线</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0 text-xs">
        <div className="rounded-md border border-border/80 bg-background/90 px-2.5 py-2">
          <span className="text-muted-foreground">楼层: </span>
          <span>{room.floor || '-'}</span>
        </div>
        <div className="rounded-md border border-border/80 bg-background/90 px-2.5 py-2">
          <span className="text-muted-foreground">类型: </span>
          <span>{room.type || '-'}</span>
        </div>
        <div className="rounded-md border border-border/80 bg-background/90 px-2.5 py-2">
          <span className="text-muted-foreground">设备数: </span>
          <span>{room.devicesCount}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export const ToolPartCard = ({ part }: { part: UIMessage['parts'][number] }) => {
  const toolPart = isToolUIPart(part) ? part : null;
  const [collapsed, setCollapsed] = useState(() =>
    toolPart ? isSettledToolState(toolPart.state) : true,
  );
  const [hasUserToggled, setHasUserToggled] = useState(false);
  if (!toolPart) return null;

  const toolName = getToolName(toolPart);
  const currentCollapsed = hasUserToggled
    ? collapsed
    : isSettledToolState(toolPart.state);

  const devices =
    toolPart.state === 'output-available'
      ? extractDeviceStatusCards(toolName, toolPart.output)
      : [];
  const rooms =
    toolPart.state === 'output-available'
      ? extractRoomCards(toolName, toolPart.output)
      : [];

  const toggleCollapsed = () => {
    setHasUserToggled(true);
    setCollapsed(!currentCollapsed);
  };

  return (
    <div className="max-w-full">
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!currentCollapsed}
        className="group inline-flex max-w-full items-center gap-1 rounded-md text-left transition-colors duration-200 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
            currentCollapsed ? 'rotate-0' : 'rotate-90',
          )}
        />
        <span className="text-xs font-semibold tracking-wide text-foreground">
          工具调用: {toolName}
        </span>
        <span className="text-xs text-muted-foreground">
          · {formatToolState(toolPart.state)}
        </span>
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
          currentCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
        )}
      >
        <div className="min-h-0 overflow-hidden pl-2 pt-1">
          <div className="space-y-2">
            {toolPart.state === 'input-streaming' ? (
              <div className="text-xs text-muted-foreground">正在生成工具参数...</div>
            ) : null}

            {toolPart.state === 'input-available' ? (
              <pre className="overflow-x-auto rounded-md border border-border/70 bg-background/90 p-2 text-xs">
                {toJson(toolPart.input)}
              </pre>
            ) : null}

            {toolPart.state === 'output-error' ? (
              <Alert variant="destructive" className="text-xs">
                {toolPart.errorText}
              </Alert>
            ) : null}

            {toolPart.state === 'output-denied' ? (
              <Alert className="text-xs">该工具调用被拒绝，未执行。</Alert>
            ) : null}

            {toolPart.state === 'output-available' ? (
              <>
                {devices.length > 0 ? (
                  <div className="space-y-2">
                    {devices.map((device) => (
                      <DeviceStatusCard key={`${toolName}-${device.deviceId}`} device={device} />
                    ))}
                  </div>
                ) : rooms.length > 0 ? (
                  <div className="space-y-2">
                    {rooms.map((room) => (
                      <RoomSummaryCard key={`${toolName}-${room.roomId}`} room={room} />
                    ))}
                  </div>
                ) : (
                  <pre className="overflow-x-auto rounded-md border border-border/70 bg-background/90 p-2 text-xs">
                    {toJson(toolPart.output)}
                  </pre>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
