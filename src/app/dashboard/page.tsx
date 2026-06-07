import { LogOut, Plus, Settings } from "lucide-react";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";

import { DatabaseSetup } from "@/components/DatabaseSetup";
import { Notice } from "@/components/Notice";
import { createClassAction, logoutTeacherAction } from "@/lib/actions";
import { requireTeacher } from "@/lib/auth";
import { getTeacherDashboard } from "@/lib/data";
import { formatRks } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DashboardProps = {
  searchParams?: Promise<{
    notice?: string;
    error?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const teacher = await requireTeacher();
  const params = (await searchParams) ?? {};
  const dashboard = await getTeacherDashboard(teacher.id);

  return (
    <main>
      <section className="dashboard-header">
        <div className="dashboard-title">
          <p className="eyebrow">老师控制台</p>
          <h1>{teacher.username} 的班级</h1>
          <p className="muted">创建班级后，可以在班级控制台录入学生、考试和成绩。</p>
        </div>
        <div className="toolbar-panel">
          <form action={logoutTeacherAction}>
            <Button variant="ghost" type="submit">
              <LogOut aria-hidden="true" size={17} />
              退出登录
            </Button>
          </form>
        </div>
      </section>

      <Notice notice={params.notice} error={params.error} />

      {!dashboard.databaseReady ? <DatabaseSetup /> : null}

      <section className="toolbar-panel" style={{ marginBottom: 18 }}>
        <form className="toolbar-form" action={createClassAction}>
          <label className="field">
            <span>班级名称</span>
            <input name="name" placeholder="例如：高二 3 班" required />
          </label>
          <label className="field">
            <span>学科</span>
            <input name="subject" placeholder="例如：数学" defaultValue="学科" />
          </label>
          <Button variant="primary" type="submit">
            <Plus aria-hidden="true" size={17} />
            创建班级
          </Button>
        </form>
      </section>

      {dashboard.classes.length > 0 ? (
        <section className="class-grid">
          {dashboard.classes.map((item) => (
            <article className="class-card" key={item.id}>
              <div className="class-card-top">
                <div>
                  <h2>{item.name}</h2>
                  <p className="muted">{item.subject}</p>
                </div>
                <LinkButton variant="primary" href={`/dashboard/classes/${item.id}`}>
                  <Settings aria-hidden="true" size={17} />
                  打开
                </LinkButton>
              </div>

              <div className="class-metrics">
                <div className="metric">
                  <strong>{item.studentCount}</strong>
                  <span className="muted">学生</span>
                </div>
                <div className="metric">
                  <strong>{item.examCount}</strong>
                  <span className="muted">考试</span>
                </div>
                <div className="metric">
                  <strong>{formatRks(item.topRks)}</strong>
                  <span className="muted">
                    {item.topStudentName ? `最高 · ${item.topStudentName}` : "最高 RKS"}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="empty-state">还没有班级。先创建一个班级开始录入数据。</div>
      )}
    </main>
  );
}
