import { createRootRoute, Outlet, Link, useNavigate, redirect } from '@tanstack/react-router';
import { useAppStore } from '../lib/store';
import { useEffect } from 'react';
import { Button } from '../components/ui/button';
import { useHomeStructure, useHomes } from '../lib/swr-hooks';

const navItems = [
  { to: '/', label: '总览' },
  { to: '/automations', label: '自动化' },
  { to: '/chat', label: '对话' },
  { to: '/observability', label: '观测' },
];

function Shell() {
  const hydrate = useAppStore((s) => s.hydrate);
  const token = useAppStore((s) => s.token);
  const user = useAppStore((s) => s.user);
  const selectedHome = useAppStore((s) => s.selectedHome);
  const selectedRoom = useAppStore((s) => s.selectedRoom);
  const hydrated = useAppStore((s) => s.hydrated);
  const logout = useAppStore((s) => s.logout);
  const navigate = useNavigate();
  const { data: homes = [] } = useHomes(!!token);
  const { data: structure } = useHomeStructure(token ? selectedHome : undefined);
  const currentHome = homes.find((item) => item.id === selectedHome) || structure?.home;
  const currentRoom = structure?.rooms.find((item) => item.id === selectedRoom);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return <div className="p-6 text-sm text-muted-foreground">正在同步会话状态...</div>;
  }

  const navBase =
    'rounded-full border border-transparent bg-transparent px-3 py-1.5 text-sm text-muted-foreground transition hover:border-border hover:bg-white/80 hover:text-foreground';

  return (
    <div className="min-h-screen pb-8 text-foreground">
      <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6 sm:pt-5 lg:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="relative overflow-hidden rounded-[1.4rem] border border-border/80 bg-background/86 p-4 shadow-[0_20px_40px_-34px_oklch(0.25_0.02_245_/_42%)] backdrop-blur-xl sm:p-5">
            <div className="ambient-orb -left-10 -top-12 bg-[oklch(0.74_0.14_218_/_58%)]" />
            <div className="ambient-orb -right-12 -bottom-16 bg-[oklch(0.76_0.08_96_/_52%)] [animation-delay:0.4s]" />
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="section-eyebrow">iot-agent</p>
                <h1 className="text-xl font-semibold sm:text-2xl">智能家庭协同控制台</h1>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  统一管理家庭拓扑、设备命令、自动化规则和前台对话助手。
                </p>
              </div>
              <div className="flex w-full flex-col gap-3 lg:w-auto lg:items-end">
                <nav className="flex max-w-full items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {navItems.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={navBase}
                      activeProps={{
                        className:
                          'rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary',
                      }}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
                {!token ? (
                  <Button size="sm" onClick={() => navigate({ to: '/login' })} className="w-full sm:w-auto">
                    登录控制台
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-2 text-xs sm:text-sm">
                    <span className="data-pill max-w-full truncate">{user?.email}</span>
                    <Button size="sm" variant="outline" onClick={() => logout()}>
                      退出
                    </Button>
                  </div>
                )}
              </div>
            </div>
            {token ? (
              <div className="relative mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
                <span className="data-pill">家庭: {currentHome?.name || '未选择'}</span>
                <span className="data-pill">房间: {currentRoom?.name || '未选择'}</span>
                <span className="data-pill">角色: {user?.role || 'unknown'}</span>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export const Route = createRootRoute({
  component: Shell,
  beforeLoad: ({ location, context }) => {
    const token = localStorage.getItem('authToken');
    if (!token && location.pathname !== '/login') {
      throw redirect({ to: '/login' });
    }
    return context;
  },
});
