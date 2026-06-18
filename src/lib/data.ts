import "server-only";

import { notFound } from "next/navigation";

import { ensureSchema, getSql, hasDatabaseUrl } from "./db";
import { normalizeExamDifficulty } from "./difficulty";
import {
  calculateClassRks,
  DEFAULT_RKS_FORMULA_EXPONENT,
  DEFAULT_RKS_FORMULA_MODE,
  normalizeRksFormulaExponent,
  normalizeRksFormulaMode,
  type ExamRow,
  type RksFormulaMode,
  type ScoreRow,
  type StudentRks,
  type StudentRow
} from "./rks";

export type ClassSettings = {
  showHomeLeaderboard: boolean;
  showStudentRank: boolean;
  showExamScores: boolean;
  publicSearchEnabled: boolean;
  queryResultStyle: QueryResultStyle;
  autoClassFirst: boolean;
  rksFormulaMode: RksFormulaMode;
  rksFormulaExponent: number;
  perfectCount: number;
  bestCount: number;
  leaderboardLimit: number;
};

export type QueryResultStyle = "poster" | "phigros" | "simple";

export type ClassSummary = {
  id: number;
  name: string;
  subject: string;
  createdAt: string;
  studentCount: number;
  examCount: number;
  topRks: number;
  topStudentName: string;
};

export type ClassDetail = {
  id: number;
  name: string;
  subject: string;
  settings: ClassSettings;
  students: StudentRow[];
  exams: ExamRow[];
  scores: ScoreRow[];
  rankings: StudentRks[];
};

export type PublicSearchResult = {
  classId: number;
  className: string;
  subject: string;
  settings: ClassSettings;
  student: StudentRks;
  totalStudents: number;
};

export type PublicLeaderboard = {
  classId: number;
  className: string;
  subject: string;
  limit: number;
  students: StudentRks[];
};

export type PublicSubjectOption = {
  subject: string;
};

export type PublicHomeData = {
  databaseReady: boolean;
  subjectOptions: PublicSubjectOption[];
  leaderboards: PublicLeaderboard[];
  results: PublicSearchResult[];
};

type PublicHomeOptions = {
  includeLeaderboards?: boolean;
};

type ClassRecord = {
  id: number;
  name: string;
  subject: string;
  createdAt: string;
};

type ClassSummaryRecord = ClassRecord & {
  studentCount: number;
  examCount: number;
};

type SettingsRecord = {
  showHomeLeaderboard: boolean;
  showStudentRank: boolean;
  showExamScores: boolean;
  publicSearchEnabled: boolean;
  queryResultStyle: string;
  autoClassFirst: boolean;
  rksFormulaMode: string;
  rksFormulaExponent: number;
  perfectCount: number;
  bestCount: number;
  leaderboardLimit: number;
};

export async function getTeacherDashboard(teacherId: number) {
  if (!hasDatabaseUrl()) {
    return {
      databaseReady: false,
      classes: [] as ClassSummary[]
    };
  }

  await ensureSchema();

  const sql = getSql();
  const rows = await sql<ClassSummaryRecord[]>`
    SELECT
      classes.id,
      classes.name,
      classes.subject,
      classes.created_at::TEXT AS "createdAt",
      COUNT(DISTINCT students.id)::INTEGER AS "studentCount",
      COUNT(DISTINCT exams.id)::INTEGER AS "examCount"
    FROM classes
    LEFT JOIN students ON students.class_id = classes.id
    LEFT JOIN exams ON exams.class_id = classes.id
    WHERE classes.teacher_id = ${teacherId}
    GROUP BY classes.id
    ORDER BY classes.created_at DESC, classes.id DESC
  `;

  const classes = await Promise.all(
    rows.map(async (row) => {
      const detail = await getClassDetailById(teacherId, Number(row.id));
      const topStudent = detail.rankings[0];

      return {
        id: Number(row.id),
        name: row.name,
        subject: row.subject,
        createdAt: row.createdAt,
        studentCount: detail.students.length,
        examCount: Number(row.examCount),
        topRks: topStudent?.rks ?? 0,
        topStudentName: topStudent?.name ?? ""
      };
    })
  );

  return {
    databaseReady: true,
    classes
  };
}

