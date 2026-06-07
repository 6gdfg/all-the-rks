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
  isClassFirst = false
}: PhigrosScoreCardProps) {
  const percent = getScorePercent(score, totalScore);
  const grade = getScoreGrade(score, totalScore);

  return (
    <article className={`phigros-score-card grade-${grade.key}`}>
      <div className="phigros-slot">{label}</div>
      <div className="phigros-card-content">
        <div className="phigros-card-top">
          <h3>
            <span className={`difficulty-pill difficulty-${difficulty.toLowerCase()}`}>
              {difficulty}
            </span>
            <span className="phigros-exam-name">{examName}</span>
          </h3>
          <span>{formatDate(examDate)}</span>
        </div>
        <div className="phigros-card-mid">
          <span
            className={`phigros-grade grade-mark-${grade.key}`}
            aria-label={grade.name}
          >
            {grade.label}
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
          {constantValue !== undefined ? (
            <span>定数 {constantValue.toFixed(1)}</span>
          ) : null}
          <span>RKS {formatRks(examRks)}</span>
          {isClassFirst ? <span>班级第一</span> : null}
        </div>
      </div>
    </article>
  );
}
