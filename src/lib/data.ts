import "server-only";

import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";

import { ensureSchema, getSql, hasDatabaseUrl } from "./db";
import { normalizeExamDifficulty } from "./difficulty";
import { normalizeQueryCode } from "./query-code";
import {
  calculateClassRks,
  DEFAULT_RKS_FORMULA_EXPONENT,
  DEFAULT_RKS_FORMULA_MODE,
  normalizeRksFormulaExponent,
  normalizeRksFormulaMode,
  normalizeStudentVisibility,
  type ExamRow,
  type RksFormulaMode,
  type ScoreRow,
  type StudentVisibility,
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

export type HomeStatCopy = {
  value: string;
  label: string;
};

export type HomeCopy = {
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  heroStats: HomeStatCopy[];
};

export const DEFAULT_HOME_COPY: HomeCopy = {
  heroEyebrow: "All The RKS",
  heroTitle: "输入姓名，查看你的 RKS(Ranking Score)。",
  heroSubtitle: "rks仅供娱乐。",
  heroStats: [
    { value: "14", label: "最佳考试计入" },
    { value: "+1", label: "默认 p1 冠军位" },
    { value: "/15", label: "默认平均分母" },
    { value: "0.1", label: "考试定数精度" }
  ]
};

export const HOME_COPY_CACHE_TAG = "home-copy";

type HomeCopyRecord = {
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  stat1Value: string;
  stat1Label: string;
  stat2Value: string;
  stat2Label: string;
  stat3Value: string;
  stat3Label: string;
  stat4Value: string;
  stat4Label: string;
};

export type StudentPortalSubject = {
  classId: number;
  className: string;
  subject: string;
  visibility: StudentVisibility;
  queryCode: string;
  totalStudents: number;
  updatedAt: string;
  student: StudentRks | null;
};

export type StudentPortalData = {
  studentName: string;
  queryCode: string;
  visibility: StudentVisibility;
  subjects: StudentPortalSubject[];
};

type PublicHomeOptions = {
  includeLeaderboards?: boolean;
  queryCode?: string;
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

type DashboardClassSummaryRecord = ClassSummaryRecord & {
  topRks: number | null;
  topStudentName: string | null;
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

type SnapshotRow = {
  classId: number;
  studentId: number;
  studentName: string;
  studentNo: string;
  notes: string;
  visibility: StudentVisibility;
  queryCode: string;
  rks: number;
  rank: number;
  resultCount: number;
  snapshot: StudentRks;
};

type StudentPortalRecord = ClassRecord & {
    classId: number;
    studentId: number;
    studentName: string;
    studentNo: string;
    notes: string;
    visibility: StudentVisibility;
    queryCode: string;
    rks: number;
    rank: number;
    resultCount: number;
    snapshot: StudentRks | null;
    totalStudents: number;
    updatedAt: string | null;
  };

export async function refreshClassRksSnapshots(classId: number) {
  await ensureSchema();

  const sql = getSql();
  const classRows = await sql<{ name: string }[]>`
    SELECT name
    FROM classes
    WHERE id = ${classId}
    LIMIT 1
  `;
  const classRow = classRows[0];

  if (!classRow) {
    return;
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
  const studentIds = rankings.map((student) => student.studentId);
  const studentsById = new Map(students.map((student) => [student.id, student]));

  await sql.begin(async (tx) => {
    if (studentIds.length === 0) {
      await tx`
        DELETE FROM rks_snapshots
        WHERE class_id = ${classId}
      `;
    } else {
      await tx`
        DELETE FROM rks_snapshots
        WHERE class_id = ${classId}
          AND student_id NOT IN ${tx(studentIds)}
      `;
    }

    for (const student of rankings) {
      const sourceStudent = studentsById.get(student.studentId);

      await tx`
        INSERT INTO rks_snapshots (
          class_id,
          student_id,
          student_name,
          student_no,
          notes,
          visibility,
          query_code,
          rks,
          rank,
          result_count,
          snapshot,
          updated_at
        )
        VALUES (
          ${classId},
          ${student.studentId},
          ${student.name},
          ${student.studentNo},
          ${student.notes},
          ${sourceStudent?.visibility ?? "public"},
          ${sourceStudent?.queryCode ?? ""},
          ${student.rks},
          ${student.rank},
          ${student.results.length},
          ${tx.json(student)},
          NOW()
        )
        ON CONFLICT (class_id, student_id) DO UPDATE
        SET student_name = EXCLUDED.student_name,
            student_no = EXCLUDED.student_no,
            notes = EXCLUDED.notes,
            visibility = EXCLUDED.visibility,
            query_code = EXCLUDED.query_code,
            rks = EXCLUDED.rks,
            rank = EXCLUDED.rank,
            result_count = EXCLUDED.result_count,
            snapshot = EXCLUDED.snapshot,
            updated_at = NOW()
      `;
    }
  });
}

export async function getTeacherDashboard(teacherId: number) {
  if (!hasDatabaseUrl()) {
    return {
      databaseReady: false,
      classes: [] as ClassSummary[]
    };
  }

  await ensureSchema();

  const sql = getSql();
  let rows = await getDashboardClassRows(sql, teacherId);
  const staleClassIds = rows
    .filter(
      (row) =>
        Number(row.examCount) > 0 &&
        Number(row.studentCount) > 0 &&
        !row.topStudentName
    )
    .map((row) => Number(row.id));

  if (staleClassIds.length > 0) {
    await Promise.all(staleClassIds.map((classId) => refreshClassRksSnapshots(classId)));
    rows = await getDashboardClassRows(sql, teacherId);
  }

  const classes = rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    subject: row.subject,
    createdAt: row.createdAt,
    studentCount: Number(row.studentCount),
    examCount: Number(row.examCount),
    topRks: Number(row.topRks ?? 0),
    topStudentName: row.topStudentName ?? ""
  }));

  return {
    databaseReady: true,
    classes
  };
}

export const getHomeCopy = unstable_cache(readHomeCopy, ["home-copy"], {
  revalidate: 3600,
  tags: [HOME_COPY_CACHE_TAG]
});

async function readHomeCopy(): Promise<HomeCopy> {
  if (!hasDatabaseUrl()) {
    return DEFAULT_HOME_COPY;
  }

  try {
    const sql = getSql();
    const rows = await sql<HomeCopyRecord[]>`
      SELECT
        hero_eyebrow AS "heroEyebrow",
        hero_title AS "heroTitle",
        hero_subtitle AS "heroSubtitle",
        stat_1_value AS "stat1Value",
        stat_1_label AS "stat1Label",
        stat_2_value AS "stat2Value",
        stat_2_label AS "stat2Label",
        stat_3_value AS "stat3Value",
        stat_3_label AS "stat3Label",
        stat_4_value AS "stat4Value",
        stat_4_label AS "stat4Label"
      FROM site_settings
      WHERE id = 1
      LIMIT 1
    `;

    const row = rows[0];

    if (!row) {
      return DEFAULT_HOME_COPY;
    }

    return {
      heroEyebrow: row.heroEyebrow,
      heroTitle: row.heroTitle,
      heroSubtitle: row.heroSubtitle,
      heroStats: [
        { value: row.stat1Value, label: row.stat1Label },
        { value: row.stat2Value, label: row.stat2Label },
        { value: row.stat3Value, label: row.stat3Label },
        { value: row.stat4Value, label: row.stat4Label }
      ]
    };
  } catch {
    return DEFAULT_HOME_COPY;
  }
}

async function getDashboardClassRows(sql: ReturnType<typeof getSql>, teacherId: number) {
  return sql<DashboardClassSummaryRecord[]>`
    SELECT
      classes.id,
      classes.name,
      classes.subject,
      classes.created_at::TEXT AS "createdAt",
      COUNT(DISTINCT students.id)::INTEGER AS "studentCount",
      COUNT(DISTINCT exams.id)::INTEGER AS "examCount",
      COALESCE(top_snapshot.rks, 0)::FLOAT AS "topRks",
      COALESCE(top_snapshot.student_name, '') AS "topStudentName"
    FROM classes
    LEFT JOIN students ON students.class_id = classes.id
    LEFT JOIN exams ON exams.class_id = classes.id
    LEFT JOIN LATERAL (
      SELECT rks_snapshots.rks, rks_snapshots.student_name
      FROM rks_snapshots
      WHERE rks_snapshots.class_id = classes.id
      ORDER BY rks_snapshots.rank ASC, rks_snapshots.rks DESC
      LIMIT 1
    ) AS top_snapshot ON TRUE
    WHERE classes.teacher_id = ${teacherId}
    GROUP BY classes.id, top_snapshot.rks, top_snapshot.student_name
    ORDER BY classes.created_at DESC, classes.id DESC
  `;
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
  let rankings = await getSnapshotRankings(classId);

  if (rankings.length === 0 && scores.length > 0) {
    await refreshClassRksSnapshots(classId);
    rankings = await getSnapshotRankings(classId);
  }

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
  const queryCode = normalizeQueryCode(options.queryCode);
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
    let matchedRows = await getPublicSearchSnapshotRows(
      pattern,
      selectedSubjects,
      queryCode
    );

    if (matchedRows.length === 0) {
      await warmSnapshotsForPublicSearch(trimmedQuery, selectedSubjects, queryCode);
      matchedRows = await getPublicSearchSnapshotRows(
        pattern,
        selectedSubjects,
        queryCode
      );
    }

    const resultsByName = new Map<string, PublicSearchResult>();

    for (const row of matchedRows) {
      const student = normalizeSnapshot(row);

      if (student.results.length === 0) {
        continue;
      }

      const result = {
        classId: Number(row.classId),
        className: row.name,
        subject: row.subject,
        settings: mapSettingsRecord(row),
        student,
        totalStudents: Number(row.totalStudents)
      };
      const resultKey = `${row.classId}:${student.name.trim().toLowerCase()}`;
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
      const limit = Math.max(1, Number(item.leaderboardLimit) || 20);
      let rows = await getLeaderboardSnapshotRows(Number(item.id), limit);

      if (rows.length === 0) {
        await refreshClassRksSnapshots(Number(item.id));
        rows = await getLeaderboardSnapshotRows(Number(item.id), limit);
      }

      return {
        classId: Number(item.id),
        className: item.name,
        subject: item.subject,
        limit,
        students: rows.map(normalizeLeaderboardSnapshot)
      };
    })
  );
}

