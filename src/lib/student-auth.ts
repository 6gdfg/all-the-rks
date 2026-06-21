import "server-only";

import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ensureSchema, getSql, hasDatabaseUrl } from "./db";

const studentSessionCookie = "rks_student_session";
const sessionDays = 30;

export type StudentSession = {
  studentId: number;
  name: string;
  queryCode: string;
};

type StudentSessionRow = {
  studentId: number;
  name: string;
  queryCode: string;
};

export async function createStudentSession(studentId: number) {
  await ensureSchema();

  const sql = getSql();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);

  await sql`
    INSERT INTO student_sessions (student_id, token_hash, expires_at)
    VALUES (${studentId}, ${tokenHash}, ${expiresAt})
  `;

  const cookieStore = await cookies();
  cookieStore.set(studentSessionCookie, token, {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

export async function getCurrentStudentSession(): Promise<StudentSession | null> {
  if (!hasDatabaseUrl()) {
    return null;
  }

  await ensureSchema();

  const cookieStore = await cookies();
  const token = cookieStore.get(studentSessionCookie)?.value;

  if (!token) {
    return null;
  }

  const sql = getSql();
  const rows = await sql<StudentSessionRow[]>`
    SELECT
      students.id AS "studentId",
      students.name,
      students.query_code AS "queryCode"
    FROM student_sessions
    INNER JOIN students ON students.id = student_sessions.student_id
    WHERE student_sessions.token_hash = ${hashSessionToken(token)}
      AND student_sessions.expires_at > NOW()
    LIMIT 1
  `;
  const row = rows[0];

  if (!row || !row.queryCode) {
    return null;
  }

  return {
    studentId: Number(row.studentId),
    name: row.name,
    queryCode: row.queryCode
  };
}

export async function requireStudentSession() {
  const student = await getCurrentStudentSession();

  if (!student) {
    redirect("/student");
  }

  return student;
}

export async function destroyStudentSession() {
  if (!hasDatabaseUrl()) {
    return;
  }

  await ensureSchema();

  const cookieStore = await cookies();
  const token = cookieStore.get(studentSessionCookie)?.value;

  if (token) {
    const sql = getSql();

    await sql`
      DELETE FROM student_sessions
      WHERE token_hash = ${hashSessionToken(token)}
    `;
  }

  cookieStore.delete(studentSessionCookie);
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
