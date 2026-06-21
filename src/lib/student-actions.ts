"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { refreshClassRksSnapshots } from "./data";
import { ensureSchema, getSql } from "./db";
import {
  getQueryCodeRuleText,
  isValidQueryCode,
  normalizeQueryCode
} from "./query-code";
import { normalizeStudentVisibility, type StudentVisibility } from "./rks";
import {
  createStudentSession,
  destroyStudentSession,
  getCurrentStudentSession
} from "./student-auth";

type InlineActionState = {
  status: "idle" | "success" | "error";
  message: string;
  nonce: number;
};

export async function loginStudentAction(formData: FormData) {
  const name = readText(formData, "name", 60);
  const queryCode = normalizeQueryCode(formData.get("queryCode"));

  if (!name || !isValidQueryCode(queryCode)) {
    redirect(
      `/student?error=${encodeURIComponent(
        `请输入姓名和有效查询码（${getQueryCodeRuleText()}）`
      )}`
    );
  }

  await ensureSchema();

  const sql = getSql();
  const rows = await sql<{ id: number }[]>`
    SELECT id
    FROM students
    WHERE LOWER(name) = LOWER(${name})
      AND query_code = ${queryCode}
    ORDER BY id ASC
    LIMIT 1
  `;
  const student = rows[0];

  if (!student) {
    redirect(
      `/student?error=${encodeURIComponent("姓名或查询码不正确。")}`
    );
  }

  await createStudentSession(Number(student.id));
  redirect("/student?notice=" + encodeURIComponent("已进入学生入口。"));
}

export async function logoutStudentAction() {
  await destroyStudentSession();
  redirect("/student?notice=" + encodeURIComponent("已退出学生入口。"));
}

export async function updateStudentAccessInlineAction(
  _state: InlineActionState,
  formData: FormData
) {
  return runInlineAction(async () => {
    const session = await getCurrentStudentSession();

    if (!session) {
      throw new Error("登录已失效，请重新进入学生入口。");
    }

    const visibility = readStudentVisibility(formData);
    const queryCode = normalizeQueryCode(formData.get("queryCode"));

    if (!isValidQueryCode(queryCode)) {
      throw new Error(`查询码需要 ${getQueryCodeRuleText()}`);
    }

    await ensureSchema();

    const sql = getSql();
    const baseRows = await sql<{ name: string; queryCode: string }[]>`
      SELECT name, query_code AS "queryCode"
      FROM students
      WHERE id = ${session.studentId}
      LIMIT 1
    `;
    const base = baseRows[0];

    if (!base || !base.queryCode) {
      throw new Error("没有找到当前学生信息，请重新登录。");
    }

    const currentRows = await sql<{ id: number; classId: number }[]>`
      SELECT id, class_id AS "classId"
      FROM students
      WHERE LOWER(name) = LOWER(${base.name})
        AND query_code = ${base.queryCode}
    `;

    if (currentRows.length === 0) {
      throw new Error("没有找到可更新的学生数据。");
    }

    const studentIds = currentRows.map((row) => Number(row.id));
    const conflictRows = await sql<{ id: number }[]>`
      SELECT id
      FROM students
      WHERE LOWER(name) = LOWER(${base.name})
        AND query_code = ${queryCode}
        AND id NOT IN ${sql(studentIds)}
      LIMIT 1
    `;

    if (conflictRows[0]) {
      throw new Error("同名学生已经使用了这个查询码，请换一个。");
    }

    await sql`
      UPDATE students
      SET visibility = ${visibility},
          query_code = ${queryCode}
      WHERE id IN ${sql(studentIds)}
    `;

    const classIds = [
      ...new Set(currentRows.map((row) => Number(row.classId)))
    ];

    await Promise.all(classIds.map((classId) => refreshClassRksSnapshots(classId)));
    revalidatePath("/");
    revalidatePath("/student");

    for (const classId of classIds) {
      revalidatePath(`/dashboard/classes/${classId}`);
    }

    return "隐私设置已保存。";
  });
}

async function runInlineAction(worker: () => Promise<string>) {
  try {
    return {
      status: "success",
      message: await worker(),
      nonce: Date.now()
    } satisfies InlineActionState;
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "操作失败，请稍后再试。",
      nonce: Date.now()
    } satisfies InlineActionState;
  }
}

function readText(formData: FormData, key: string, maxLength = 120) {
  return String(formData.get(key) ?? "")
    .trim()
    .slice(0, maxLength);
}

function readStudentVisibility(formData: FormData): StudentVisibility {
  return normalizeStudentVisibility(formData.get("visibility"));
}
