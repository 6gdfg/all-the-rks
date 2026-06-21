import type { ExamDifficulty } from "./difficulty";

export type StudentRow = {
  id: number;
  name: string;
  studentNo: string;
  notes: string;
  visibility: StudentVisibility;
  queryCode: string;
};

export type ExamRow = {
  id: number;
  name: string;
  difficulty: ExamDifficulty;
  examDate: string;
  totalScore: number;
  constantValue: number;
};

export type ScoreRow = {
  studentId: number;
  examId: number;
  score: number;
  isManualClassFirst: boolean;
};

export type ExamResult = {
  examId: number;
  examName: string;
  difficulty: ExamDifficulty;
  examDate: string;
  score: number;
  totalScore: number;
  constantValue: number;
  examRks: number;
  isClassFirst: boolean;
};

export type StudentRks = {
  studentId: number;
  name: string;
  studentNo: string;
  notes: string;
  rks: number;
  rank: number;
  isMasked?: boolean;
  rksHistory: RksHistoryPoint[];
  perfectResults: ExamResult[];
  bestResults: ExamResult[];
  firstBonus: ExamResult | null;
  results: ExamResult[];
};

export type RksHistoryPoint = {
  examId: number;
  examName: string;
  examDate: string;
  rks: number;
};

export type RksFormulaMode = "curve" | "linear" | "phigros";
export type StudentVisibility = "public" | "code_only";

export const DEFAULT_RKS_FORMULA_MODE: RksFormulaMode = "curve";
export const DEFAULT_RKS_FORMULA_EXPONENT = 0.8;

export type RksFormulaConfig = {
  perfectCount: number;
  bestCount: number;
  autoClassFirst: boolean;
  formulaMode: RksFormulaMode;
  formulaExponent: number;
};

export function calculateExamRks(
  score: number,
  totalScore: number,
  constantValue: number,
  config: Pick<RksFormulaConfig, "formulaMode" | "formulaExponent"> = {
    formulaMode: DEFAULT_RKS_FORMULA_MODE,
    formulaExponent: DEFAULT_RKS_FORMULA_EXPONENT
  }
) {
  if (totalScore <= 0) {
    return 0;
  }

  const acc = clamp(score / totalScore, 0, 1);
  const mode = normalizeRksFormulaMode(config.formulaMode);
  const exponent = normalizeRksFormulaExponent(config.formulaExponent);

  if (mode === "linear") {
    return acc * constantValue;
  }

  if (mode === "phigros") {
    return ((acc * 100 - 55) / 45) ** 2 * constantValue;
  }

  return acc ** exponent * constantValue;
}

