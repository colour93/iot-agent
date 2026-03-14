import { Pencil, Trash2 } from 'lucide-react';
import type { Room } from '../../../lib/types';

export const RoomTabs = ({
  rooms,
  currentRoomId,
  onSelect,
  onEdit,
  onDelete,
}: {
  rooms: Room[];
  currentRoomId?: string;
  onSelect: (room: Room) => void;
  onEdit: (room: Room) => void;
  onDelete: (room: Room) => void;
}) => {
  return (
    <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex min-w-full gap-2 rounded-[1rem] border border-border/70 bg-muted/40 p-1.5">
        {rooms.map((room) => {
          const active = room.id === currentRoomId;

          return (
            <div
              key={room.id}
              className={`flex min-w-[168px] items-start gap-2 rounded-[0.75rem] px-2 py-2 text-left text-xs transition-all ${
                active
                  ? 'border border-primary/25 bg-card text-foreground shadow-[0_12px_26px_-22px_oklch(0.29_0.08_220_/_34%)]'
                  : 'border border-transparent text-muted-foreground hover:border-primary/12 hover:bg-card/70 hover:text-foreground'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(room)}
                className="min-w-0 flex-1 px-1 text-left"
              >
                <div className="truncate font-semibold">{room.name}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px]">
                  <span>{room.devicesCount ?? 0} 设备</span>
                  <span>{room.onlineDevicesCount ?? 0} 在线</span>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 bg-background/70 text-muted-foreground transition-colors hover:border-primary/18 hover:text-foreground"
                  title={`编辑 ${room.name}`}
                  onClick={() => onEdit(room)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 bg-background/70 text-muted-foreground transition-colors hover:border-destructive/35 hover:text-destructive"
                  title={`删除 ${room.name}`}
                  onClick={() => onDelete(room)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