async function getLeaderboardSnapshotRows(classId: number, limit: number) {
  const sql = getSql();

  return sql<SnapshotRow[]>`
        SELECT
          class_id AS "classId",
          student_id AS "studentId",
          student_name AS "studentName",
          student_no AS "studentNo",
          notes,
          visibility,
          query_code AS "queryCode",
          rks::FLOAT AS rks,
          rank,
          result_count AS "resultCount",
          snapshot
        FROM rks_snapshots
        WHERE class_id = ${classId}
          AND result_count > 0
        ORDER BY rank ASC, rks DESC, student_name ASC
        LIMIT ${limit}
      `;
}

async function getSnapshotRankings(classId: number) {
  const sql = getSql();
  const rows = await sql<SnapshotRow[]>`
    SELECT
      class_id AS "classId",
      student_id AS "studentId",
      student_name AS "studentName",
      student_no AS "studentNo",
      notes,
      visibility,
      query_code AS "queryCode",
      rks::FLOAT AS rks,
      rank,
      result_count AS "resultCount",
      snapshot
    FROM rks_snapshots
    WHERE class_id = ${classId}
    ORDER BY rank ASC, rks DESC, student_name ASC
  `;

  return rows.map(normalizeSnapshot);
}

async function getPublicSearchSnapshotRows(
  pattern: string,
  selectedSubjects: string[],
  queryCode: string
) {
  const sql = getSql();
  const subjectFilter =
    selectedSubjects.length > 0
      ? sql`AND classes.subject IN ${sql(selectedSubjects)}`
      : sql``;
  const visibilityFilter = queryCode
    ? sql`
        AND (
          rks_snapshots.visibility = 'public'
          OR (
            rks_snapshots.visibility IN ('rank_only', 'code_only')
            AND rks_snapshots.query_code = ${queryCode}
          )
        )
      `
    : sql`AND rks_snapshots.visibility = 'public'`;

  return sql<
    (ClassRecord &
      SettingsRecord &
      SnapshotRow & {
        totalStudents: number;
      })[]
  >`
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
      class_settings.leaderboard_limit AS "leaderboardLimit",
      rks_snapshots.class_id AS "classId",
      rks_snapshots.student_id AS "studentId",
      rks_snapshots.student_name AS "studentName",
      rks_snapshots.student_no AS "studentNo",
      rks_snapshots.notes,
      rks_snapshots.visibility,
      rks_snapshots.query_code AS "queryCode",
      rks_snapshots.rks::FLOAT AS rks,
      rks_snapshots.rank,
      rks_snapshots.result_count AS "resultCount",
      rks_snapshots.snapshot,
      COUNT(*) OVER (PARTITION BY classes.id)::INTEGER AS "totalStudents"
    FROM rks_snapshots
    INNER JOIN classes ON classes.id = rks_snapshots.class_id
    INNER JOIN class_settings ON class_settings.class_id = classes.id
    WHERE class_settings.public_search_enabled = TRUE
      AND rks_snapshots.result_count > 0
      ${visibilityFilter}
      AND LOWER(rks_snapshots.student_name) LIKE ${pattern}
      ${subjectFilter}
    ORDER BY classes.created_at DESC, rks_snapshots.student_name ASC
    LIMIT 80
  `;
}

