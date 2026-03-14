import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { SetupStep } from './setup-step';

export const QuickStartCard = ({
  hasHome,
  hasRoom,
  hasDevice,
  onCreateHome,
  onCreateRoom,
  onPreRegisterDevice,
}: {
  hasHome: boolean;
  hasRoom: boolean;
  hasDevice: boolean;
  onCreateHome: () => void;
  onCreateRoom: () => void;
  onPreRegisterDevice: () => void;
}) => {
  const completedCount = Number(hasHome) + Number(hasRoom) + Number(hasDevice);
  const progress = `${Math.round((completedCount / 3) * 100)}%`;

  return (
    <Card className="surface-panel relative overflow-hidden">
      <div className="ambient-orb -right-10 -top-8 bg-[oklch(0.78_0.08_220_/_20%)]" />
      <CardHeader className="relative space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">快速开始</p>
            <p className="mt-1 text-xs text-muted-foreground">
              完成这 3 步后，设备控制和自动化会更顺畅。
            </p>
          </div>
          <span className="data-pill">{completedCount}/3</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: progress }}
          />
        </div>
      </CardHeader>
      <CardContent className="relative space-y-2.5">
        <SetupStep
          index={1}
          title="创建家庭"
          description="先确认你当前要管理的真实空间。"
          done={hasHome}
          actionLabel="新建家庭"
          onAction={onCreateHome}
        />
        <SetupStep
          index={2}
          title="添加房间"
          description="按实际场景拆分，例如客厅、主卧、书房。"
          done={hasRoom}
          actionLabel="添加房间"
          onAction={onCreateRoom}
        />
        <SetupStep
          index={3}
          title="预注册设备"
          description="把设备归到房间，命令和自动化才能精准落位。"
          done={hasDevice}
          actionLabel="预注册设备"
          onAction={onPreRegisterDevice}
        />
      </CardContent>
    </Card>
  );
};
