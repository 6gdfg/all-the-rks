"use client";

import { Download } from "lucide-react";
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Button } from "@cloudflare/kumo/components/button";

import { PhigrosScoreCard } from "@/components/PhigrosScoreCard";
import { RksSparkline } from "@/components/RksSparkline";
import { formatRks } from "@/lib/format";
import type { StudentRks } from "@/lib/rks";

type RksPosterProps = {
  classNameText: string;
  subject: string;
  student: StudentRks;
  showRank: boolean;
  totalStudents: number;
  perfectCount: number;
  bestCount: number;
};

export function RksPoster({
  classNameText,
  subject,
  student,
  showRank,
  totalStudents,
  perfectCount,
  bestCount
}: RksPosterProps) {
  const posterRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function savePoster() {
    const node = posterRef.current;

    if (!node || isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      await document.fonts?.ready;
      const dataUrl = await toPng(node, {
        backgroundColor: "#ffffff",
        cacheBust: true,
        pixelRatio: 2
      });
      const link = document.createElement("a");
      link.download = `${student.name}-RKS-${formatRks(student.rks)}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="poster-shell">
      <div className="button-row poster-actions">
        <Button variant="primary" type="button" onClick={savePoster}>
          <Download aria-hidden="true" size={17} />
          {isSaving ? "生成中" : "保存长图"}
        </Button>
      </div>
      <div className="poster-scroll">
        <div className="rks-poster" ref={posterRef}>
          <header className="poster-header">
            <div>
              <p className="poster-eyebrow">ALL THE RKS SCORE BOARD</p>
              <h2>{student.name}</h2>
              <p>
                {classNameText} · {subject}
              </p>
            </div>
            <div className="poster-rks-block">
              <span>RKS</span>
              <strong>{formatRks(student.rks)}</strong>
              <RksSparkline className="poster-sparkline" points={student.rksHistory} />
              {showRank ? (
                <small>
                  #{student.rank} / {totalStudents}
                </small>
              ) : null}
            </div>
          </header>

          <div className="poster-stat-row">
            <div>
              <span>成绩</span>
              <strong>{student.results.length}</strong>
            </div>
            <div>
              <span>p{perfectCount}</span>
              <strong>{student.perfectResults.length}</strong>
            </div>
            <div>
              <span>b{bestCount}</span>
              <strong>{student.bestResults.length}</strong>
            </div>
          </div>

          <div className="poster-divider">
            <span>P{perfectCount} + BEST {bestCount}</span>
          </div>

          <div className="poster-score-grid">
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
                key={`${index}-${item.examId}`}
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

          <footer className="poster-footer">
            <span>All The RKS</span>
            <span>Inspired by Phigros</span>
          </footer>
        </div>
      </div>
    </section>
  );
}
