import "server-only";

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ensureSchema, getSql, hasDatabaseUrl } from "./db";

const scrypt = promisify(scryptCallback);
const sessionCookie = "rks_session";
const sessionDays = 30;

export type Teacher = {
  id: number;
  username: string;
};

type TeacherSessionRow = {
  id: number;
  username: string;
};

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, key] = storedHash.split(":");

  if (scheme !== "scrypt" || !salt || !key) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(key, "hex");

  if (derivedKey.length !== storedKey.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, storedKey);
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export async function createTeacherSession(teacherId: number) {
  await ensureSchema();

  const sql = getSql();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = await hashSessionToken(token);
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);

  await sql`
    INSERT INTO sessions (teacher_id, token_hash, expires_at)
    VALUES (${teacherId}, ${tokenHash}, ${expiresAt})
  `;

  const cookieStore = await cookies();
  cookieStore.set(sessionCookie, token, {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

export async function getCurrentTeacher(): Promise<Teacher | null> {
  if (!hasDatabaseUrl()) {
    return null;
  }

  await ensureSchema();

  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;

  if (!token) {
    return null;
  }

  const sql = getSql();
  const tokenHash = await hashSessionToken(token);
  const rows = await sql<TeacherSessionRow[]>`
    SELECT teachers.id, teachers.username
    FROM sessions
    INNER JOIN teachers ON teachers.id = sessions.teacher_id
    WHERE sessions.token_hash = ${tokenHash}
      AND sessions.expires_at > NOW()
    LIMIT 1
  `;

  const teacher = rows[0];

  if (!teacher) {
    return null;
  }

  return {
    id: Number(teacher.id),
    username: teacher.username
  };
}

export async function requireTeacher() {
  const teacher = await getCurrentTeacher();

  if (!teacher) {
    redirect("/teacher/login");
  }

  return teacher;
}

export async function destroyTeacherSession() {
  if (!hasDatabaseUrl()) {
    return;
  }

  await ensureSchema();

  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;

  if (token) {
    const sql = getSql();
    const tokenHash = await hashSessionToken(token);

    await sql`
      DELETE FROM sessions
      WHERE token_hash = ${tokenHash}
    `;
  }

  cookieStore.delete(sessionCookie);
}

async function hashSessionToken(token: string) {
  const { createHash } = await import("crypto");

  return createHash("sha256").update(token).digest("hex");
}
