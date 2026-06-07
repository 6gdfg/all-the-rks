import Link from "next/link";
import { LogIn } from "lucide-react";
import { redirect } from "next/navigation";

import { DatabaseSetup } from "@/components/DatabaseSetup";
import { Notice } from "@/components/Notice";
import { loginTeacherAction } from "@/lib/actions";
import { getCurrentTeacher } from "@/lib/auth";
import { hasDatabaseUrl } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = {
  searchParams?: Promise<{
    notice?: string;
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const teacher = await getCurrentTeacher();

  if (teacher) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const databaseReady = hasDatabaseUrl();

  return (
    <main className="auth-wrap">
      <section className="auth-panel">
        <p className="eyebrow">老师入口</p>
        <h1>登录控制台</h1>
        <p className="muted" style={{ marginTop: 10 }}>
          登录后可以创建班级、录入成绩并调整公开展示设置。
        </p>

        <Notice notice={params.notice} error={params.error} />

        {databaseReady ? (
          <form action={loginTeacherAction}>
            <label className="field">
              <span>账号</span>
              <input name="username" autoComplete="username" required />
            </label>
            <label className="field">
              <span>密码</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="primary-button" type="submit">
              <LogIn aria-hidden="true" size={17} />
              登录
            </button>
          </form>
        ) : (
          <div style={{ marginTop: 18 }}>
            <DatabaseSetup />
          </div>
        )}

        {databaseReady ? (
          <p className="muted" style={{ marginTop: 16 }}>
            还没有账号？ <Link href="/teacher/register">注册老师账号</Link>
          </p>
        ) : null}
      </section>
    </main>
  );
}