async function warmSnapshotsForPublicSearch(
  query: string,
  selectedSubjects: string[],
  queryCode: string
) {
  const sql = getSql();
  const pattern = `%${query.toLowerCase()}%`;
  const subjectFilter =
    selectedSubjects.length > 0
      ? sql`AND public_classes.subject IN ${sql(selectedSubjects)}`
      : sql``;
  const visibilityFilter = queryCode
    ? sql`
        AND (
          students.visibility = 'public'
          OR (
            students.visibility IN ('rank_only', 'code_only')
            AND students.query_code = ${queryCode}
          )
        )
      `
    : sql`AND students.visibility = 'public'`;
  const classRows = await sql<{ classId: number }[]>`
    SELECT DISTINCT public_classes.id AS "classId"
    FROM classes AS public_classes
    INNER JOIN class_settings
      ON class_settings.class_id = public_classes.id
    INNER JOIN classes AS roster_classes
      ON roster_classes.name = public_classes.name
    INNER JOIN students
      ON students.class_id = roster_classes.id
    WHERE class_settings.public_search_enabled = TRUE
      ${visibilityFilter}
      AND LOWER(students.name) LIKE ${pattern}
      ${subjectFilter}
    LIMIT 20
  `;

  await Promise.all(
    classRows.map((row) => refreshClassRksSnapshots(Number(row.classId)))
  );
}

