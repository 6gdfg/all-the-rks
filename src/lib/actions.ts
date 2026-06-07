"use server";

import type { Sql, TransactionSql } from "postgres";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createTeacherSession,
  destroyTeacherSession,
  hashPassword,
  normalizeUsername,
  requireTeacher,
  verifyPassword
} from "./auth";
import { ensureSchema, getSql } from "./db";
import { assertClassOwner, getSharedRosterInfoForOwnedClass } from "./data";
import { normalizeExamDifficulty } from "./difficulty";

type QueryClient = Sql | TransactionSql;

export async function registerTeacherAction(formData: FormData) {
  const username = normalizeUsername(readText(formData, "username"));
  const password = readText(formData, "password");

  if (username.length < 3 || password.length < 6) {
    redirect(
      "/teacher/register?error=" +
        encodeURIComponent("账号至少 3 位，密码至少 6 位。")
    );
  }

  await ensureSchema();

  const sql = getSql();
  const passwordHash = await hashPassword(password);

  try {
    const rows = await sql<{ id: number }[]>`
      INSERT INTO teachers (username, password_hash)
      VALUES (${username}, ${passwordHash})
      RETURNING id
    `;

    await createTeacherSession(Number(rows[0].id));
  } catch (error) {
    if (isUniqueViolation(error)) {
      redirect(
        "/teacher/register?error=" + encodeURIComponent("这个账号已经被注册。")
      );
    }

    throw error;
  }

  redirect("/dashboard?notice=" + encodeURIComponent("注册成功，已进入控制台。"));
}

export async function loginTeacherAction(formData: FormData) {
  const username = normalizeUsername(readText(formData, "username"));
  const password = readText(formData, "password");

  await ensureSchema();

  const sql = getSql();
  const rows = await sql<{ id: number; passwordHash: string }[]>`
    SELECT id, password_hash AS "passwordHash"
    FROM teachers
    WHERE username = ${username}
    LIMIT 1
  `;

  const teacher = rows[0];

  if (!teacher || !(await verifyPassword(password, teacher.passwordHash))) {
    redirect(
      "/teacher/login?error=" + encodeURIComponent("账号或密码不正确。")
    );
  }

  await createTeacherSession(Number(teacher.id));
  redirect("/dashboard?notice=" + encodeURIComponent("登录成功。"));
}

export async function logoutTeacherAction() {
  await destroyTeacherSession();
  redirect("/teacher/login?notice=" + encodeURIComponent("已退出登录。"));
}

export async function createClassAction(formData: FormData) {
  const teacher = await requireTeacher();
  const name = readText(formData, "name", 80);
  const subject = readText(formData, "subject", 40) || "学科";

  if (!name) {
    redirect("/dashboard?error=" + encodeURIComponent("班级名称不能为空。"));
  }

  await ensureSchema();

  const sql = getSql();
  const rows = await sql<{ id: number }[]>`
    INSERT INTO classes (teacher_id, name, subject)
    VALUES (${teacher.id}, ${name}, ${subject})
    RETURNING id
  `;

  const classId = Number(rows[0].id);

  await sql`
    INSERT INTO class_settings (class_id)
    VALUES (${classId})
    ON CONFLICT (class_id) DO NOTHING
  `;

  revalidatePath("/dashboard");
  redirect(
    `/dashboard/classes/${classId}?notice=${encodeURIComponent("班级已创建。")}`
  );
}

