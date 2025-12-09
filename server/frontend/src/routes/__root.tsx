import { createRootRoute, Outlet, Link, useNavigate, redirect } from '@tanstack/react-router';
import { useAppStore } from '../lib/store';
import { useEffect } from 'react';
import { Button } from '../components/ui/button';

function Shell() {
  const hydrate = useAppStore((s) => s.hydrate);
  const token = useAppStore((s) => s.token);
  const user = useAppStore((s) => s.user);
  const hydrated = useAppStore((s) => s.hydrated);
  const logout = useAppStore((s) => s.logout);
  const navigate = useNavigate();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return <div className="p-6 text-sm text-gray-500">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="text-lg font-semibold">智能家庭控制台</div>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" activeProps={{ className: 'text-blue-600 font-medium' }}>
              总览
            </Link>
            <Link to="/automations" activeProps={{ className: 'text-blue-600 font-medium' }}>
              自动化
            </Link>
            <Link to="/chat" activeProps={{ className: 'text-blue-600 font-medium' }}>
              对话
            </Link>
            <Link to="/observability" activeProps={{ className: 'text-blue-600 font-medium' }}>
              观测
            </Link>
            {!token ? (
              <Button size="sm" variant="outline" onClick={() => navigate({ to: '/login' })}>
                登录
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">{user?.email}</span>
                <Button size="sm" variant="outline" onClick={() => logout()}>
                  退出
                </Button>
              </div>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">
        <Outlet />
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
