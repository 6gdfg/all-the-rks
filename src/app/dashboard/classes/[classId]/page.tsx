import {
  ArrowLeft,
  Plus,
  Save,
  Settings,
  Trophy,
  Users
} from "lucide-react";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";

import { AsyncActionForm } from "@/components/AsyncActionForm";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { Notice } from "@/components/Notice";
import { PhigrosScoreCard } from "@/components/PhigrosScoreCard";
import { RksSparkline } from "@/components/RksSparkline";
import {
  deleteClassAction,
  createExamInlineAction,
  createStudentInlineAction,
  examRowInlineAction,
  saveScoresInlineAction,
  studentRowInlineAction,
  updateClassInlineAction,
  updateSettingsInlineAction
} from "@/lib/actions";
import { requireTeacher } from "@/lib/auth";
import { getClassDetailById } from "@/lib/data";
import { EXAM_DIFFICULTIES } from "@/lib/difficulty";
import { formatDate, formatRks, formatScore, normalizeDateInput } from "@/lib/format";
import type { RksFormulaMode } from "@/lib/rks";

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
  const manualFirstByExam = new Map(
    detail.scores
      .filter((score) => score.isManualClassFirst)
      .map((score) => [score.examId, score.studentId])
  );
  const formulaDescription = getFormulaDescription(
    detail.settings.rksFormulaMode,
    detail.settings.rksFormulaExponent
  );

  const gridColumns = `minmax(150px, 1.1fr) repeat(${Math.max(
    detail.exams.length,
    1
  )}, minmax(128px, 1fr))`;

  return (
    <main className="class-layout">
      <div className="button-row">
        <LinkButton variant="secondary" href="/dashboard">
          <ArrowLeft aria-hidden="true" size={17} />
          返回控制台
        </LinkButton>
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

        <AsyncActionForm className="grid-3" action={updateClassInlineAction}>
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
            <Button variant="primary" type="submit">
              <Save aria-hidden="true" size={17} />
              保存班级信息
            </Button>
          </div>
        </AsyncActionForm>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>
              <Settings aria-hidden="true" size={18} /> 展示设置
            </h2>
            <p className="muted">
              {`控制公开展示和 RKS 公式。当前汇总：（p${detail.settings.perfectCount} + b${
                detail.settings.bestCount
              }）/${detail.settings.perfectCount + detail.settings.bestCount}；单次：${formulaDescription}`}
            </p>
          </div>
        </div>
        <AsyncActionForm className="settings-grid" action={updateSettingsInlineAction}>
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
          <label className="switch">
            <input
              name="autoClassFirst"
              type="checkbox"
              defaultChecked={detail.settings.autoClassFirst}
            />
            <span>自动识别每次考试班级第一</span>
          </label>
          <div className="segmented-field">
            <span>学生查询样式</span>
            <div className="segmented-control">
              <label>
                <input
                  name="queryResultStyle"
                  type="radio"
                  value="poster"
                  defaultChecked={detail.settings.queryResultStyle === "poster"}
                />
                <span>海报长图</span>
              </label>
              <label>
                <input
                  name="queryResultStyle"
                  type="radio"
                  value="phigros"
                  defaultChecked={detail.settings.queryResultStyle === "phigros"}
                />
                <span>Phigros 卡片</span>
              </label>
              <label>
                <input
                  name="queryResultStyle"
                  type="radio"
                  value="simple"
                  defaultChecked={detail.settings.queryResultStyle === "simple"}
                />
                <span>简洁列表</span>
              </label>
            </div>
          </div>
          <div className="segmented-field settings-wide formula-mode-field">
            <span>RKS 单次公式</span>
            <div className="segmented-control">
              <label>
                <input
                  name="rksFormulaMode"
                  type="radio"
                  value="curve"
                  defaultChecked={detail.settings.rksFormulaMode === "curve"}
                />
                <span>考试曲线</span>
              </label>
              <label>
                <input
                  name="rksFormulaMode"
                  type="radio"
                  value="linear"
                  defaultChecked={detail.settings.rksFormulaMode === "linear"}
                />
                <span>线性</span>
              </label>
              <label>
                <input
                  name="rksFormulaMode"
                  type="radio"
                  value="phigros"
                  defaultChecked={detail.settings.rksFormulaMode === "phigros"}
                />
                <span>Phigros</span>
              </label>
            </div>
            <div className="formula-description">
              <p className="field-hint" data-formula-mode="curve">
                考试曲线：定数 × 得分率^指数。适合普通考试分数分布，指数越小越照顾中低分，指数越大越强调高分差距。
              </p>
              <p className="field-hint" data-formula-mode="linear">
                线性：定数 × 得分率。最直观、最好解释，分数比例和单次 RKS 完全同步变化。
              </p>
              <p className="field-hint" data-formula-mode="phigros">
                Phigros：按 Phigros 风格曲线计算。高准确率收益明显，低分段会被压得更低，更适合接近满分的场景。
              </p>
            </div>
          </div>
          <label className="field">
            <span>曲线指数</span>
            <input
              name="rksFormulaExponent"
              type="number"
              min={0.1}
              max={3}
              step={0.01}
              defaultValue={detail.settings.rksFormulaExponent}
            />
            <small className="field-hint">默认 0.8；仅“考试曲线”模式使用。</small>
          </label>
          <label className="field">
            <span>p 数量</span>
            <input
              name="perfectCount"
              type="number"
              min={0}
              max={10}
              step={1}
              defaultValue={detail.settings.perfectCount}
            />
          </label>
          <label className="field">
            <span>b 数量</span>
            <input
              name="bestCount"
              type="number"
              min={1}
              max={100}
              step={1}
              defaultValue={detail.settings.bestCount}
            />
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
            <Button variant="primary" type="submit">
              <Save aria-hidden="true" size={17} />
              保存展示设置
            </Button>
          </div>
        </AsyncActionForm>
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

        <AsyncActionForm
          className="student-create-form"
          action={createStudentInlineAction}
          resetOnSuccess
          style={{ marginBottom: 14 }}
        >
          <input type="hidden" name="classId" value={detail.id} />
          <label className="field">
            <span>姓名</span>
            <input name="name" placeholder="张三，李四，王五" required />
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
            <Button variant="primary" type="submit">
              <Plus aria-hidden="true" size={17} />
              加入学生
            </Button>
          </div>
        </AsyncActionForm>
        <p className="muted" style={{ marginBottom: 14 }}>
          多个姓名可用逗号分隔一键添加；批量添加时会忽略学号和备注。
        </p>

        {detail.students.length > 0 ? (
          <div className="table-list">
            <div className="editor-head student-head">
              <span>学号</span>
              <span>姓名</span>
              <span>查询码</span>
              <span>公开方式</span>
              <span>备注</span>
              <span>操作</span>
            </div>
            {detail.students.map((student) => (
              <AsyncActionForm
                className="editor-row student-row"
                action={studentRowInlineAction}
                key={student.id}
              >
                <input type="hidden" name="classId" value={detail.id} />
                <input type="hidden" name="studentId" value={student.id} />
                <input name="studentNo" defaultValue={student.studentNo} />
                <input name="name" defaultValue={student.name} required />
                <input
                  name="queryCode"
                  defaultValue={student.queryCode}
                  maxLength={40}
                  minLength={4}
                  placeholder="留空自动生成"
                />
                <select name="visibility" defaultValue={student.visibility}>
                  <option value="public">公开</option>
                  <option value="code_only">仅查询码</option>
                </select>
                <input name="notes" defaultValue={student.notes} />
                <div className="button-row">
                  <Button
                    aria-label="保存学生"
                    shape="square"
                    type="submit"
                    title="保存学生"
                    variant="secondary"
                  >
                    <Save aria-hidden="true" size={16} />
                  </Button>
                  <ConfirmDeleteButton
                    compact
                    label="删除学生"
                    message={`确定删除学生「${student.name}」吗？相关成绩也会删除。`}
                    name="intent"
                    value="delete"
                  />
                </div>
              </AsyncActionForm>
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
              单次考试 RKS 当前按“{formulaDescription}”计算，定数会按 1 位小数保存。
            </p>
          </div>
        </div>

        <AsyncActionForm
          className="exam-create-form"
          action={createExamInlineAction}
          resetOnSuccess
          style={{ marginBottom: 14 }}
        >
          <input type="hidden" name="classId" value={detail.id} />
          <label className="field">
            <span>考试名称</span>
            <input name="name" placeholder="例如：第一次月考" required />
          </label>
          <label className="field">
            <span>谱面难度</span>
            <select name="difficulty" defaultValue="IN" required>
              {EXAM_DIFFICULTIES.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {difficulty}
                </option>
              ))}
            </select>
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
          <Button variant="primary" type="submit">
            <Plus aria-hidden="true" size={17} />
            创建考试
          </Button>
        </AsyncActionForm>

        {detail.exams.length > 0 ? (
          <div className="table-list">
            <div className="editor-head exam-head">
              <span>名称</span>
              <span>难度</span>
              <span>日期</span>
              <span>总分</span>
              <span>定数</span>
              <span>操作</span>
            </div>
            {detail.exams.map((exam) => (
              <AsyncActionForm
                className="editor-row exam-row"
                action={examRowInlineAction}
                key={exam.id}
              >
                <input type="hidden" name="classId" value={detail.id} />
                <input type="hidden" name="examId" value={exam.id} />
                <input name="name" defaultValue={exam.name} required />
                <select name="difficulty" defaultValue={exam.difficulty} required>
                  {EXAM_DIFFICULTIES.map((difficulty) => (
                    <option key={difficulty} value={difficulty}>
                      {difficulty}
                    </option>
                  ))}
                </select>
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
                  <Button
                    aria-label="保存考试"
                    shape="square"
                    type="submit"
                    title="保存考试"
                    variant="secondary"
                  >
                    <Save aria-hidden="true" size={16} />
                  </Button>
                  <ConfirmDeleteButton
                    compact
                    label="删除考试"
                    message={`确定删除考试「${exam.name}」吗？相关成绩也会删除。`}
                    name="intent"
                    value="delete"
                  />
                </div>
              </AsyncActionForm>
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
            <p className="muted">
              {detail.settings.autoClassFirst
                ? "空白表示未参加或未录入；系统会自动把每次考试最高分识别为 p。"
                : "空白表示未参加或未录入；每次考试可手动选择一个 p。"}
            </p>
          </div>
        </div>

        {detail.students.length > 0 && detail.exams.length > 0 ? (
          <AsyncActionForm action={saveScoresInlineAction}>
            <input type="hidden" name="classId" value={detail.id} />
            <div className="score-scroll">
              <div className="score-grid" style={{ gridTemplateColumns: gridColumns }}>
                <div className="score-head">学生</div>
                {detail.exams.map((exam) => (
                  <div className="score-head" key={exam.id}>
                    <span className="exam-head-title">
                      <span className={`difficulty-pill difficulty-${exam.difficulty.toLowerCase()}`}>
                        {exam.difficulty}
                      </span>
                      {exam.name}
                    </span>
                    <br />
                    <span className="muted">
                      {formatDate(exam.examDate)} · {formatScore(exam.totalScore)} 分 ·{" "}
                      {exam.constantValue.toFixed(1)}
                    </span>
                    {!detail.settings.autoClassFirst ? (
                      <label className="manual-first-none">
                        <input
                          type="radio"
                          name={`manualFirst_${exam.id}`}
                          value=""
                          defaultChecked={!manualFirstByExam.has(exam.id)}
                        />
                        无 p
                      </label>
                    ) : null}
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
                        <div className="score-entry">
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
                            aria-label={`${student.name} ${exam.difficulty} ${exam.name} 成绩`}
                          />
                          {!detail.settings.autoClassFirst ? (
                            <label className="manual-first-option">
                              <input
                                type="radio"
                                name={`manualFirst_${exam.id}`}
                                value={student.id}
                                defaultChecked={
                                  manualFirstByExam.get(exam.id) === student.id
                                }
                              />
                              p
                            </label>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="button-row" style={{ marginTop: 14 }}>
              <Button variant="primary" type="submit">
                <Save aria-hidden="true" size={17} />
                保存全部成绩
              </Button>
            </div>
          </AsyncActionForm>
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
            <p className="muted">
              按 p{detail.settings.perfectCount} 和最佳 {detail.settings.bestCount}{" "}
              次考试实时计算。
            </p>
          </div>
        </div>

        {detail.rankings.length > 0 ? (
          <div className="rank-table">
            {detail.rankings.map((student) => (
              <details className="rank-card" key={student.studentId}>
                <summary className="rank-row">
                  <span className="rank-pill">{student.rank}</span>
                  <div>
                    <strong>{student.name}</strong>
                    <p className="muted">
                      {student.results.length} 次成绩 · p{student.perfectResults.length} +
                      b{student.bestResults.length}
                    </p>
                  </div>
                  <div className="rank-rks-cell">
                    <strong className="rank-score">{formatRks(student.rks)}</strong>
                    <RksSparkline points={student.rksHistory} />
                  </div>
                  <span className="muted">点击展开</span>
                </summary>
                <div className="rank-detail">
                  {student.results.length > 0 ? (
                    <div className="phigros-score-list rank-score-list">
                      {student.perfectResults.map((item, index) => (
                        <PhigrosScoreCard
                          key={`p${index + 1}-${item.examId}`}
                          label={`p${index + 1}`}
                          examName={item.examName}
                          difficulty={item.difficulty}
                          examDate={item.examDate}
                          score={item.score}
                          totalScore={item.totalScore}
                          examRks={item.examRks}
                          constantValue={item.constantValue}
                          isClassFirst={item.isClassFirst}
                          className="phigros-p1-card"
                        />
                      ))}
                      {student.bestResults.map((item, index) => (
                        <PhigrosScoreCard
                          key={`b${index + 1}-${item.examId}`}
                          label={`b${index + 1}`}
                          examName={item.examName}
                          difficulty={item.difficulty}
                          examDate={item.examDate}
                          score={item.score}
                          totalScore={item.totalScore}
                          examRks={item.examRks}
                          constantValue={item.constantValue}
                          isClassFirst={item.isClassFirst}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="muted">还没有录入考试成绩。</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="empty-state">暂无学生。</div>
        )}
      </section>
    </main>
  );
}

function getFormulaDescription(mode: RksFormulaMode, exponent: number) {
  if (mode === "linear") {
    return "定数 × 得分率";
  }

  if (mode === "phigros") {
    return "定数 × ((得分率 × 100 - 55) / 45)²";
  }

  return `定数 × 得分率^${exponent.toFixed(2)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
