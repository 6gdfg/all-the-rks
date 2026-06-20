import { formatDate, formatRks, formatScore } from "@/lib/format";
import { formatPercent, getScoreGrade, getScorePercent } from "@/lib/grade";
import type { ExamDifficulty } from "@/lib/difficulty";

type PhigrosScoreCardProps = {
  label: string;
  examName: string;
  difficulty: ExamDifficulty;
  examDate: string;
  score: number;
  totalScore: number;
  examRks: number;
  constantValue?: number;
  isClassFirst?: boolean;
  className?: string;
};

export function PhigrosScoreCard({
  label,
  examName,
  difficulty,
  examDate,
  score,
  totalScore,
  examRks,
  constantValue,
  isClassFirst = false,
  className
}: PhigrosScoreCardProps) {
  const percent = getScorePercent(score, totalScore);
  const grade = getScoreGrade(score, totalScore);
  const rksLine =
    constantValue !== undefined
      ? `${constantValue.toFixed(1)} → ${formatRks(examRks)}`
      : `→ ${formatRks(examRks)}`;

  return (
    <article className={`phigros-score-card grade-${grade.key}${className ? ` ${className}` : ""}`}>
      <div className="phigros-slot">{label}</div>
      <div className="phigros-card-content">
        <div className="phigros-card-top">
          <h3>{examName}</h3>
          <span>{formatDate(examDate)}</span>
        </div>
        <div className="phigros-card-mid">
          <span
            className={`phigros-grade grade-mark-${grade.key}`}
            aria-label={grade.name}
          >
            {grade.key === "phi" ? "φ" : grade.label}
          </span>
          <div className="phigros-score-block">
            <strong>
              {formatScore(score)}
              <span> / {formatScore(totalScore)}</span>
            </strong>
            <div className="phigros-score-line" />
            <span>{formatPercent(percent)}</span>
          </div>
        </div>
        <div className="phigros-card-bottom">
          <span>
            <span className={`difficulty-text difficulty-${difficulty.toLowerCase()}`}>
              {difficulty}
            </span>{" "}
            {rksLine}
          </span>
          {isClassFirst ? <span>班级第一</span> : null}
        </div>
      </div>
    </article>
  );
}
