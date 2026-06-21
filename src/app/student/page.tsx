import { KeyRound, LogIn, LogOut, Save } from "lucide-react";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";

import { AsyncActionForm } from "@/components/AsyncActionForm";
import { DatabaseSetup } from "@/components/DatabaseSetup";
import { Notice } from "@/components/Notice";
import {
  loginStudentAction,
  logoutStudentAction,
  updateStudentAccessInlineAction
} from "@/lib/student-actions";
import { getCurrentStudentSession } from "@/lib/student-auth";
import { getStudentPortalData, type StudentPortalSubject } from "@/lib/data";
import { hasDatabaseUrl } from "@/lib/db";
import { formatDate, formatRks, formatScore } from "@/lib/format";
import type { ExamResult, StudentVisibility } from "@/lib/rks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StudentPageProps = {
  searchParams?: Promise<{
    notice?: string;
    error?: string;
  }>;
};

export default async function StudentPage({ searchParams }: StudentPageProps) {
  const params = (await searchParams) ?? {};
  const databaseReady = hasDatabaseUrl();
  const session = databaseReady ? await getCurrentStudentSession() : null;
  const portalData = session
    ? await getStudentPortalData(session.studentId)
    : null;

  return (
    <main className="student-page">
      <Notice notice={params.notice} error={params.error} />

      {!databaseReady ? (
        <DatabaseSetup />
      ) : portalData ? (
        <>
          <section className="panel student-portal-header">
            <div>
              <p className="eyebrow">学生入口</p>
              <h1>{portalData.studentName}</h1>
              <p className="muted">
                已匹配 {portalData.subjects.length} 门学科。这里可以查看自己的
                RKS，并修改公开方式和查询码。
              </p>
            </div>
            <form action={logoutStudentAction}>
              <Button variant="secondary" type="submit">
                <LogOut aria-hidden="true" size={17} />
                退出
              </Button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>
                  <KeyRound aria-hidden="true" size={18} />
                  隐私设置
                </h2>
                <p className="muted">
                  公开表示可在首页按姓名查到；仅查询码表示只可从学生入口查看。
                </p>
              </div>
            </div>
            <AsyncActionForm
              action={updateStudentAccessInlineAction}
              className="student-access-form"
            >
              <label className="segmented-field">
                <span>公开方式</span>
                <div className="segmented-control privacy-segmented">
                  <label>
                    <input
                      defaultChecked={portalData.visibility === "public"}
                      name="visibility"
                      type="radio"
                      value="public"
                    />
                    <span>公开</span>
                  </label>
                  <label>
                    <input
                      defaultChecked={portalData.visibility === "code_only"}
                      name="visibility"
                      type="radio"
                      value="code_only"
                    />
                    <span>仅查询码</span>
                  </label>
                </div>
              </label>
              <label className="field">
                <span>查询码</span>
                <input
                  autoComplete="new-password"
                  defaultValue={portalData.queryCode}
                  maxLength={40}
                  minLength={4}
                  name="queryCode"
                  required
                />
              </label>
              <div className="field">
                <span>&nbsp;</span>
                <Button variant="primary" type="submit">
                  <Save aria-hidden="true" size={17} />
                  保存
                </Button>
              </div>
            </AsyncActionForm>
          </section>

          <section className="student-subject-list" aria-label="我的 RKS">
            {portalData.subjects.length > 0 ? (
              portalData.subjects.map((subject) => (
                <StudentSubjectCard
                  key={`${subject.classId}-${subject.subject}`}
                  subject={subject}
                />
              ))
            ) : (
              <div className="empty-state">
                还没有匹配到学科数据。请确认老师是否已经给你生成查询码。
              </div>
            )}
          </section>
        </>
      ) : (
        <StudentLoginPanel />
      )}
    </main>
  );
}

function StudentLoginPanel() {
  return (
    <section className="auth-panel student-login-panel">
      <p className="eyebrow">学生入口</p>
      <h1>用查询码进入自己的 RKS 控制页</h1>
      <p className="muted" style={{ marginTop: 10 }}>
        查询码由老师创建学生时生成；进入后可以改成自己想要的码。
      </p>

      <form action={loginStudentAction}>
        <label className="field">
          <span>姓名</span>
          <input name="name" autoComplete="name" required />
        </label>
        <label className="field">
          <span>查询码</span>
          <input
            name="queryCode"
            type="password"
            autoComplete="current-password"
            minLength={4}
            maxLength={40}
            required
          />
        </label>
        <Button variant="primary" type="submit">
          <LogIn aria-hidden="true" size={17} />
          进入学生入口
        </Button>
      </form>
    </section>
  );
}

function StudentSubjectCard({ subject }: { subject: StudentPortalSubject }) {
  const student = subject.student;

  return (
    <article className="student-subject-card">
      <div className="student-subject-top">
        <div>
          <p className="eyebrow">{subject.subject}</p>
          <h2>{subject.className}</h2>
          <p className="muted">{visibilityText(subject.visibility)}</p>
        </div>
        <div className="rks-summary">
          <div className="rks-number">
            {student ? formatRks(student.rks) : "--"}
          </div>
          <span className="muted">RKS</span>
        </div>
      </div>

      <div className="badge-row">
        <Badge variant="outline">{visibilityBadgeText(subject.visibility)}</Badge>
        {student && student.rank > 0 ? (
          <Badge variant="outline">
            班级第 {student.rank} / {subject.totalStudents || "--"}
          </Badge>
        ) : null}
        <Badge variant="outline">
          已录入 {student?.results.length ?? 0} 次考试
        </Badge>
      </div>

      {student && student.results.length > 0 ? (
        <details className="student-score-details">
          <summary>查看计入 RKS 的项目</summary>
          <div className="mini-table">
            {student.perfectResults.map((item, index) => (
              <StudentScoreRow
                item={item}
                key={`p${index + 1}-${item.examId}`}
                label={`p${index + 1}`}
              />
            ))}
            {student.bestResults.map((item, index) => (
              <StudentScoreRow
                item={item}
                key={`b${index + 1}-${item.examId}`}
                label={`b${index + 1}`}
              />
            ))}
          </div>
        </details>
      ) : (
        <div className="empty-state">这门学科还没有成绩。</div>
      )}
    </article>
  );
}

function StudentScoreRow({
  item,
  label
}: {
  item: ExamResult;
  label: string;
}) {
  return (
    <div className="mini-row detail-rks-row">
      <span className="detail-rks-main">
        <strong className={label.startsWith("p") ? "rks-label p1-label" : "rks-label"}>
          {label}
        </strong>
        <span>
          <span className={`difficulty-text difficulty-${item.difficulty.toLowerCase()}`}>
            {item.difficulty}
          </span>{" "}
          · {formatDate(item.examDate)} · {item.examName}
        </span>
      </span>
      <strong>
        {formatScore(item.score)}/{formatScore(item.totalScore)} ·{" "}
        {formatRks(item.examRks)}
      </strong>
    </div>
  );
}

function visibilityText(visibility: StudentVisibility) {
  return visibility === "code_only"
    ? "仅学生入口可查看"
    : "可在首页公开查询";
}

function visibilityBadgeText(visibility: StudentVisibility) {
  return visibility === "code_only" ? "仅查询码" : "公开";
}
