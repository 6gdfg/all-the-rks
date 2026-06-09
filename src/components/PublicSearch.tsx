"use client";

import dynamic from "next/dynamic";
import { Search } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";

import { PhigrosScoreCard } from "@/components/PhigrosScoreCard";
import { RksSparkline } from "@/components/RksSparkline";
import { formatDate, formatRks, formatScore } from "@/lib/format";
import type { PublicHomeData } from "@/lib/data";

const RksPoster = dynamic(
  () => import("@/components/RksPoster").then((module) => module.RksPoster),
  {
    ssr: false,
    loading: () => <div className="empty-state">海报载入中...</div>
  }
);

type PublicSearchProps = {
  initialData: PublicHomeData;
  initialQuery: string;
  initialSubjects: string[];
};

export function PublicSearch({
  initialData,
  initialQuery,
  initialSubjects
}: PublicSearchProps) {
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [selectedSubjects, setSelectedSubjects] = useState(initialSubjects);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function runSearch(
    nextQuery = query,
    nextSubjects = selectedSubjects,
    historyMode: "push" | "replace" = "push"
  ) {
    abortRef.current?.abort();

    const controller = new AbortController();
    const params = buildSearchParams(nextQuery, nextSubjects);
    const startedAt = performance.now();

    abortRef.current = controller;
    setIsLoading(true);
    setStatusText(null);
    setActiveQuery(nextQuery);
    setData((currentData) => ({
      ...currentData,
      results: nextQuery.trim() ? [] : currentData.results
    }));

    try {
      const response = await fetch(`/api/public-search?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error("查询失败");
      }

      const nextData = (await response.json()) as PublicHomeData;
      const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(2);

      setData((currentData) => ({
        ...nextData,
        leaderboards: currentData.leaderboards
      }));
      setActiveQuery(nextQuery);
      setSelectedSubjects(nextSubjects);
      setStatusText(`查询完成 · ${elapsedSeconds}s`);
      updateBrowserUrl(params, historyMode);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setStatusText("查询失败，请稍后再试。");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsLoading(false);
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch(query, selectedSubjects);
  }

  function toggleSubject(subject: string) {
    const nextSubjects = selectedSubjects.includes(subject)
      ? selectedSubjects.filter((item) => item !== subject)
      : [...selectedSubjects, subject];

    setSelectedSubjects(nextSubjects);

    if (query.trim()) {
      void runSearch(query, nextSubjects);
    } else {
      updateBrowserUrl(buildSearchParams(query, nextSubjects), "push");
    }
  }

  function clearSubjects() {
    setSelectedSubjects([]);

    if (query.trim()) {
      void runSearch(query, []);
    } else {
      updateBrowserUrl(buildSearchParams(query, []), "push");
    }
  }

  useEffect(() => {
    function handlePopState() {
      const params = new URLSearchParams(window.location.search);
      const nextQuery = params.get("q") ?? "";
      const nextSubjects = normalizeSelectedSubjects(params.getAll("subject"));

      setQuery(nextQuery);
      setActiveQuery(nextQuery);
      setSelectedSubjects(nextSubjects);
      void runSearch(nextQuery, nextSubjects, "replace");
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDraftDifferent = query.trim() !== activeQuery.trim();
  const hasQuery = activeQuery.trim().length > 0 && !isDraftDifferent;

  return (
    <>
      <section className="search-panel">
        <form className="search-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>学生姓名</span>
            <input
              name="q"
              value={query}
              placeholder="例如：张三"
              autoComplete="name"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <Button className="search-submit" variant="primary" type="submit">
            <Search aria-hidden="true" size={17} />
            {isLoading ? "查询中" : "查询 RKS"}
          </Button>
          {data.subjectOptions.length > 0 ? (
            <fieldset className="subject-filter">
              <legend>查询学科</legend>
              <div className="subject-options">
                <button
                  aria-pressed={selectedSubjects.length === 0}
                  className="subject-chip-button"
                  data-selected={selectedSubjects.length === 0}
                  type="button"
                  onClick={clearSubjects}
                >
                  全部
                </button>
                {data.subjectOptions.map((option) => (
                  <button
                    aria-pressed={selectedSubjects.includes(option.subject)}
                    className="subject-chip-button"
                    data-selected={selectedSubjects.includes(option.subject)}
                    key={option.subject}
                    type="button"
                    onClick={() => toggleSubject(option.subject)}
                  >
                    {option.subject}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
        </form>
      </section>

      {hasQuery && data.databaseReady ? (
        <section className="section-stack">
          <div className="panel-header">
            <div>
              <h2>查询结果</h2>
              <p className="muted">
                {selectedSubjects.length > 0
                  ? `已筛选：${selectedSubjects.join("、")}`
                  : "同名学生会按班级和学科分别显示。"}
              </p>
            </div>
            {statusText ? <span className="query-status">{statusText}</span> : null}
          </div>

          {data.results.length > 0 ? (
            <div className="results-grid">
              {data.results.map((result) => (
                <SearchResultCard
                  key={`${result.classId}-${result.student.studentId}`}
                  result={result}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              {isLoading ? "正在查询..." : "没有找到有成绩数据的公开查询结果。"}
            </div>
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
    </>
  );
}

type SearchResult = PublicHomeData["results"][number];

function SearchResultCard({ result }: { result: SearchResult }) {
  return (
    <article className="result-card">
      <div className="result-top">
        <div>
          <h2>{result.student.name}</h2>
          <p className="muted">
            {result.className} · {result.subject}
          </p>
        </div>
        <div className="rks-summary">
          <div className="rks-number">{formatRks(result.student.rks)}</div>
          <RksSparkline points={result.student.rksHistory} />
        </div>
      </div>

      <div className="badge-row">
        {result.settings.showStudentRank ? (
          <Badge variant="outline">
            班级第 {result.student.rank} / {result.totalStudents}
          </Badge>
        ) : null}
        <Badge variant="outline">已录入 {result.student.results.length} 次考试</Badge>
        <Badge variant="outline">
          {`（p${result.settings.perfectCount} + b${
            result.settings.bestCount
          }）/${result.settings.perfectCount + result.settings.bestCount}`}
        </Badge>
      </div>

      {result.settings.showExamScores ? (
        <div className="score-detail">
          {result.settings.queryResultStyle === "poster" ? (
            <DeferredPoster result={result} />
          ) : result.settings.queryResultStyle === "simple" ? (
            <SimpleScoreDetail student={result.student} />
          ) : (
            <PhigrosScoreDetail student={result.student} />
          )}
        </div>
      ) : null}
    </article>
  );
}

function DeferredPoster({ result }: { result: SearchResult }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <div className="poster-placeholder">
        <div>
          <strong>海报模式</strong>
          <span>{result.student.results.length} 次考试</span>
        </div>
        <Button variant="primary" type="button" onClick={() => setIsOpen(true)}>
          展开海报
        </Button>
      </div>
    );
  }

  return (
    <RksPoster
      classNameText={result.className}
      subject={result.subject}
      student={result.student}
      showRank={result.settings.showStudentRank}
      totalStudents={result.totalStudents}
      perfectCount={result.settings.perfectCount}
      bestCount={result.settings.bestCount}
    />
  );
}

type StudentResultProps = {
  student: PublicHomeData["results"][number]["student"];
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
  item: PublicHomeData["results"][number]["student"]["results"][number];
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
        {formatScore(item.score)}/{formatScore(item.totalScore)} ·{" "}
        {formatRks(item.examRks)}
      </strong>
    </div>
  );
}

function buildSearchParams(query: string, subjects: string[]) {
  const params = new URLSearchParams();
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    params.set("q", trimmedQuery);
  }

  for (const subject of normalizeSelectedSubjects(subjects)) {
    params.append("subject", subject);
  }

  return params;
}

function updateBrowserUrl(
  params: URLSearchParams,
  historyMode: "push" | "replace"
) {
  const nextUrl = params.toString() ? `/?${params.toString()}` : "/";

  if (window.location.pathname + window.location.search === nextUrl) {
    return;
  }

  window.history[historyMode === "replace" ? "replaceState" : "pushState"](
    null,
    "",
    nextUrl
  );
}

function normalizeSelectedSubjects(value: string | string[]) {
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  const subjects: string[] = [];

  for (const item of values) {
    const subject = item.trim().slice(0, 40);

    if (!subject || seen.has(subject)) {
      continue;
    }

    seen.add(subject);
    subjects.push(subject);
  }

  return subjects;
}
