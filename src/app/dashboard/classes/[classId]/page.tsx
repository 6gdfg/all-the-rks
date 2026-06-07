import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Save,
  Settings,
  Trophy,
  Users
} from "lucide-react";

import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { Notice } from "@/components/Notice";
import {
  createExamAction,
  createStudentAction,
  deleteClassAction,
  deleteExamAction,
  deleteStudentAction,
  saveScoresAction,
  updateClassAction,
  updateExamAction,
  updateSettingsAction,
  updateStudentAction
} from "@/lib/actions";
import { requireTeacher } from "@/lib/auth";
import { getClassDetailById } from "@/lib/data";
import { formatDate, formatRks, formatScore, normalizeDateInput } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ClassPageProps = {
  params: Promise<{
    classId: string;
  }>;
  searchParams?: Promise<{
    notice?: string;
    error?: string;
  }>;
};

export default async function ClassPage({ params, searchParams }: ClassPageProps) {
  const teacher = await requireTeacher();
  const { classId: classIdText } = await params;
  const classId = Number(classIdText);
  const query = (await searchParams) ?? {};
  const detail = await getClassDetailById(teacher.id, classId);
  const scoreMap = new Map(
    detail.scores.map((score) => [`${score.studentId}:${score.examId}`, score.score])
  );

  const gridColumns = `minmax(150px, 1.1fr) repeat(${Math.max(
    detail.exams.length,
    1
  )}, minmax(128px, 1fr))`;

  return (
    <main className="class-layout">
      <div className="button-row">
        <Link className="link-button" href="/dashboard">
          <ArrowLeft aria-hidden="true" size={17} />
          返回控制台
        </Link>
      </div>

      <Notice notice={query.notice} error={query.error} />

      <section className="panel">
        <div className="class-header">
          <div>
            <p className="eyebrow">班级控制台</p>
            <h1>{detail.name}</h1>
            <p className="muted">
              {detail.subject} · {detail.students.length} 名学生 ·{" "}
              {detail.exams.length} 次考试
            </p>
          </div>
          <form action={deleteClassAction}>
            <input type="hidden" name="classId" value={detail.id} />
            <ConfirmDeleteButton
              label="删除班级"
              message="确定删除这个班级吗？学生、考试和成绩也会一并删除。"
            />
          </form>
        </div>

        <form className="grid-3" action={updateClassAction}>
          <input type="hidden" name="classId" value={detail.id} />
          <label className="field">
            <span>班级名称</span>
            <input name="name" defaultValue={detail.name} required />
          </label>
          <label className="field">
            <span>学科</span>
            <input name="subject" defaultValue={detail.subject} />
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button className="primary-button" type="submit">
              <Save aria-hidden="true" size={17} />
              保存班级信息
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>
              <Settings aria-hidden="true" size={18} /> 展示设置
            </h2>
            <p className="muted">控制首页、学生查询页和成绩明细的公开程度。</p>
          </div>
        </div>
        <form className="settings-grid" action={updateSettingsAction}>
          <input type="hidden" name="classId" value={detail.id} />
          <label className="switch">
            <input
              name="publicSearchEnabled"
              type="checkbox"
              defaultChecked={detail.settings.publicSearchEnabled}
            />
            <span>允许学生在首页查询自己的 RKS</span>
          </label>
          <label className="switch">
            <input
              name="showHomeLeaderboard"
              type="checkbox"
              defaultChecked={detail.settings.showHomeLeaderboard}
            />
            <span>在主页展示班级 RKS 排行榜</span>
          </label>
          <label className="switch">
            <input
              name="showStudentRank"
              type="checkbox"
              defaultChecked={detail.settings.showStudentRank}
            />
            <span>学生查询时显示班级排名</span>
          </label>
          <label className="switch">
            <input
              name="showExamScores"
              type="checkbox"
              defaultChecked={detail.settings.showExamScores}
            />
            <span>学生查询时显示每次考试成绩和单次 RKS</span>
          </label>
          <label className="field">
            <span>首页排行榜人数</span>
            <input
              name="leaderboardLimit"
              type="number"
              min={3}
              max={100}
              defaultValue={detail.settings.leaderboardLimit}
            />
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button className="primary-button" type="submit">
              <Save aria-hidden="true" size={17} />
              保存展示设置
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>
              <Users aria-hidden="true" size={18} /> 学生
            </h2>
            <p className="muted">学生姓名用于首页查询；同一班级内不允许重名。</p>
          </div>
        </div>

        <form className="grid-4" action={createStudentAction} style={{ marginBottom: 14 }}>
          <input type="hidden" name="classId" value={detail.id} />
          <label className="field">
            <span>姓名</span>
            <input name="name" placeholder="学生姓名" required />
          </label>
          <label className="field">
            <span>学号</span>
            <input name="studentNo" placeholder="可选" />
          </label>
          <label className="field">
            <span>备注</span>
            <input name="notes" placeholder="可选" />
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button className="primary-button" type="submit">
              <Plus aria-hidden="true" size={17} />
              加入学生
            </button>
          </div>
        </form>

        {detail.students.length > 0 ? (
          <div className="table-list">
            <div className="editor-head student-head">
              <span>学号</span>
              <span>姓名</span>
              <span>备注</span>
              <span>操作</span>
            </div>
            {detail.students.map((student) => (
              <form
                className="editor-row student-row"
                action={updateStudentAction}
                key={student.id}
              >
                <input type="hidden" name="classId" value={detail.id} />
                <input type="hidden" name="studentId" value={student.id} />
                <input name="studentNo" defaultValue={student.studentNo} />
                <input name="name" defaultValue={student.name} required />
                <input name="notes" defaultValue={student.notes} />
                <div className="button-row">
                  <button className="icon-button" type="submit" title="保存学生">
                    <Save aria-hidden="true" size={16} />
                  </button>
                  <ConfirmDeleteButton
                    compact
                    label="删除学生"
                    message={`确定删除学生「${student.name}」吗？相关成绩也会删除。`}
                    formAction={deleteStudentAction}
                  />
                </div>
              </form>
            ))}
          </div>
        ) : (
          <div className="empty-state">还没有学生。</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>考试</h2>
            <p className="muted">
              单次考试 RKS = 得分 / 总分 * 定数，定数会按 1 位小数保存。
            </p>
          </div>
        </div>

        <form className="grid-4" action={createExamAction} style={{ marginBottom: 14 }}>
          <input type="hidden" name="classId" value={detail.id} />
          <label className="field">
            <span>考试名称</span>
            <input name="name" placeholder="例如：第一次月考" required />
          </label>
          <label className="field">
            <span>日期</span>
            <input name="examDate" type="date" defaultValue={today()} />
          </label>
          <label className="field">
            <span>总分</span>
            <input name="totalScore" type="number" min={1} step="0.01" defaultValue={100} />
          </label>
          <label className="field">
            <span>定数</span>
            <input
              name="constantValue"
              type="number"
              min={0}
              step="0.1"
              defaultValue={10}
            />
          </label>
          <button className="primary-button" type="submit">
            <Plus aria-hidden="true" size={17} />
            创建考试
          </button>
        </form>

        {detail.exams.length > 0 ? (
          <div className="table-list">
            <div className="editor-head exam-head">
              <span>名称</span>
              <span>日期</span>
              <span>总分</span>
              <span>定数</span>
              <span>操作</span>
            </div>
            {detail.exams.map((exam) => (
              <form className="editor-row exam-row" action={updateExamAction} key={exam.id}>
                <input type="hidden" name="classId" value={detail.id} />
                <input type="hidden" name="examId" value={exam.id} />
                <input name="name" defaultValue={exam.name} required />
                <input
                  name="examDate"
                  type="date"
                  defaultValue={normalizeDateInput(exam.examDate)}
                />
                <input
                  name="totalScore"
                  type="number"
                  min={1}
                  step="0.01"
                  defaultValue={formatScore(exam.totalScore)}
                />
                <input
                  name="constantValue"
                  type="number"
                  min={0}
                  step="0.1"
                  defaultValue={exam.constantValue.toFixed(1)}
                />
                <div className="button-row">
                  <button className="icon-button" type="submit" title="保存考试">
                    <Save aria-hidden="true" size={16} />
                  </button>
                  <ConfirmDeleteButton
                    compact
                    label="删除考试"
                    message={`确定删除考试「${exam.name}」吗？相关成绩也会删除。`}
                    formAction={deleteExamAction}
                  />
                </div>
              </form>
            ))}
          </div>
        ) : (
          <div className="empty-state">还没有考试。</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>成绩矩阵</h2>
            <p className="muted">空白表示未参加或未录入；保存后 RKS 自动重新计算。</p>
          </div>
        </div>

        {detail.students.length > 0 && detail.exams.length > 0 ? (
          <form action={saveScoresAction}>
            <input type="hidden" name="classId" value={detail.id} />
            <div className="score-scroll">
              <div className="score-grid" style={{ gridTemplateColumns: gridColumns }}>
                <div className="score-head">学生</div>
                {detail.exams.map((exam) => (
                  <div className="score-head" key={exam.id}>
                    {exam.name}
                    <br />
                    <span className="muted">
                      {formatDate(exam.examDate)} · {formatScore(exam.totalScore)} 分 ·{" "}
                      {exam.constantValue.toFixed(1)}
                    </span>
                  </div>
                ))}

                {detail.students.map((student) => (
                  <div className="score-row-fragment" key={`row-${student.id}`}>
                    <div className="score-student">
                      {student.name}
                      {student.studentNo ? (
                        <span className="muted">{student.studentNo}</span>
                      ) : null}
                    </div>
                    {detail.exams.map((exam) => (
                      <div className="score-cell" key={`${student.id}-${exam.id}`}>
                        <input
                          name={`score_${student.id}_${exam.id}`}
                          type="number"
                          min={0}
                          max={exam.totalScore}
                          step="0.01"
                          defaultValue={
                            scoreMap.has(`${student.id}:${exam.id}`)
                              ? formatScore(scoreMap.get(`${student.id}:${exam.id}`) ?? 0)
                              : ""
                          }
                          aria-label={`${student.name} ${exam.name} 成绩`}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="button-row" style={{ marginTop: 14 }}>
              <button className="primary-button" type="submit">
                <Save aria-hidden="true" size={17} />
                保存全部成绩
              </button>
            </div>
          </form>
        ) : (
          <div className="empty-state">至少需要 1 名学生和 1 次考试才能录入成绩。</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>
              <Trophy aria-hidden="true" size={18} /> RKS 排行
            </h2>
            <p className="muted">按最佳 14 次考试和班级第一加成实时计算。</p>
          </div>
        </div>

        {detail.rankings.length > 0 ? (
          <div className="rank-table">
            {detail.rankings.map((student) => (
              <div className="rank-row" key={student.studentId}>
                <span className="rank-pill">{student.rank}</span>
                <div>
                  <strong>{student.name}</strong>
                  <p className="muted">
                    {student.results.length} 次成绩 · 最佳 {student.bestResults.length} 次
                  </p>
                </div>
                <strong>{formatRks(student.rks)}</strong>
                <span className="muted">
                  第一加成{" "}
                  {student.firstBonus ? formatRks(student.firstBonus.examRks) : "0.000"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">暂无学生。</div>
        )}
      </section>
    </main>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
