export const EXAM_DIFFICULTIES = ["EZ", "HD", "IN", "AT"] as const;

export type ExamDifficulty = (typeof EXAM_DIFFICULTIES)[number];

export function normalizeExamDifficulty(value: string): ExamDifficulty {
  if (EXAM_DIFFICULTIES.includes(value as ExamDifficulty)) {
    return value as ExamDifficulty;
  }

  return "IN";
}
