import { Search } from "lucide-react";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";

import { DatabaseSetup } from "@/components/DatabaseSetup";
import { PhigrosScoreCard } from "@/components/PhigrosScoreCard";
import { RksPoster } from "@/components/RksPoster";
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
          <p className="eyebrow">All The RKS</p>
          <h1>输入姓名，查看你的 RKS(Ranking Score)。</h1>
          <p>
            rks仅供娱乐。
          </p>
        </div>
        <div className="stat-band" aria-label="RKS 计算规则">
          <div className="stat-item">
            <span className="stat-value">14</span>
            <span className="muted">最佳考试计入</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">+1</span>
            <span className="muted">默认 p1 冠军位</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">/15</span>
            <span className="muted">默认平均分母</span>
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
          <Button variant="primary" type="submit">
            <Search aria-hidden="true" size={17} />
            查询 RKS
          </Button>
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
                  className={
                    result.settings.queryResultStyle === "poster"
                      ? "result-card poster-result-card"
                      : "result-card"
                  }
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
                      <Badge variant="outline">
                        班级第 {result.student.rank} / {result.totalStudents}
                      </Badge>
                    ) : null}
                    <Badge variant="outline">
                      已录入 {result.student.results.length} 次考试
                    </Badge>
                    <Badge variant="outline">
                      {`（p${result.settings.perfectCount} + b${
                        result.settings.bestCount
                      }）/${result.settings.perfectCount + result.settings.bestCount}`}
                    </Badge>
                  </div>

                  {result.settings.showExamScores ? (
                    <>
                      {result.settings.queryResultStyle === "poster" ? (
                        <RksPoster
                          classNameText={result.className}
                          subject={result.subject}
                          student={result.student}
                          showRank={result.settings.showStudentRank}
                          totalStudents={result.totalStudents}
                          perfectCount={result.settings.perfectCount}
                          bestCount={result.settings.bestCount}
                        />
                      ) : (
                        <div className="score-detail">
                          {result.settings.queryResultStyle === "simple" ? (
                            <SimpleScoreDetail student={result.student} />
                          ) : (
                            <PhigrosScoreDetail student={result.student} />
                          )}
                        </div>
                      )}
                    </>
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

type StudentResultProps = {
  student: Awaited<ReturnType<typeof getPublicHomeData>>["results"][number]["student"];
};

function PhigrosScoreDetail({ student }: StudentResultProps) {
  if (student.results.length === 0) {
    return <p className="muted">还没有录入考试成绩。</p>;
  }

  return (
    <div className="phigros-score-list">
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
  );
}

function SimpleScoreDetail({ student }: StudentResultProps) {
  if (student.results.length === 0) {
    return <p className="muted">还没有录入考试成绩。</p>;
  }

  return (
    <div className="mini-table">
      {student.perfectResults.map((item, index) => (
        <SimpleScoreRow
          label={`p${index + 1}`}
          item={item}
          key={`p${index + 1}-${item.examId}`}
        />
      ))}
      {student.bestResults.map((item, index) => (
        <SimpleScoreRow item={item} label={`b${index + 1}`} key={item.examId} />
      ))}
    </div>
  );
}

function SimpleScoreRow({
  item,
  label
}: {
  item: Awaited<
    ReturnType<typeof getPublicHomeData>
  >["results"][number]["student"]["results"][number];
  label: string;
}) {
  return (
    <div className="mini-row detail-rks-row">
      <span className="detail-rks-main">
        <strong className={label.startsWith("p") ? "rks-label p1-label" : "rks-label"}>
          {label}
        </strong>
        <span>
          {item.difficulty} · {formatDate(item.examDate)} · {item.examName}
        </span>
      </span>
      <strong>
        {formatScore(item.score)}/{formatScore(item.totalScore)} · {formatRks(item.examRks)}
      </strong>
    </div>
  );
}
