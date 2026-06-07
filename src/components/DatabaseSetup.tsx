import { Database } from "lucide-react";

export function DatabaseSetup() {
  return (
    <section className="setup-panel">
      <Database aria-hidden="true" size={24} />
      <div>
        <h2>还没有连接 PostgreSQL</h2>
        <p>
          请在本地 `.env.local` 或 Vercel 项目环境变量中配置 `DATABASE_URL`。
          配好后刷新页面，系统会自动创建数据表。
        </p>
      </div>
    </section>
  );
}
