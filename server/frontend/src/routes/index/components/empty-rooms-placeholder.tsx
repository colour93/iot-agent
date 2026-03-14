import { Button } from '../../../components/ui/button';

export const EmptyRoomsPlaceholder = ({
  onCreateRoom,
}: {
  onCreateRoom: () => void;
}) => {
  return (
    <section className="surface-panel relative overflow-hidden px-8 py-12 text-center sm:px-12 sm:py-16">
      <div className="ambient-orb -left-10 top-2 bg-[oklch(0.74_0.07_218_/_20%)]" />
      <div className="ambient-orb -right-10 bottom-0 bg-[oklch(0.92_0.02_92_/_40%)] [animation-delay:0.5s]" />
      <div className="relative mx-auto max-w-xl">
        <p className="section-eyebrow">房间为空</p>
        <h3 className="mt-2 text-2xl font-semibold">当前家庭还没有房间</h3>
        <p className="mt-3 text-sm text-muted-foreground">
          先创建一个房间，再添加设备和自动化。这里不会再显示示例房间内容。
        </p>
        <Button className="mt-6" onClick={onCreateRoom}>
          立即创建第一个房间
        </Button>
      </div>
    </section>
  );
};
