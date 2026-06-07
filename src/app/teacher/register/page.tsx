import Link from "next/link";
import { UserPlus } from "lucide-react";
import { redirect } from "next/navigation";
import { Button } from "@cloudflare/kumo/components/button";

import { DatabaseSetup } from "@/components/DatabaseSetup";
import { Notice } from "@/components/Notice";
import { registerTeacherAction } from "@/lib/actions";
import { getCurrentTeacher } from "@/lib/auth";
import { hasDatabaseUrl } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function RegisterPage({ searchParams }: PageProps) {
  const teacher = await getCurrentTeacher();

  if (teacher) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const databaseReady = hasDatabaseUrl();

  return (
    <main className="auth-wrap">
      <section className="auth-panel">
        <p className="eyebrow">创建老师账号</p>
        <h1>开始管理 RKS</h1>
        <p className="muted" style={{ marginTop: 10 }}>
          只需要账号和密码，不需要邮箱验证。
        </p>

        <Notice error={params.error} />

        {databaseReady ? (
          <form action={registerTeacherAction}>
            <label className="field">
              <span>账号</span>
              <input name="username" autoComplete="username" minLength={3} required />
            </label>
            <label className="field">
              <span>密码</span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>
            <Button variant="primary" type="submit">
              <UserPlus aria-hidden="true" size={17} />
              注册并进入控制台
            </Button>
          </form>
        ) : (
          <div style={{ marginTop: 18 }}>
            <DatabaseSetup />
          </div>
        )}

        {databaseReady ? (
          <p className="muted" style={{ marginTop: 16 }}>
            已有账号？ <Link href="/teacher/login">登录</Link>
          </p>
        ) : null}
      </section>
    </main>
  );
}