export function calculateClassRks(
  students: StudentRow[],
  exams: ExamRow[],
  scores: ScoreRow[],
  config: RksFormulaConfig = {
    perfectCount: 1,
    bestCount: 14,
    autoClassFirst: true,
    formulaMode: DEFAULT_RKS_FORMULA_MODE,
    formulaExponent: DEFAULT_RKS_FORMULA_EXPONENT
  }
) {
  const perfectCount = Math.max(0, Math.floor(config.perfectCount));
  const bestCount = Math.max(1, Math.floor(config.bestCount));
  const autoClassFirst = config.autoClassFirst;
  const formulaMode = normalizeRksFormulaMode(config.formulaMode);
  const formulaExponent = normalizeRksFormulaExponent(config.formulaExponent);
  const divisor = Math.max(1, perfectCount + bestCount);
  const examsById = new Map(exams.map((exam) => [exam.id, exam]));
  const maxScoreByExam = new Map<number, number>();

  for (const item of scores) {
    const currentMax = maxScoreByExam.get(item.examId);

    if (currentMax === undefined || item.score > currentMax) {
      maxScoreByExam.set(item.examId, item.score);
    }
  }

  const resultsByStudent = new Map<number, ExamResult[]>();

  for (const item of scores) {
    const exam = examsById.get(item.examId);

    if (!exam) {
      continue;
    }

    const examRks = calculateExamRks(
      item.score,
      exam.totalScore,
      exam.constantValue,
      {
        formulaMode,
        formulaExponent
      }
    );

    const result: ExamResult = {
      examId: exam.id,
      examName: exam.name,
      difficulty: exam.difficulty,
      examDate: exam.examDate,
      score: item.score,
      totalScore: exam.totalScore,
      constantValue: exam.constantValue,
      examRks,
      isClassFirst: autoClassFirst
        ? item.score === maxScoreByExam.get(item.examId)
        : item.isManualClassFirst
    };

    const previous = resultsByStudent.get(item.studentId) ?? [];
    previous.push(result);
    resultsByStudent.set(item.studentId, previous);
  }

  const ranked = students.map((student) => {
    const results = [...(resultsByStudent.get(student.id) ?? [])].sort(
      sortResultByDateDesc
    );
    const summary = summarizeResults(results, perfectCount, bestCount);

    const rksHistory = buildRksHistory(results, perfectCount, bestCount);

    return {
      studentId: student.id,
      name: student.name,
      studentNo: student.studentNo,
      notes: student.notes,
      rks: summary.rks,
      rank: 0,
      rksHistory,
      perfectResults: summary.perfectResults,
      bestResults: summary.bestResults,
      firstBonus: summary.perfectResults[0] ?? null,
      results
    } satisfies StudentRks;
  });

  ranked.sort((a, b) => b.rks - a.rks || a.name.localeCompare(b.name, "zh-CN"));

  let previousRks: number | null = null;
  let previousRank = 0;

  ranked.forEach((student, index) => {
    if (previousRks !== null && Math.abs(student.rks - previousRks) < 0.000001) {
      student.rank = previousRank;
    } else {
      student.rank = index + 1;
      previousRank = student.rank;
      previousRks = student.rks;
    }
  });

  return ranked;
}

export function normalizeRksFormulaMode(value: unknown): RksFormulaMode {
  if (value === "linear" || value === "phigros") {
    return value;
  }

  return DEFAULT_RKS_FORMULA_MODE;
}

export function normalizeStudentVisibility(value: unknown): StudentVisibility {
  if (value === "code_only") {
    return "code_only";
  }

  return "public";
}

export function normalizeRksFormulaExponent(value: unknown) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return DEFAULT_RKS_FORMULA_EXPONENT;
  }

  return Math.round(clamp(number, 0.1, 3) * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sortResultByDateDesc(a: ExamResult, b: ExamResult) {
  return (
    b.examDate.localeCompare(a.examDate) ||
    b.examId - a.examId ||
    b.examRks - a.examRks
  );
}

function sortResultByDateAsc(a: ExamResult, b: ExamResult) {
  return (
    a.examDate.localeCompare(b.examDate) ||
    a.examId - b.examId ||
    a.examRks - b.examRks
  );
}

function summarizeResults(
  results: ExamResult[],
  perfectCount: number,
  bestCount: number
) {
  const bestResults = [...results]
    .sort((a, b) => b.examRks - a.examRks || sortResultByDateDesc(a, b))
    .slice(0, bestCount);

  const perfectResults = results
    .filter((result) => result.isClassFirst)
    .sort((a, b) => b.examRks - a.examRks || sortResultByDateDesc(a, b))
    .slice(0, perfectCount);

  const divisor = Math.max(1, perfectCount + bestCount);
  const bestSum = bestResults.reduce((sum, result) => sum + result.examRks, 0);
  const perfectSum = perfectResults.reduce(
    (sum, result) => sum + result.examRks,
    0
  );

  return {
    rks: (bestSum + perfectSum) / divisor,
    bestResults,
    perfectResults
  };
}

function buildRksHistory(
  results: ExamResult[],
  perfectCount: number,
  bestCount: number
) {
  const chronological = [...results].sort(sortResultByDateAsc);
  const history: RksHistoryPoint[] = [];
  const seenResults: ExamResult[] = [];
  let maxRks = 0;

  for (const result of chronological) {
    seenResults.push(result);

    const summary = summarizeResults(seenResults, perfectCount, bestCount);
    maxRks = Math.max(maxRks, summary.rks);

    history.push({
      examId: result.examId,
      examName: result.examName,
      examDate: result.examDate,
      rks: maxRks
    });
  }

  return history;
}
