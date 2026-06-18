import "server-only";

import postgres, { type Sql } from "postgres";

declare global {
  var rksSql: Sql | undefined;
  var rksSchemaReady: Promise<void> | undefined;
}

export function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    ""
  );
}

export function hasDatabaseUrl() {
  return Boolean(getDatabaseUrl());
}

export function getSql() {
  const connectionString = getDatabaseUrl();

  if (!connectionString) {
    throw new Error("缺少 DATABASE_URL。请先配置 PostgreSQL 连接字符串。");
  }

  if (!globalThis.rksSql) {
    const isLocal =
      connectionString.includes("localhost") ||
      connectionString.includes("127.0.0.1") ||
      connectionString.includes("sslmode=disable");

    globalThis.rksSql = postgres(connectionString, {
      connect_timeout: 10,
      idle_timeout: 20,
      max: 1,
      ssl: isLocal ? false : "require"
    });
  }

  return globalThis.rksSql;
}

export async function ensureSchema() {
  if (!hasDatabaseUrl()) {
    throw new Error("缺少 DATABASE_URL。请先配置 PostgreSQL 连接字符串。");
  }

  if (!globalThis.rksSchemaReady) {
    globalThis.rksSchemaReady = migrate();
  }

  return globalThis.rksSchemaReady;
}

async function migrate() {
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS teachers (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS sessions_teacher_idx
      ON sessions(teacher_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '学科',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS classes_teacher_idx
      ON classes(teacher_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS class_settings (
      class_id INTEGER PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
      show_home_leaderboard BOOLEAN NOT NULL DEFAULT TRUE,
      show_student_rank BOOLEAN NOT NULL DEFAULT TRUE,
      show_exam_scores BOOLEAN NOT NULL DEFAULT TRUE,
      public_search_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      query_result_style TEXT NOT NULL DEFAULT 'phigros',
      auto_class_first BOOLEAN NOT NULL DEFAULT TRUE,
      perfect_count INTEGER NOT NULL DEFAULT 1,
      best_count INTEGER NOT NULL DEFAULT 14,
      leaderboard_limit INTEGER NOT NULL DEFAULT 20,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE class_settings
    ADD COLUMN IF NOT EXISTS query_result_style TEXT NOT NULL DEFAULT 'phigros'
  `;

  await sql`
    ALTER TABLE class_settings
    ADD COLUMN IF NOT EXISTS perfect_count INTEGER NOT NULL DEFAULT 1
  `;

  await sql`
    ALTER TABLE class_settings
    ADD COLUMN IF NOT EXISTS best_count INTEGER NOT NULL DEFAULT 14
  `;

  await sql`
    ALTER TABLE class_settings
    ADD COLUMN IF NOT EXISTS auto_class_first BOOLEAN NOT NULL DEFAULT TRUE
  `;

  await sql`
    UPDATE class_settings
    SET perfect_count = 1
    WHERE perfect_count IS NULL
       OR perfect_count < 0
       OR perfect_count > 10
  `;

  await sql`
    UPDATE class_settings
    SET best_count = 14
    WHERE best_count IS NULL
       OR best_count < 1
       OR best_count > 100
  `;

  await sql`
    ALTER TABLE class_settings
    DROP CONSTRAINT IF EXISTS class_settings_perfect_count_check
  `;

  await sql`
    ALTER TABLE class_settings
    ADD CONSTRAINT class_settings_perfect_count_check
    CHECK (perfect_count BETWEEN 0 AND 10)
  `;

  await sql`
    ALTER TABLE class_settings
    DROP CONSTRAINT IF EXISTS class_settings_best_count_check
  `;

  await sql`
    ALTER TABLE class_settings
    ADD CONSTRAINT class_settings_best_count_check
    CHECK (best_count BETWEEN 1 AND 100)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      student_no TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(class_id, name)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS students_class_idx
      ON students(class_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS students_name_idx
      ON students(LOWER(name))
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS exams (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      difficulty TEXT NOT NULL DEFAULT 'IN',
      exam_date DATE NOT NULL DEFAULT CURRENT_DATE,
      total_score NUMERIC(8, 2) NOT NULL CHECK (total_score > 0),
      constant_value NUMERIC(6, 1) NOT NULL CHECK (constant_value >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'IN'
  `;

  await sql`
    ALTER TABLE exams
    ALTER COLUMN difficulty SET DEFAULT 'IN'
  `;

  await sql`
    UPDATE exams
    SET difficulty = 'IN'
    WHERE difficulty IS NULL
       OR difficulty NOT IN ('EZ', 'HD', 'IN', 'AT')
  `;

  await sql`
    ALTER TABLE exams
    ALTER COLUMN difficulty SET NOT NULL
  `;

  await sql`
    ALTER TABLE exams
    DROP CONSTRAINT IF EXISTS exams_difficulty_check
  `;

  await sql`
    ALTER TABLE exams
    ADD CONSTRAINT exams_difficulty_check
    CHECK (difficulty IN ('EZ', 'HD', 'IN', 'AT'))
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS exams_class_idx
      ON exams(class_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      score NUMERIC(8, 2) NOT NULL CHECK (score >= 0),
      is_manual_class_first BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, exam_id)
    )
  `;

  await sql`
    ALTER TABLE scores
    ADD COLUMN IF NOT EXISTS is_manual_class_first BOOLEAN NOT NULL DEFAULT FALSE
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS scores_exam_idx
      ON scores(exam_id)
  `;

  await sql`
    INSERT INTO class_settings (class_id)
    SELECT id FROM classes
    ON CONFLICT (class_id) DO NOTHING
  `;
}