async function getStudentPortalRows(studentName: string, queryCode: string) {
  const sql = getSql();

  return sql<StudentPortalRecord[]>`
    SELECT
      classes.id,
      classes.name,
      classes.subject,
      classes.created_at::TEXT AS "createdAt",
      students.class_id AS "classId",
      students.id AS "studentId",
      students.name AS "studentName",
      students.student_no AS "studentNo",
      students.notes,
      students.visibility,
      students.query_code AS "queryCode",
      COALESCE(rks_snapshots.rks, 0)::FLOAT AS rks,
      COALESCE(rks_snapshots.rank, 0)::INTEGER AS rank,
      COALESCE(rks_snapshots.result_count, 0)::INTEGER AS "resultCount",
      rks_snapshots.snapshot,
      rks_snapshots.updated_at::TEXT AS "updatedAt",
      COALESCE(class_totals.total_students, 0)::INTEGER AS "totalStudents"
    FROM students
    INNER JOIN classes ON classes.id = students.class_id
    LEFT JOIN rks_snapshots
      ON rks_snapshots.class_id = students.class_id
      AND rks_snapshots.student_id = students.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INTEGER AS total_students
      FROM rks_snapshots
      WHERE rks_snapshots.class_id = classes.id
        AND rks_snapshots.result_count > 0
    ) AS class_totals ON TRUE
    WHERE LOWER(students.name) = LOWER(${studentName})
      AND students.query_code = ${queryCode}
    ORDER BY classes.created_at DESC, classes.id DESC
  `;
}

