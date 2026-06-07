import "server-only";

import { notFound } from "next/navigation";

import { ensureSchema, getSql, hasDatabaseUrl } from "./db";
import {
  calculateClassRks,
  type ExamRow,
  type ScoreRow,
  type StudentRks,
  type StudentRow
} from "./rks";

export type ClassSettings = {
  showHomeLeaderboard: boolean;
  showStudentRank: boolean;
  showExamScores: boolean;
  publicSearchEnabled: boolean;
  leaderboardLimit: number;
};

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
        studentCount: Number(row.studentCount),
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

  const settings = await getClassSettings(classId);
  const students = await getStudents(classId);
  const exams = await getExams(classId);
  const scores = await getScores(classId);
  const rankings = calculateClassRks(students, exams, scores);

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

export async function getPublicHomeData(query: string) {
  if (!hasDatabaseUrl()) {
    return {
      databaseReady: false,
      leaderboards: [] as PublicLeaderboard[],
      results: [] as PublicSearchResult[]
    };
  }

  await ensureSchema();

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
      class_settings.leaderboard_limit AS "leaderboardLimit"
    FROM classes
    INNER JOIN class_settings ON class_settings.class_id = classes.id
    WHERE class_settings.show_home_leaderboard = TRUE
    ORDER BY classes.created_at DESC, classes.id DESC
  `;

  const leaderboards = await Promise.all(
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

  const trimmedQuery = query.trim();
  const results: PublicSearchResult[] = [];

  if (trimmedQuery) {
    const pattern = `%${trimmedQuery.toLowerCase()}%`;
    const matchedRows = await sql<
      {
        studentId: number;
        classId: number;
      }[]
    >`
      SELECT students.id AS "studentId", classes.id AS "classId"
      FROM students
      INNER JOIN classes ON classes.id = students.class_id
      INNER JOIN class_settings ON class_settings.class_id = classes.id
      WHERE class_settings.public_search_enabled = TRUE
        AND LOWER(students.name) LIKE ${pattern}
      ORDER BY classes.created_at DESC, students.name ASC
      LIMIT 20
    `;

    const classIds = Array.from(new Set(matchedRows.map((row) => row.classId)));
    const bundles = new Map<number, Awaited<ReturnType<typeof getPublicClassBundle>>>();

    for (const classId of classIds) {
      bundles.set(classId, await getPublicClassBundle(Number(classId)));
    }

    for (const row of matchedRows) {
      const bundle = bundles.get(Number(row.classId));
      const student = bundle?.rankings.find(
        (item) => item.studentId === Number(row.studentId)
      );

      if (!bundle || !student) {
        continue;
      }

      results.push({
        classId: bundle.id,
        className: bundle.name,
        subject: bundle.subject,
        settings: bundle.settings,
        student,
        totalStudents: bundle.rankings.length
      });
    }
  }

  return {
    databaseReady: true,
    leaderboards,
    results
  };
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

  const settings = await getClassSettings(classId);
  const students = await getStudents(classId);
  const exams = await getExams(classId);
  const scores = await getScores(classId);
  const rankings = calculateClassRks(students, exams, scores);

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
      leaderboard_limit AS "leaderboardLimit"
    FROM class_settings
    WHERE class_id = ${classId}
    LIMIT 1
  `;

  return (
    rows[0] ?? {
      showHomeLeaderboard: true,
      showStudentRank: true,
      showExamScores: true,
      publicSearchEnabled: true,
      leaderboardLimit: 20
    }
  );
}

async function getStudents(classId: number) {
  const sql = getSql();
  const rows = await sql<StudentRow[]>`
    SELECT
      id,
      name,
      student_no AS "studentNo",
      notes
    FROM students
    WHERE class_id = ${classId}
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
    examDate: row.examDate,
    totalScore: Number(row.totalScore),
    constantValue: Number(row.constantValue)
  }));
}

async function getScores(classId: number) {
  const sql = getSql();
  const rows = await sql<ScoreRow[]>`
    SELECT
      scores.student_id AS "studentId",
      scores.exam_id AS "examId",
      scores.score::FLOAT AS score
    FROM scores
    INNER JOIN students ON students.id = scores.student_id
    INNER JOIN exams ON exams.id = scores.exam_id
    WHERE students.class_id = ${classId}
      AND exams.class_id = ${classId}
    ORDER BY scores.exam_id DESC, students.name ASC
  `;

  return rows.map((row) => ({
    studentId: Number(row.studentId),
    examId: Number(row.examId),
    score: Number(row.score)
  }));
}