export async function getClassDetailById(teacherId: number, classId: number) {
  if (!hasDatabaseUrl()) {
    notFound();
  }

  await ensureSchema();

  const sql = getSql();
  const classRows = await sql<ClassRecord[]>`
    SELECT
      id,
      name,
      subject,
      created_at::TEXT AS "createdAt"
    FROM classes
    WHERE id = ${classId}
      AND teacher_id = ${teacherId}
    LIMIT 1
  `;

  const classRow = classRows[0];

  if (!classRow) {
    notFound();
  }

  const sharedClassIds = await getSharedClassIdsByName(classRow.name);
  const settings = await getClassSettings(classId);
  const students = await getStudents(sharedClassIds);
  const exams = await getExams(classId);
  const scores = await getScores(classId, sharedClassIds);
  const rankings = calculateClassRks(students, exams, scores, {
    perfectCount: settings.perfectCount,
    bestCount: settings.bestCount,
    autoClassFirst: settings.autoClassFirst,
    formulaMode: settings.rksFormulaMode,
    formulaExponent: settings.rksFormulaExponent
  });

  return {
    id: Number(classRow.id),
    name: classRow.name,
    subject: classRow.subject,
    settings,
    students,
    exams,
    scores,
    rankings
  } satisfies ClassDetail;
}

export async function getPublicHomeData(
  query: string,
  subjects: string[] = [],
  options: PublicHomeOptions = {}
): Promise<PublicHomeData> {
  if (!hasDatabaseUrl()) {
    return {
      databaseReady: false,
      subjectOptions: [] as PublicSubjectOption[],
      leaderboards: [] as PublicLeaderboard[],
      results: [] as PublicSearchResult[]
    };
  }

  await ensureSchema();

  const sql = getSql();
  const selectedSubjects = normalizeSubjectFilters(subjects);
  const subjectRows = await sql<PublicSubjectOption[]>`
    SELECT DISTINCT classes.subject
    FROM classes
    ORDER BY classes.subject ASC
  `;
  const leaderboards =
    options.includeLeaderboards === false ? [] : await getPublicLeaderboards();

  const trimmedQuery = query.trim();
  const results: PublicSearchResult[] = [];

  if (trimmedQuery) {
    const pattern = `%${trimmedQuery.toLowerCase()}%`;
    const subjectFilter =
      selectedSubjects.length > 0
        ? sql`AND public_classes.subject IN ${sql(selectedSubjects)}`
        : sql``;
    const matchedRows = await sql<
      {
        studentId: number;
        classId: number;
      }[]
    >`
      SELECT
        students.id AS "studentId",
        public_classes.id AS "classId"
      FROM classes AS public_classes
      INNER JOIN class_settings
        ON class_settings.class_id = public_classes.id
      INNER JOIN classes AS roster_classes
        ON roster_classes.name = public_classes.name
      INNER JOIN students
        ON students.class_id = roster_classes.id
      WHERE class_settings.public_search_enabled = TRUE
        AND LOWER(students.name) LIKE ${pattern}
        ${subjectFilter}
      ORDER BY public_classes.created_at DESC, students.name ASC
      LIMIT 80
    `;

    const classIds = Array.from(new Set(matchedRows.map((row) => row.classId)));
    const bundles = new Map<number, Awaited<ReturnType<typeof getPublicClassBundle>>>();

    for (const classId of classIds) {
      bundles.set(classId, await getPublicClassBundle(Number(classId)));
    }

    const resultsByName = new Map<string, PublicSearchResult>();

    for (const row of matchedRows) {
      const bundle = bundles.get(Number(row.classId));
      const student = bundle?.rankings.find(
        (item) => item.studentId === Number(row.studentId)
      );

      if (!bundle || !student || student.results.length === 0) {
        continue;
      }

      const result = {
        classId: bundle.id,
        className: bundle.name,
        subject: bundle.subject,
        settings: bundle.settings,
        student,
        totalStudents: bundle.rankings.length
      };
      const resultKey = `${bundle.id}:${student.name.trim().toLowerCase()}`;
      const previous = resultsByName.get(resultKey);

      if (!previous || student.rks > previous.student.rks) {
        resultsByName.set(resultKey, result);
      }
    }

    results.push(...resultsByName.values());
  }

  return {
    databaseReady: true,
    subjectOptions: subjectRows.map((row) => ({
      subject: row.subject
    })),
    leaderboards,
    results
  };
}

