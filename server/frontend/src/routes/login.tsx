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
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRegister ? '注册失败' : '登录失败，请检查账号密码'));
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-lg border bg-white p-6 shadow-sm mt-10">
      <div className="text-lg font-semibold flex justify-between items-center">
        <span>{isRegister ? '注册账号' : '登录'}</span>
        <Button variant="link" onClick={() => setIsRegister(!isRegister)} className="text-sm text-blue-500">
          {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
        </Button>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="space-y-2">
        <Input placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button className="w-full" onClick={handleSubmit}>
        {isRegister ? '注册并登录' : '登录'}
      </Button>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/login',
  component: LoginPage,
});
