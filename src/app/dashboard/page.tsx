import { LogOut, Plus, Save, Settings } from "lucide-react";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";

import { AsyncActionForm } from "@/components/AsyncActionForm";
import { DatabaseSetup } from "@/components/DatabaseSetup";
import { Notice } from "@/components/Notice";
import {
  createClassInlineAction,
  logoutTeacherAction,
  updateHomeCopyInlineAction
} from "@/lib/actions";
import { requireTeacher } from "@/lib/auth";
import { getHomeCopy, getTeacherDashboard } from "@/lib/data";
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
  const [dashboard, homeCopy] = await Promise.all([
    getTeacherDashboard(teacher.id),
    getHomeCopy()
  ]);
  const homeStats = Array.from({ length: 4 }, (_, index) => (
    homeCopy.heroStats[index] ?? { value: "", label: "" }
  ));

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
        <div className="panel-header">
          <div>
            <h2>首页文字</h2>
            <p className="muted">自定义首页顶部查询区域的标题、说明和规则小块。</p>
          </div>
        </div>
        <AsyncActionForm
          className="home-copy-form"
          action={updateHomeCopyInlineAction}
        >
          <div className="home-copy-main">
            <label className="field">
              <span>小标题</span>
              <input
                name="heroEyebrow"
                defaultValue={homeCopy.heroEyebrow}
                maxLength={60}
                placeholder="All The RKS"
              />
            </label>
            <label className="field">
              <span>主标题</span>
              <textarea
                name="heroTitle"
                defaultValue={homeCopy.heroTitle}
                maxLength={160}
                required
              />
            </label>
            <label className="field">
              <span>说明文字</span>
              <textarea
                name="heroSubtitle"
                defaultValue={homeCopy.heroSubtitle}
                maxLength={240}
              />
            </label>
          </div>
          <div className="home-copy-stat-grid" aria-label="首页规则小块">
            {homeStats.map((item, index) => (
              <div className="home-copy-stat-editor" key={index}>
                <label className="field">
                  <span>{`规则 ${index + 1} 数字`}</span>
                  <input
                    name={`stat${index + 1}Value`}
                    defaultValue={item.value}
                    maxLength={16}
                    required
                  />
                </label>
                <label className="field">
                  <span>{`规则 ${index + 1} 说明`}</span>
                  <input
                    name={`stat${index + 1}Label`}
                    defaultValue={item.label}
                    maxLength={40}
                    required
                  />
                </label>
              </div>
            ))}
          </div>
          <Button className="home-copy-save" variant="primary" type="submit">
            <Save aria-hidden="true" size={17} />
            保存首页文字
          </Button>
        </AsyncActionForm>
      </section>

      <section className="toolbar-panel" style={{ marginBottom: 18 }}>
        <AsyncActionForm
          className="toolbar-form"
          action={createClassInlineAction}
          resetOnSuccess
        >
          <label className="field">
            <span>班级名称</span>
            <input name="name" placeholder="例如：高二 3 班" required />
          </label>
          <label className="field">
            <span>学科</span>
            <input name="subject" placeholder="例如：数学" defaultValue="学科" />
          </label>
          <label className="switch toolbar-switch">
            <input name="autoClassFirst" type="checkbox" defaultChecked />
            <span>自动识别班级第一</span>
          </label>
          <Button variant="primary" type="submit">
            <Plus aria-hidden="true" size={17} />
            创建班级
          </Button>
        </AsyncActionForm>
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