export async function getPublicLeaderboardData() {
  if (!hasDatabaseUrl()) {
    return {
      databaseReady: false,
      leaderboards: [] as PublicLeaderboard[]
    };
  }

  await ensureSchema();

  return {
    databaseReady: true,
    leaderboards: await getPublicLeaderboards()
  };
}

export async function getStudentPortalData(
  studentId: number
): Promise<StudentPortalData | null> {
  if (!hasDatabaseUrl()) {
    return null;
  }

  await ensureSchema();

  const sql = getSql();
  const baseRows = await sql<{
    name: string;
    visibility: StudentVisibility;
    queryCode: string;
  }[]>`
    SELECT
      name,
      visibility,
      query_code AS "queryCode"
    FROM students
    WHERE id = ${studentId}
    LIMIT 1
  `;
  const base = baseRows[0];

  if (!base || !base.queryCode) {
    return null;
  }

  let rows = await getStudentPortalRows(base.name, base.queryCode);
  const missingClassIds = [
    ...new Set(
      rows
        .filter((row) => !row.snapshot)
        .map((row) => Number(row.classId))
    )
  ];

  if (missingClassIds.length > 0) {
    await Promise.all(missingClassIds.map((classId) => refreshClassRksSnapshots(classId)));
    rows = await getStudentPortalRows(base.name, base.queryCode);
  }

  const subjects = rows.map((row) => {
    const snapshotRow = row.snapshot
      ? ({
          classId: row.classId,
          studentId: row.studentId,
          studentName: row.studentName,
          studentNo: row.studentNo,
          notes: row.notes,
          visibility: row.visibility,
          queryCode: row.queryCode,
          rks: row.rks,
          rank: row.rank,
          resultCount: row.resultCount,
          snapshot: row.snapshot
        } satisfies SnapshotRow)
      : null;

    return {
      classId: Number(row.classId),
      className: row.name,
      subject: row.subject,
      visibility: normalizeStudentVisibility(row.visibility),
      queryCode: row.queryCode,
      totalStudents: Number(row.totalStudents),
      updatedAt: row.updatedAt ?? "",
      student: snapshotRow ? normalizeSnapshot(snapshotRow) : null
    };
  });
  const visibility =
    subjects.length > 0
      ? normalizeStudentVisibility(subjects[0].visibility)
      : normalizeStudentVisibility(base.visibility);

  return {
    studentName: base.name,
    queryCode: base.queryCode,
    visibility,
    subjects
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

function mapSettingsRecord(row: SettingsRecord): ClassSettings {
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

function normalizeSnapshot(row: SnapshotRow): StudentRks {
  const snapshot = row.snapshot;

  return {
    ...snapshot,
    studentId: Number(row.studentId),
    name: row.studentName,
    studentNo: row.studentNo,
    notes: row.notes,
    rks: Number(row.rks),
    rank: Number(row.rank)
  };
}

function normalizeLeaderboardSnapshot(row: SnapshotRow): StudentRks {
  const student = normalizeSnapshot(row);

  if (normalizeStudentVisibility(row.visibility) !== "code_only") {
    return student;
  }

  return {
    ...student,
    name: "？？？",
    studentNo: "",
    notes: "",
    rks: 0,
    isMasked: true,
    rksHistory: [],
    perfectResults: [],
    bestResults: [],
    firstBonus: null,
    results: []
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

  return mapSettingsRecord(row);
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
      notes,
      visibility,
      query_code AS "queryCode"
    FROM students
    WHERE class_id IN ${sql(classIds)}
    ORDER BY student_no ASC, name ASC, id ASC
  `;

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    studentNo: row.studentNo,
    notes: row.notes,
    visibility: normalizeStudentVisibility(row.visibility),
    queryCode: row.queryCode
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