async function getPublicLeaderboards() {
  const sql = getSql();
  const leaderboardClasses = await sql<(ClassRecord & SettingsRecord)[]>`
    SELECT
      classes.id,
      classes.name,
      classes.subject,
      classes.created_at::TEXT AS "createdAt",
      class_settings.show_home_leaderboard AS "showHomeLeaderboard",
      class_settings.show_student_rank AS "showStudentRank",
      class_settings.show_exam_scores AS "showExamScores",
      class_settings.public_search_enabled AS "publicSearchEnabled",
      class_settings.query_result_style AS "queryResultStyle",
      class_settings.auto_class_first AS "autoClassFirst",
      class_settings.rks_formula_mode AS "rksFormulaMode",
      class_settings.rks_formula_exponent::FLOAT AS "rksFormulaExponent",
      class_settings.perfect_count AS "perfectCount",
      class_settings.best_count AS "bestCount",
      class_settings.leaderboard_limit AS "leaderboardLimit"
    FROM classes
    INNER JOIN class_settings ON class_settings.class_id = classes.id
    WHERE class_settings.show_home_leaderboard = TRUE
    ORDER BY classes.created_at DESC, classes.id DESC
  `;

  return Promise.all(
    leaderboardClasses.map(async (item) => {
      const bundle = await getPublicClassBundle(Number(item.id));
      const limit = Math.max(1, Number(item.leaderboardLimit) || 20);

      return {
        classId: Number(item.id),
        className: item.name,
        subject: item.subject,
        limit,
        students: bundle.rankings.slice(0, limit)
      };
    })
  );
}

export async function assertClassOwner(teacherId: number, classId: number) {
  await ensureSchema();

  const sql = getSql();
  const rows = await sql<{ id: number }[]>`
    SELECT id
    FROM classes
    WHERE id = ${classId}
      AND teacher_id = ${teacherId}
    LIMIT 1
  `;

  if (!rows[0]) {
    notFound();
  }
}

export async function getSharedRosterInfoForOwnedClass(
  teacherId: number,
  classId: number
) {
  await ensureSchema();

  const sql = getSql();
  const rows = await sql<{ name: string }[]>`
    SELECT name
    FROM classes
    WHERE id = ${classId}
      AND teacher_id = ${teacherId}
    LIMIT 1
  `;

  const row = rows[0];

  if (!row) {
    notFound();
  }

  return {
    className: row.name,
    classIds: await getSharedClassIdsByName(row.name)
  };
}

async function getPublicClassBundle(classId: number) {
  const sql = getSql();
  const classRows = await sql<ClassRecord[]>`
    SELECT
      id,
      name,
      subject,
      created_at::TEXT AS "createdAt"
    FROM classes
    WHERE id = ${classId}
    LIMIT 1
  `;

  const classRow = classRows[0];

  if (!classRow) {
    notFound();
  }

  const sharedClassIds = await getSharedClassIdsByName(classRow.name);
  const settings = await getClassSettings(classId);
  const students = await getStudents(sharedClassIds);
  const exams = await getExams(classId);
  const scores = await getScores(classId, sharedClassIds);
  const rankings = calculateClassRks(students, exams, scores, {
    perfectCount: settings.perfectCount,
    bestCount: settings.bestCount,
    autoClassFirst: settings.autoClassFirst,
    formulaMode: settings.rksFormulaMode,
    formulaExponent: settings.rksFormulaExponent
  });

  return {
    id: Number(classRow.id),
    name: classRow.name,
    subject: classRow.subject,
    settings,
    students,
    exams,
    scores,
    rankings
  };
}

