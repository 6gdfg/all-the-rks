import { Search, Trophy } from "lucide-react";

import { DatabaseSetup } from "@/components/DatabaseSetup";
import { formatDate, formatRks, formatScore } from "@/lib/format";
import { getPublicHomeData } from "@/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HomeProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = (await searchParams) ?? {};
  const query = params.q ?? "";
  const data = await getPublicHomeData(query);

  return (
    <main>
      <section className="page-hero">
        <div className="hero-copy">
          <p className="eyebrow">学科实力 RKS 查询</p>
          <h1>输入姓名，查看你的班级考试 RKS。</h1>
          <p>
            系统会按每次考试分数、总分和老师设置的定数自动计算单次 RKS，
            再汇总最佳 14 次考试与班级第一加成。
          </p>
        </div>
        <div className="stat-band" aria-label="RKS 计算规则">
          <div className="stat-item">
            <span className="stat-value">14</span>
            <span className="muted">最佳考试计入</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">+1</span>
            <span className="muted">班级第一加成位</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">/15</span>
            <span className="muted">固定平均分母</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">0.1</span>
            <span className="muted">考试定数精度</span>
          </div>
        </div>
      </section>

      {!data.databaseReady ? <DatabaseSetup /> : null}

      <section className="search-panel">
        <form className="search-form" action="/">
          <label className="field">
            <span>学生姓名</span>
            <input
              name="q"
              defaultValue={query}
              placeholder="例如：张三"
              autoComplete="name"
            />
          </label>
          <button className="primary-button" type="submit">
            <Search aria-hidden="true" size={17} />
            查询 RKS
          </button>
        </form>
      </section>

      {query && data.databaseReady ? (
        <section className="section-stack">
          <div className="panel-header">
            <div>
              <h2>查询结果</h2>
              <p className="muted">同名学生会按班级分别显示。</p>
            </div>
          </div>

          {data.results.length > 0 ? (
            <div className="results-grid">
              {data.results.map((result) => (
                <article
                  className="result-card"
                  key={`${result.classId}-${result.student.studentId}`}
                >
                  <div className="result-top">
                    <div>
                      <h2>{result.student.name}</h2>
                      <p className="muted">
                        {result.className} · {result.subject}
                      </p>
                    </div>
                    <div className="rks-number">{formatRks(result.student.rks)}</div>
                  </div>

                  <div className="badge-row">
                    {result.settings.showStudentRank ? (
                      <span className="badge">
                        班级第 {result.student.rank} / {result.totalStudents}
                      </span>
                    ) : null}
                    <span className="badge">
                      已录入 {result.student.results.length} 次考试
                    </span>
                    {result.student.firstBonus ? (
                      <span className="badge badge-gold">
                        <Trophy aria-hidden="true" size={14} />
                        第一加成 {formatRks(result.student.firstBonus.examRks)}
                      </span>
                    ) : (
                      <span className="badge">第一加成 0.000</span>
                    )}
                  </div>

                  {result.settings.showExamScores ? (
                    <div className="score-detail">
                      <div className="mini-table">
                        {result.student.results.length > 0 ? (
                          result.student.results.map((item) => (
                            <div className="mini-row" key={item.examId}>
                              <span>
                                {formatDate(item.examDate)} · {item.examName}
                                {item.isClassFirst ? " · 班级第一" : ""}
                              </span>
                              <strong>
                                {formatScore(item.score)}/{formatScore(item.totalScore)} ·{" "}
                                {formatRks(item.examRks)}
                              </strong>
                            </div>
                          ))
                        ) : (
                          <p className="muted">还没有录入考试成绩。</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">没有找到可公开查询的同名学生。</div>
          )}
        </section>
      ) : null}

      {data.databaseReady && data.leaderboards.length > 0 ? (
        <section className="section-stack" style={{ marginTop: 22 }}>
          <div className="panel-header">
            <div>
              <h2>班级 RKS 排行榜</h2>
              <p className="muted">只展示老师开启了首页排行榜的班级。</p>
            </div>
          </div>
          <div className="leaderboard-grid">
            {data.leaderboards.map((board) => (
              <article className="leaderboard-card" key={board.classId}>
                <div className="panel-header">
                  <div>
                    <h3>{board.className}</h3>
                    <p className="muted">
                      {board.subject} · 前 {board.limit}
                    </p>
                  </div>
                </div>

                <div className="leaderboard-list">
                  {board.students.length > 0 ? (
                    board.students.map((student) => (
                      <div className="leaderboard-row" key={student.studentId}>
                        <span className="rank-pill">{student.rank}</span>
                        <span>{student.name}</span>
                        <strong>{formatRks(student.rks)}</strong>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">暂无成绩。</div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
