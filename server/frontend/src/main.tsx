import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  RouterProvider,
  createRouter,
} from '@tanstack/react-router';
import { SWRConfig } from 'swr';
import { Toaster, toast } from 'sonner';
import './index.css';
import { Route as RootRoute } from './routes/__root';
import { Route as IndexRoute } from './routes';
import { Route as AutomationsRoute } from './routes/automations';
import { Route as ChatRoute } from './routes/chat';
import { Route as ObservabilityRoute } from './routes/observability';
import { Route as LoginRoute } from './routes/login';

const routeTree = RootRoute.addChildren([
  IndexRoute,
  AutomationsRoute,
  ChatRoute,
  ObservabilityRoute,
  LoginRoute,
]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SWRConfig
      value={{
        fetcher: async (url: string) => {
          try {
            const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
            if (!res.ok) throw new Error(res.statusText);
            return await res.json();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : '请求失败');
            throw err;
          }
        },
        revalidateOnFocus: false,
      }}
    >
      <Toaster position="top-center" richColors />
      <RouterProvider router={router} />
    </SWRConfig>
  </StrictMode>,
);