export async function updateClassAction(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = readId(formData, "classId");
  const name = readText(formData, "name", 80);
  const subject = readText(formData, "subject", 40) || "学科";

  if (!name) {
    redirect(
      `/dashboard/classes/${classId}?error=${encodeURIComponent("班级名称不能为空。")}`
    );
  }

  await assertClassOwner(teacher.id, classId);

  const sql = getSql();
  await sql`
    UPDATE classes
    SET name = ${name},
        subject = ${subject}
    WHERE id = ${classId}
      AND teacher_id = ${teacher.id}
  `;

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/classes/${classId}`);
  redirect(
    `/dashboard/classes/${classId}?notice=${encodeURIComponent("班级信息已保存。")}`
  );
}

export async function deleteClassAction(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = readId(formData, "classId");

  await assertClassOwner(teacher.id, classId);

  const sql = getSql();
  await sql`
    DELETE FROM classes
    WHERE id = ${classId}
      AND teacher_id = ${teacher.id}
  `;

  revalidatePath("/dashboard");
  redirect("/dashboard?notice=" + encodeURIComponent("班级已删除。"));
}

export async function updateSettingsAction(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = readId(formData, "classId");
  const leaderboardLimit = clamp(readNumber(formData, "leaderboardLimit", 20), 3, 100);
  const queryResultStyle = readQueryResultStyle(formData);
  const perfectCount = clamp(readNumber(formData, "perfectCount", 1), 0, 10);
  const bestCount = clamp(readNumber(formData, "bestCount", 14), 1, 100);

  await assertClassOwner(teacher.id, classId);

  const sql = getSql();
  await sql`
    INSERT INTO class_settings (
      class_id,
      show_home_leaderboard,
      show_student_rank,
      show_exam_scores,
      public_search_enabled,
      query_result_style,
      perfect_count,
      best_count,
      leaderboard_limit,
      updated_at
    )
    VALUES (
      ${classId},
      ${readCheckbox(formData, "showHomeLeaderboard")},
      ${readCheckbox(formData, "showStudentRank")},
      ${readCheckbox(formData, "showExamScores")},
      ${readCheckbox(formData, "publicSearchEnabled")},
      ${queryResultStyle},
      ${Math.floor(perfectCount)},
      ${Math.floor(bestCount)},
      ${leaderboardLimit},
      NOW()
    )
    ON CONFLICT (class_id) DO UPDATE
    SET show_home_leaderboard = EXCLUDED.show_home_leaderboard,
        show_student_rank = EXCLUDED.show_student_rank,
        show_exam_scores = EXCLUDED.show_exam_scores,
        public_search_enabled = EXCLUDED.public_search_enabled,
        query_result_style = EXCLUDED.query_result_style,
        perfect_count = EXCLUDED.perfect_count,
        best_count = EXCLUDED.best_count,
        leaderboard_limit = EXCLUDED.leaderboard_limit,
        updated_at = NOW()
  `;

  revalidatePath("/");
  revalidatePath(`/dashboard/classes/${classId}`);
  redirect(
    `/dashboard/classes/${classId}?notice=${encodeURIComponent("展示设置已保存。")}`
  );
}

export async function createStudentAction(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = readId(formData, "classId");
  const nameInput = readText(formData, "name", 1000);
  const names = parseStudentNames(nameInput);
  const studentNo = readText(formData, "studentNo", 30);
  const notes = readText(formData, "notes", 160);

  if (names.length === 0) {
    redirect(
      `/dashboard/classes/${classId}?error=${encodeURIComponent("学生姓名不能为空。")}`
    );
  }

  const roster = await getSharedRosterInfoForOwnedClass(teacher.id, classId);
  const sql = getSql();

  if (names.length === 1) {
    const existing = await findSharedStudentByName(sql, roster.classIds, names[0]);

    if (existing) {
      redirect(
        `/dashboard/classes/${classId}?error=${encodeURIComponent("这个班级里已有同名学生。")}`
      );
    }

    try {
      await sql`
        INSERT INTO students (class_id, name, student_no, notes)
        VALUES (${classId}, ${names[0]}, ${studentNo}, ${notes})
      `;
    } catch (error) {
      if (isUniqueViolation(error)) {
        redirect(
          `/dashboard/classes/${classId}?error=${encodeURIComponent("这个班级里已有同名学生。")}`
        );
      }

      throw error;
    }

    revalidatePath("/");
    revalidatePath(`/dashboard/classes/${classId}`);
    redirect(
      `/dashboard/classes/${classId}?notice=${encodeURIComponent("学生已加入班级。")}`
    );
  }

  let insertedCount = 0;

  await sql.begin(async (tx) => {
    for (const name of names) {
      const existing = await findSharedStudentByName(tx, roster.classIds, name);

      if (existing) {
        continue;
      }

      const rows = await tx<{ id: number }[]>`
        INSERT INTO students (class_id, name, student_no, notes)
        VALUES (${classId}, ${name}, '', '')
        ON CONFLICT (class_id, name) DO NOTHING
        RETURNING id
      `;

      insertedCount += rows.length;
    }
  });

  const skippedCount = names.length - insertedCount;
  const notice =
    insertedCount > 0
      ? `已添加 ${insertedCount} 名学生${
          skippedCount > 0 ? `，跳过 ${skippedCount} 个已存在姓名` : ""
        }。`
      : "没有添加新学生，可能这些姓名都已存在。";

  revalidatePath("/");
  revalidatePath(`/dashboard/classes/${classId}`);
  redirect(
    `/dashboard/classes/${classId}?notice=${encodeURIComponent(notice)}`
  );
}

export async function updateStudentAction(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = readId(formData, "classId");
  const studentId = readId(formData, "studentId");
  const name = readText(formData, "name", 60);
  const studentNo = readText(formData, "studentNo", 30);
  const notes = readText(formData, "notes", 160);

  if (!name) {
    redirect(
      `/dashboard/classes/${classId}?error=${encodeURIComponent("学生姓名不能为空。")}`
    );
  }

  const roster = await getSharedRosterInfoForOwnedClass(teacher.id, classId);
  const sql = getSql();
  const existing = await findSharedStudentByName(
    sql,
    roster.classIds,
    name,
    studentId
  );

  if (existing) {
    redirect(
      `/dashboard/classes/${classId}?error=${encodeURIComponent("这个班级里已有同名学生。")}`
    );
  }

  try {
    const rows = await sql<{ id: number }[]>`
      UPDATE students
      SET name = ${name},
          student_no = ${studentNo},
          notes = ${notes}
      WHERE id = ${studentId}
        AND class_id IN ${sql(roster.classIds)}
      RETURNING id
    `;

    if (!rows[0]) {
      redirect(
        `/dashboard/classes/${classId}?error=${encodeURIComponent("没有找到这个共享名单里的学生。")}`
      );
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      redirect(
        `/dashboard/classes/${classId}?error=${encodeURIComponent("这个班级里已有同名学生。")}`
      );
    }

    throw error;
  }

  revalidatePath("/");
  revalidatePath(`/dashboard/classes/${classId}`);
  redirect(
    `/dashboard/classes/${classId}?notice=${encodeURIComponent("学生信息已保存。")}`
  );
}

export async function deleteStudentAction(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = readId(formData, "classId");
  const studentId = readId(formData, "studentId");

  const roster = await getSharedRosterInfoForOwnedClass(teacher.id, classId);
  const sql = getSql();
  await sql`
    DELETE FROM students
    WHERE id = ${studentId}
      AND class_id IN ${sql(roster.classIds)}
  `;

  revalidatePath("/");
  revalidatePath(`/dashboard/classes/${classId}`);
  redirect(
    `/dashboard/classes/${classId}?notice=${encodeURIComponent("学生已删除。")}`
  );
}

export async function createExamAction(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = readId(formData, "classId");
  const name = readText(formData, "name", 80);
  const difficulty = readExamDifficulty(formData);
  const examDate = readText(formData, "examDate", 10);
  const totalScore = readNumber(formData, "totalScore", 100);
  const constantValue = readNumber(formData, "constantValue", 10);

  if (!name || totalScore <= 0 || constantValue < 0) {
    redirect(
      `/dashboard/classes/${classId}?error=${encodeURIComponent("请填写有效的考试名称、总分和定数。")}`
    );
  }

  await assertClassOwner(teacher.id, classId);

  const sql = getSql();
  await sql`
    INSERT INTO exams (
      class_id,
      name,
      difficulty,
      exam_date,
      total_score,
      constant_value
    )
    VALUES (
      ${classId},
      ${name},
      ${difficulty},
      ${examDate || new Date().toISOString().slice(0, 10)},
      ${totalScore},
      ${roundConstant(constantValue)}
    )
  `;

  revalidatePath("/");
  revalidatePath(`/dashboard/classes/${classId}`);
  redirect(
    `/dashboard/classes/${classId}?notice=${encodeURIComponent("考试已创建，可以录入成绩了。")}`
  );
}

export async function updateExamAction(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = readId(formData, "classId");
  const examId = readId(formData, "examId");
  const name = readText(formData, "name", 80);
  const difficulty = readExamDifficulty(formData);
  const examDate = readText(formData, "examDate", 10);
  const totalScore = readNumber(formData, "totalScore", 100);
  const constantValue = readNumber(formData, "constantValue", 10);

  if (!name || totalScore <= 0 || constantValue < 0) {
    redirect(
      `/dashboard/classes/${classId}?error=${encodeURIComponent("请填写有效的考试名称、总分和定数。")}`
    );
  }

  await assertClassOwner(teacher.id, classId);

  const sql = getSql();
  await sql`
    UPDATE exams
    SET name = ${name},
        difficulty = ${difficulty},
        exam_date = ${examDate || new Date().toISOString().slice(0, 10)},
        total_score = ${totalScore},
        constant_value = ${roundConstant(constantValue)}
    WHERE id = ${examId}
      AND class_id = ${classId}
  `;

  revalidatePath("/");
  revalidatePath(`/dashboard/classes/${classId}`);
  redirect(
    `/dashboard/classes/${classId}?notice=${encodeURIComponent("考试信息已保存。")}`
  );
}

export async function deleteExamAction(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = readId(formData, "classId");
  const examId = readId(formData, "examId");

  await assertClassOwner(teacher.id, classId);

  const sql = getSql();
  await sql`
    DELETE FROM exams
    WHERE id = ${examId}
      AND class_id = ${classId}
  `;

  revalidatePath("/");
  revalidatePath(`/dashboard/classes/${classId}`);
  redirect(
    `/dashboard/classes/${classId}?notice=${encodeURIComponent("考试已删除。")}`
  );
}

export async function saveScoresAction(formData: FormData) {
  const teacher = await requireTeacher();
  const classId = readId(formData, "classId");

  const roster = await getSharedRosterInfoForOwnedClass(teacher.id, classId);
  const sql = getSql();
  const students = await sql<{ id: number }[]>`
    SELECT id
    FROM students
    WHERE class_id IN ${sql(roster.classIds)}
  `;
  const exams = await sql<{ id: number; totalScore: number }[]>`
    SELECT id, total_score::FLOAT AS "totalScore"
    FROM exams
    WHERE class_id = ${classId}
  `;

  const studentIds = new Set(students.map((student) => Number(student.id)));
  const examIds = new Set(exams.map((exam) => Number(exam.id)));
  const examTotalScores = new Map(
    exams.map((exam) => [Number(exam.id), Number(exam.totalScore)])
  );
  const changes: { studentId: number; examId: number; score: number | null }[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("score_")) {
      continue;
    }

    const [, studentText, examText] = key.split("_");
    const studentId = Number(studentText);
    const examId = Number(examText);

    if (!studentIds.has(studentId) || !examIds.has(examId)) {
      continue;
    }

    const raw = String(value).trim();
    const score = raw === "" ? null : Number(raw);

    const totalScore = examTotalScores.get(examId) ?? 0;

    if (
      score !== null &&
      (!Number.isFinite(score) || score < 0 || score > totalScore)
    ) {
      redirect(
        `/dashboard/classes/${classId}?error=${encodeURIComponent("成绩必须是 0 到考试总分之间的数字。")}`
      );
    }

    changes.push({
      studentId,
      examId,
      score
    });
  }

  await sql.begin(async (tx) => {
    for (const change of changes) {
      if (change.score === null) {
        await tx`
          DELETE FROM scores
          WHERE student_id = ${change.studentId}
            AND exam_id = ${change.examId}
        `;
      } else {
        await tx`
          INSERT INTO scores (student_id, exam_id, score, updated_at)
          VALUES (${change.studentId}, ${change.examId}, ${change.score}, NOW())
          ON CONFLICT (student_id, exam_id) DO UPDATE
          SET score = EXCLUDED.score,
              updated_at = NOW()
        `;
      }
    }
  });

  revalidatePath("/");
  revalidatePath(`/dashboard/classes/${classId}`);
  redirect(
    `/dashboard/classes/${classId}?notice=${encodeURIComponent("成绩已保存，RKS 已自动刷新。")}`
  );
}

function readText(formData: FormData, key: string, maxLength = 120) {
  return String(formData.get(key) ?? "")
    .trim()
    .slice(0, maxLength);
}

function parseStudentNames(input: string) {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const item of input.split(/[,，、;；\r\n]+/)) {
    const name = item.trim().slice(0, 60);

    if (!name || seen.has(name)) {
      continue;
    }

    seen.add(name);
    names.push(name);
  }

  return names;
}

function readId(formData: FormData, key: string) {
  const value = Number(formData.get(key));

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`无效 ID: ${key}`);
  }

  return value;
}

function readNumber(formData: FormData, key: string, fallback: number) {
  const value = Number(formData.get(key));

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

function readCheckbox(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function readQueryResultStyle(formData: FormData) {
  const value = String(formData.get("queryResultStyle") ?? "phigros");

  if (value === "poster" || value === "simple") {
    return value;
  }

  return "phigros";
}

function readExamDifficulty(formData: FormData) {
  return normalizeExamDifficulty(String(formData.get("difficulty") ?? "IN"));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundConstant(value: number) {
  return Math.round(value * 10) / 10;
}

async function findSharedStudentByName(
  sql: QueryClient,
  classIds: number[],
  name: string,
  ignoredStudentId?: number
) {
  if (classIds.length === 0) {
    return null;
  }

  const rows = await sql<{ id: number }[]>`
    SELECT id
    FROM students
    WHERE class_id IN ${sql(classIds)}
      AND name = ${name}
      AND (${ignoredStudentId ?? 0} = 0 OR id <> ${ignoredStudentId ?? 0})
    LIMIT 1
  `;

  return rows[0] ?? null;
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
