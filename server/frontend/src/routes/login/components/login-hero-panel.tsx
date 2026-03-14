export const LoginHeroPanel = () => {
  return (
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
  );
};
