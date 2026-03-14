import { useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import type { Device } from '../../../lib/types';

export const DevicePanel = ({
  device,
  onEdit,
  onDelete,
  onSendCommand,
}: {
  device: Device;
  onEdit: (device: Device) => void;
  onDelete: (deviceId: string) => Promise<void>;
  onSendCommand: (
    deviceId: string,
    method: string,
    params: Record<string, unknown>,
    roomId: string,
  ) => Promise<void>;
}) => {
  const [deleteArmed, setDeleteArmed] = useState(false);

  return (
    <article className="surface-panel relative overflow-hidden rounded-[1.15rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{device.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">{device.deviceId}</div>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${
            device.status === 'online'
              ? 'status-live border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-100 text-slate-500'
          }`}
        >
          {device.status === 'online' ? '在线' : '离线'}
        </span>
      </div>

      <div className="mt-3 space-y-1 text-xs">
        {device.attrs && Object.keys(device.attrs).length > 0 ? (
          Object.entries(device.attrs).map(([key, value]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded bg-muted/40 px-2 py-1"
            >
              <span className="text-muted-foreground">{key}</span>
              <span>{String(value)}</span>
            </div>
          ))
        ) : (
          <div className="text-muted-foreground">还没有属性快照</div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
          category:{device.category || 'both'}
        </span>
        {(device.capabilities || []).slice(0, 4).map((cap) => (
          <span
            key={`${device.deviceId}-${cap.kind}-${cap.name}`}
            className="rounded-full bg-muted px-2 py-0.5 text-[11px]"
          >
            {cap.kind}:{cap.name}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onEdit(device)}>
          编辑设备
        </Button>
        <Button
          size="sm"
          variant={deleteArmed ? 'secondary' : 'outline'}
          onClick={async () => {
            if (!deleteArmed) {
              setDeleteArmed(true);
              return;
            }
            await onDelete(device.deviceId);
            setDeleteArmed(false);
          }}
        >
          {deleteArmed ? '确认删除' : '删除设备'}
        </Button>
      </div>
      {deleteArmed ? (
        <Alert variant="destructive" className="mt-3 text-xs">
          再点一次确认删除设备。
        </Alert>
      ) : null}

      <form
        className="mt-3 space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const method = (form.elements.namedItem('method') as HTMLInputElement).value;
          const raw = (form.elements.namedItem('value') as HTMLInputElement).value.trim();
          let value: unknown = raw;

          if (raw) {
            try {
              value = JSON.parse(raw);
            } catch {
              value = raw;
            }
          }

          await onSendCommand(device.deviceId, method, raw ? { value } : {}, device.roomId);
          form.reset();
        }}
      >
        <Input
          name="method"
          placeholder="方法名"
          defaultValue={
            device.capabilities?.find((cap) => cap.kind === 'method')?.name ||
            'set_led'
          }
        />
        <Input name="value" placeholder='参数值，支持 JSON，例如 {"value":1}' />
        <Button type="submit" size="sm" className="w-full">
          下发命令
        </Button>
      </form>
    </article>
  );
};
