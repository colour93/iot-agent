import { createRoute } from '@tanstack/react-router';
import { Route as RootRoute } from './__root';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Alert } from '../components/ui/alert';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';
import { useNavigate } from '@tanstack/react-router';

function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAppStore((s) => s.setAuth);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    try {
      setError(null);
      let res;
      if (isRegister) {
        res = await api.register(email, password);
      } else {
        res = await api.login(email, password);
      }
      setAuth(res.token, res.user);
      navigate({ to: '/' });
    } catch (err: unknown) {
      console.error(err);
      setError((err as { message?: string })?.message || (isRegister ? '注册失败' : '登录失败，请检查账号密码'));
    }
  };

  return (
    <div className="mx-auto mt-4 grid max-w-4xl gap-4 lg:grid-cols-[1.1fr_1fr]">
      <section className="surface-panel relative overflow-hidden rounded-2xl p-6">
        <div className="ambient-orb -right-20 -top-20 bg-[oklch(0.73_0.08_214_/_24%)]" />
        <div className="relative space-y-4">
          <div>
            <p className="section-eyebrow">欢迎使用</p>
            <h2 className="mt-1 text-2xl font-semibold sm:text-3xl">进入家庭控制台</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              登录后可统一管理家庭、设备命令、自动化规则和对话助手。
            </p>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="inset-panel rounded-lg px-3 py-2">
              家庭级上下文隔离，避免跨家庭误操作。
            </li>
            <li className="inset-panel rounded-lg px-3 py-2">
              规则优先执行，LLM 用于解释与辅助生成。
            </li>
            <li className="inset-panel rounded-lg px-3 py-2">
              指标与链路快照在观测页统一查看。
            </li>
          </ul>
        </div>
      </section>

      <section className="surface-panel rounded-2xl p-6">
        <div className="mb-4">
          <p className="section-eyebrow">账号入口</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-lg font-semibold">{isRegister ? '注册账号' : '登录账号'}</span>
            <Button variant="link" onClick={() => setIsRegister(!isRegister)} className="text-sm">
              {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
            </Button>
          </div>
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await handleSubmit();
          }}
        >
          <Input placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button className="w-full" type="submit">
            {isRegister ? '注册并登录' : '登录'}
          </Button>
          <div className="rounded-lg border border-border/70 bg-muted/45 px-3 py-2 text-center text-xs text-muted-foreground">
            演示账号: demo@example.com / demo1234
          </div>
        </form>
      </section>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/login',
  component: LoginPage,
});