async function getClassSettings(classId: number): Promise<ClassSettings> {
  const sql = getSql();
  const rows = await sql<SettingsRecord[]>`
    SELECT
      show_home_leaderboard AS "showHomeLeaderboard",
      show_student_rank AS "showStudentRank",
      show_exam_scores AS "showExamScores",
      public_search_enabled AS "publicSearchEnabled",
      query_result_style AS "queryResultStyle",
      auto_class_first AS "autoClassFirst",
      rks_formula_mode AS "rksFormulaMode",
      rks_formula_exponent::FLOAT AS "rksFormulaExponent",
      perfect_count AS "perfectCount",
      best_count AS "bestCount",
      leaderboard_limit AS "leaderboardLimit"
    FROM class_settings
    WHERE class_id = ${classId}
    LIMIT 1
  `;

  const row = rows[0];

  if (!row) {
    return {
      showHomeLeaderboard: true,
      showStudentRank: true,
      showExamScores: true,
      publicSearchEnabled: true,
      queryResultStyle: "phigros",
      autoClassFirst: true,
      rksFormulaMode: DEFAULT_RKS_FORMULA_MODE,
      rksFormulaExponent: DEFAULT_RKS_FORMULA_EXPONENT,
      perfectCount: 1,
      bestCount: 14,
      leaderboardLimit: 20
    };
  }

  return {
    showHomeLeaderboard: row.showHomeLeaderboard,
    showStudentRank: row.showStudentRank,
    showExamScores: row.showExamScores,
    publicSearchEnabled: row.publicSearchEnabled,
    queryResultStyle: normalizeQueryResultStyle(row.queryResultStyle),
    autoClassFirst: row.autoClassFirst,
    rksFormulaMode: normalizeRksFormulaMode(row.rksFormulaMode),
    rksFormulaExponent: normalizeRksFormulaExponent(row.rksFormulaExponent),
    perfectCount: clampInteger(row.perfectCount, 0, 10, 1),
    bestCount: clampInteger(row.bestCount, 1, 100, 14),
    leaderboardLimit: row.leaderboardLimit
  };
}

function normalizeQueryResultStyle(value: string): QueryResultStyle {
  if (value === "poster" || value === "simple") {
    return value;
  }

  return "phigros";
}

function clampInteger(value: number, min: number, max: number, fallback: number) {
  const number = Math.floor(Number(value));

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(number, min), max);
}

function normalizeSubjectFilters(subjects: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const subject of subjects) {
    const value = subject.trim().slice(0, 40);

    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

async function getSharedClassIdsByName(className: string) {
  const sql = getSql();
  const rows = await sql<{ id: number }[]>`
    SELECT id
    FROM classes
    WHERE name = ${className}
    ORDER BY id ASC
  `;

  return rows.map((row) => Number(row.id));
}

async function getStudents(classIds: number[]) {
  if (classIds.length === 0) {
    return [] as StudentRow[];
  }

  const sql = getSql();
  const rows = await sql<StudentRow[]>`
    SELECT
      id,
      name,
      student_no AS "studentNo",
      notes
    FROM students
    WHERE class_id IN ${sql(classIds)}
    ORDER BY student_no ASC, name ASC, id ASC
  `;

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    studentNo: row.studentNo,
    notes: row.notes
  }));
}

async function getExams(classId: number) {
  const sql = getSql();
  const rows = await sql<ExamRow[]>`
    SELECT
      id,
      name,
      difficulty,
      exam_date::TEXT AS "examDate",
      total_score::FLOAT AS "totalScore",
      constant_value::FLOAT AS "constantValue"
    FROM exams
    WHERE class_id = ${classId}
    ORDER BY exam_date DESC, id DESC
  `;

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    difficulty: normalizeExamDifficulty(row.difficulty),
    examDate: row.examDate,
    totalScore: Number(row.totalScore),
    constantValue: Number(row.constantValue)
  }));
}

async function getScores(classId: number, rosterClassIds: number[]) {
  if (rosterClassIds.length === 0) {
    return [] as ScoreRow[];
  }

  const sql = getSql();
  const rows = await sql<ScoreRow[]>`
    SELECT
      scores.student_id AS "studentId",
      scores.exam_id AS "examId",
      scores.score::FLOAT AS score,
      scores.is_manual_class_first AS "isManualClassFirst"
    FROM scores
    INNER JOIN students ON students.id = scores.student_id
    INNER JOIN exams ON exams.id = scores.exam_id
    WHERE students.class_id IN ${sql(rosterClassIds)}
      AND exams.class_id = ${classId}
    ORDER BY scores.exam_id DESC, students.name ASC
  `;

  return rows.map((row) => ({
    studentId: Number(row.studentId),
    examId: Number(row.examId),
    score: Number(row.score),
    isManualClassFirst: row.isManualClassFirst
  }));
}
