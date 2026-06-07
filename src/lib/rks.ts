export type StudentRow = {
  id: number;
  name: string;
  studentNo: string;
  notes: string;
};

export type ExamRow = {
  id: number;
  name: string;
  examDate: string;
  totalScore: number;
  constantValue: number;
};

export type ScoreRow = {
  studentId: number;
  examId: number;
  score: number;
};

export type ExamResult = {
  examId: number;
  examName: string;
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
  bestResults: ExamResult[];
  firstBonus: ExamResult | null;
  results: ExamResult[];
};

export function calculateExamRks(
  score: number,
  totalScore: number,
  constantValue: number
) {
  if (totalScore <= 0) {
    return 0;
  }

  return (score / totalScore) * constantValue;
}

export function calculateClassRks(
  students: StudentRow[],
  exams: ExamRow[],
  scores: ScoreRow[]
) {
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
      exam.constantValue
    );

    const result: ExamResult = {
      examId: exam.id,
      examName: exam.name,
      examDate: exam.examDate,
      score: item.score,
      totalScore: exam.totalScore,
      constantValue: exam.constantValue,
      examRks,
      isClassFirst: item.score === maxScoreByExam.get(item.examId)
    };

    const previous = resultsByStudent.get(item.studentId) ?? [];
    previous.push(result);
    resultsByStudent.set(item.studentId, previous);
  }

  const ranked = students.map((student) => {
    const results = [...(resultsByStudent.get(student.id) ?? [])].sort(
      sortResultByDateDesc
    );

    const bestResults = [...results]
      .sort((a, b) => b.examRks - a.examRks || sortResultByDateDesc(a, b))
      .slice(0, 14);

    const firstBonus =
      results
        .filter((result) => result.isClassFirst)
        .sort((a, b) => b.examRks - a.examRks || sortResultByDateDesc(a, b))[0] ??
      null;

    const bestSum = bestResults.reduce((sum, result) => sum + result.examRks, 0);
    const firstBonusValue = firstBonus?.examRks ?? 0;

    return {
      studentId: student.id,
      name: student.name,
      studentNo: student.studentNo,
      notes: student.notes,
      rks: (bestSum + firstBonusValue) / 15,
      rank: 0,
      bestResults,
      firstBonus,
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

function sortResultByDateDesc(a: ExamResult, b: ExamResult) {
  return (
    b.examDate.localeCompare(a.examDate) ||
    b.examId - a.examId ||
    b.examRks - a.examRks
  );
}
