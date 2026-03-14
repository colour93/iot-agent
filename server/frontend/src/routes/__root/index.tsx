import { createRootRoute, Outlet, Link, useNavigate, redirect, useLocation } from '@tanstack/react-router';
import { useAppStore } from '../../lib/store';
import { useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { useHomeStructure, useHomes } from '../../lib/swr-hooks';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/', label: '总览' },
  { to: '/automations', label: '自动化' },
  { to: '/chat', label: '对话' },
  { to: '/observability', label: '观测' },
];

const Shell = () => {
  const hydrate = useAppStore((s) => s.hydrate);
  const token = useAppStore((s) => s.token);
  const user = useAppStore((s) => s.user);
  const selectedHome = useAppStore((s) => s.selectedHome);
  const selectedRoom = useAppStore((s) => s.selectedRoom);
  const hydrated = useAppStore((s) => s.hydrated);
  const logout = useAppStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const { data: homes = [] } = useHomes(!!token);
  const { data: structure } = useHomeStructure(token ? selectedHome : undefined);
  const currentHome = homes.find((item) => item.id === selectedHome) || structure?.home;
  const currentRoom = structure?.rooms.find((item) => item.id === selectedRoom);
  const isChatRoute = location.pathname === '/chat' || location.pathname.startsWith('/chat/');

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return <div className="p-6 text-sm text-muted-foreground">正在同步会话状态...</div>;
  }

  const navBase =
    'rounded-full border border-transparent bg-transparent px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border/80 hover:bg-card/80 hover:text-foreground';
  const contextLabel = currentHome
    ? currentRoom
      ? `${currentHome.name} / ${currentRoom.name}`
      : `${currentHome.name} / 全部房间`
    : '先选择一个家庭开始管理';

  return (
    <div
      className={cn(
        'text-foreground',
        isChatRoute ? 'h-dvh overflow-hidden' : 'min-h-screen pb-8',
      )}
    >
      <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6 sm:pt-5 lg:px-8">
        <div className="mx-auto max-w-[1240px]">
          <div className="relative overflow-hidden rounded-[1.3rem] border border-border/80 bg-background/90 px-4 py-4 shadow-[0_18px_34px_-28px_oklch(0.28_0.02_240_/_18%)] backdrop-blur-xl sm:px-5">
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,oklch(0.7_0.05_218_/_40%),transparent)]" />
            <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
              <div className="min-w-0 lg:flex-[1.15]">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-primary/14 bg-primary/6 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-primary">
                    IoT Agent
                  </span>
                  <div className="flex gap-2 items-center">
                    <p className="text-sm font-semibold sm:text-base">家庭控制台</p>
                    <p className="truncate text-xs text-muted-foreground sm:text-sm">
                      {token ? `当前空间：${contextLabel}` : '登录后开始管理家庭、房间与设备'}
                    </p>
                  </div>
                </div>
              </div>

              {token ? (
                <nav className="order-3 flex max-w-full items-center gap-2 overflow-x-auto pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:order-none lg:flex-1 lg:justify-center lg:pt-0">
                  {navItems.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={navBase}
                      activeProps={{
                        className:
                          'rounded-full border border-primary/18 bg-primary/8 px-3 py-1.5 text-sm font-medium text-foreground shadow-[inset_0_1px_0_oklch(1_0_0_/_48%)]',
                      }}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              ) : null}

              <div className="flex items-center justify-between gap-2 lg:min-w-[220px] lg:justify-end">
                {!token ? (
                  <Button size="sm" onClick={() => navigate({ to: '/login' })} className="w-full sm:w-auto">
                    登录控制台
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <span className="data-pill hidden max-w-[15rem] truncate sm:inline-flex">{user?.email}</span>
                    <Button size="sm" variant="outline" onClick={() => logout()}>
                      退出
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>
      <main
        className={cn(
          isChatRoute
            ? 'flex h-[calc(100dvh-7.8rem)] px-3 pb-4 pt-4 sm:px-4 lg:px-5'
            : 'mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8',
        )}
      >
        <div className={cn('page-enter', isChatRoute ? 'h-full w-full' : '')}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

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
