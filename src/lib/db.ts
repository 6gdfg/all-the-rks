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
      max: 5,
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
    globalThis.rksSchemaReady = prepareSchema().catch((error) => {
      globalThis.rksSchemaReady = undefined;
      throw error;
    });
  }

  return globalThis.rksSchemaReady;
}

async function prepareSchema() {
  const sql = getSql();

  if (await schemaLooksReady(sql)) {
    return;
  }

  await migrate();
}

async function schemaLooksReady(sql: Sql) {
  const rows = await sql<{ ready: boolean }[]>`
    SELECT (
      to_regclass('public.teachers') IS NOT NULL
      AND to_regclass('public.sessions') IS NOT NULL
      AND to_regclass('public.student_sessions') IS NOT NULL
      AND to_regclass('public.site_settings') IS NOT NULL
      AND to_regclass('public.classes') IS NOT NULL
      AND to_regclass('public.class_settings') IS NOT NULL
      AND to_regclass('public.students') IS NOT NULL
      AND to_regclass('public.exams') IS NOT NULL
      AND to_regclass('public.scores') IS NOT NULL
      AND to_regclass('public.rks_snapshots') IS NOT NULL
      AND to_regclass('public.students_query_code_idx') IS NOT NULL
      AND (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'site_settings'
          AND column_name IN (
            'hero_eyebrow',
            'hero_title',
            'hero_subtitle',
            'stat_1_value',
            'stat_1_label',
            'stat_2_value',
            'stat_2_label',
            'stat_3_value',
            'stat_3_label',
            'stat_4_value',
            'stat_4_label'
          )
      ) = 11
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'class_settings'
          AND column_name = 'rks_formula_exponent'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'class_settings'
          AND column_name = 'auto_class_first'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'class_settings'
          AND column_name = 'query_result_style'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'class_settings'
          AND column_name = 'perfect_count'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'class_settings'
          AND column_name = 'best_count'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'class_settings'
          AND column_name = 'rks_formula_mode'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'exams'
          AND column_name = 'difficulty'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'scores'
          AND column_name = 'is_manual_class_first'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'students'
          AND column_name = 'visibility'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'students'
          AND column_name = 'query_code'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rks_snapshots'
          AND column_name = 'snapshot'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rks_snapshots'
          AND column_name = 'visibility'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rks_snapshots'
          AND column_name = 'query_code'
      )
      AND EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'students_visibility_check'
          AND pg_get_constraintdef(oid) LIKE '%rank_only%'
      )
      AND EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'rks_snapshots_visibility_check'
          AND pg_get_constraintdef(oid) LIKE '%rank_only%'
      )
    ) AS ready
  `;

  if (rows[0]?.ready !== true) {
    return false;
  }

  const missingCodes = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM students
      WHERE query_code = ''
      LIMIT 1
    ) AS exists
  `;

  return missingCodes[0]?.exists !== true;
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
    CREATE TABLE IF NOT EXISTS site_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      hero_eyebrow TEXT NOT NULL DEFAULT 'All The RKS',
      hero_title TEXT NOT NULL DEFAULT '输入姓名，查看你的 RKS(Ranking Score)。',
      hero_subtitle TEXT NOT NULL DEFAULT 'rks仅供娱乐。',
      stat_1_value TEXT NOT NULL DEFAULT '14',
      stat_1_label TEXT NOT NULL DEFAULT '最佳考试计入',
      stat_2_value TEXT NOT NULL DEFAULT '+1',
      stat_2_label TEXT NOT NULL DEFAULT '默认 p1 冠军位',
      stat_3_value TEXT NOT NULL DEFAULT '/15',
      stat_3_label TEXT NOT NULL DEFAULT '默认平均分母',
      stat_4_value TEXT NOT NULL DEFAULT '0.1',
      stat_4_label TEXT NOT NULL DEFAULT '考试定数精度',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS hero_eyebrow TEXT NOT NULL DEFAULT 'All The RKS'
  `;

  await sql`
    ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS hero_title TEXT NOT NULL DEFAULT '输入姓名，查看你的 RKS(Ranking Score)。'
  `;

  await sql`
    ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS hero_subtitle TEXT NOT NULL DEFAULT 'rks仅供娱乐。'
  `;

  await sql`
    ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS stat_1_value TEXT NOT NULL DEFAULT '14'
  `;

  await sql`
    ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS stat_1_label TEXT NOT NULL DEFAULT '最佳考试计入'
  `;

  await sql`
    ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS stat_2_value TEXT NOT NULL DEFAULT '+1'
  `;

  await sql`
    ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS stat_2_label TEXT NOT NULL DEFAULT '默认 p1 冠军位'
  `;

  await sql`
    ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS stat_3_value TEXT NOT NULL DEFAULT '/15'
  `;

  await sql`
    ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS stat_3_label TEXT NOT NULL DEFAULT '默认平均分母'
  `;

  await sql`
    ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS stat_4_value TEXT NOT NULL DEFAULT '0.1'
  `;

  await sql`
    ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS stat_4_label TEXT NOT NULL DEFAULT '考试定数精度'
  `;

  await sql`
    ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `;

  await sql`
    INSERT INTO site_settings (
      id,
      hero_eyebrow,
      hero_title,
      hero_subtitle,
      stat_1_value,
      stat_1_label,
      stat_2_value,
      stat_2_label,
      stat_3_value,
      stat_3_label,
      stat_4_value,
      stat_4_label,
      updated_at
    )
    VALUES (
      1,
      'All The RKS',
      '输入姓名，查看你的 RKS(Ranking Score)。',
      'rks仅供娱乐。',
      '14',
      '最佳考试计入',
      '+1',
      '默认 p1 冠军位',
      '/15',
      '默认平均分母',
      '0.1',
      '考试定数精度',
      NOW()
    )
    ON CONFLICT (id) DO NOTHING
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
    CREATE INDEX IF NOT EXISTS classes_name_idx
      ON classes(name)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS classes_subject_idx
      ON classes(subject)
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
      rks_formula_mode TEXT NOT NULL DEFAULT 'curve',
      rks_formula_exponent NUMERIC(4, 2) NOT NULL DEFAULT 0.80,
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
    ALTER TABLE class_settings
    ADD COLUMN IF NOT EXISTS rks_formula_mode TEXT NOT NULL DEFAULT 'curve'
  `;

  await sql`
    ALTER TABLE class_settings
    ADD COLUMN IF NOT EXISTS rks_formula_exponent NUMERIC(4, 2) NOT NULL DEFAULT 0.80
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
    UPDATE class_settings
    SET rks_formula_mode = 'curve'
    WHERE rks_formula_mode IS NULL
       OR rks_formula_mode NOT IN ('curve', 'linear', 'phigros')
  `;

  await sql`
    UPDATE class_settings
    SET rks_formula_exponent = 0.80
    WHERE rks_formula_exponent IS NULL
       OR rks_formula_exponent < 0.10
       OR rks_formula_exponent > 3.00
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
    ALTER TABLE class_settings
    DROP CONSTRAINT IF EXISTS class_settings_rks_formula_mode_check
  `;

  await sql`
    ALTER TABLE class_settings
    ADD CONSTRAINT class_settings_rks_formula_mode_check
    CHECK (rks_formula_mode IN ('curve', 'linear', 'phigros'))
  `;

  await sql`
    ALTER TABLE class_settings
    DROP CONSTRAINT IF EXISTS class_settings_rks_formula_exponent_check
  `;

  await sql`
    ALTER TABLE class_settings
    ADD CONSTRAINT class_settings_rks_formula_exponent_check
    CHECK (rks_formula_exponent BETWEEN 0.10 AND 3.00)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      student_no TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'public',
      query_code TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(class_id, name)
    )
  `;

  await sql`
    ALTER TABLE students
    ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  `;

  await sql`
    ALTER TABLE students
    ADD COLUMN IF NOT EXISTS query_code TEXT NOT NULL DEFAULT ''
  `;

  await sql`
    UPDATE students
    SET visibility = 'public'
    WHERE visibility IS NULL
       OR visibility NOT IN ('public', 'rank_only', 'code_only')
  `;

  await sql`
    UPDATE students
    SET query_code = ''
    WHERE query_code IS NULL
  `;

  await sql`
    UPDATE students
    SET query_code = UPPER(
      SUBSTRING(MD5(RANDOM()::TEXT || clock_timestamp()::TEXT || id::TEXT), 1, 8)
    )
    WHERE query_code = ''
  `;

  await sql`
    ALTER TABLE students
    ALTER COLUMN visibility SET DEFAULT 'public'
  `;

  await sql`
    ALTER TABLE students
    ALTER COLUMN visibility SET NOT NULL
  `;

  await sql`
    ALTER TABLE students
    ALTER COLUMN query_code SET DEFAULT ''
  `;

  await sql`
    ALTER TABLE students
    ALTER COLUMN query_code SET NOT NULL
  `;

  await sql`
    ALTER TABLE students
    DROP CONSTRAINT IF EXISTS students_visibility_check
  `;

  await sql`
    ALTER TABLE students
    ADD CONSTRAINT students_visibility_check
    CHECK (visibility IN ('public', 'rank_only', 'code_only'))
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
    CREATE INDEX IF NOT EXISTS students_class_name_idx
      ON students(class_id, LOWER(name))
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS students_name_query_code_idx
      ON students(LOWER(name), query_code)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS students_query_code_idx
      ON students(query_code)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS student_sessions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS student_sessions_student_idx
      ON student_sessions(student_id)
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
    CREATE TABLE IF NOT EXISTS rks_snapshots (
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      student_name TEXT NOT NULL,
      student_no TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'public',
      query_code TEXT NOT NULL DEFAULT '',
      rks NUMERIC(10, 6) NOT NULL DEFAULT 0,
      rank INTEGER NOT NULL DEFAULT 0,
      result_count INTEGER NOT NULL DEFAULT 0,
      snapshot JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (class_id, student_id)
    )
  `;

  await sql`
    ALTER TABLE rks_snapshots
    ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  `;

  await sql`
    ALTER TABLE rks_snapshots
    ADD COLUMN IF NOT EXISTS query_code TEXT NOT NULL DEFAULT ''
  `;

  await sql`
    UPDATE rks_snapshots
    SET visibility = 'public'
    WHERE visibility IS NULL
       OR visibility NOT IN ('public', 'rank_only', 'code_only')
  `;

  await sql`
    UPDATE rks_snapshots
    SET query_code = ''
    WHERE query_code IS NULL
  `;

  await sql`
    UPDATE rks_snapshots
    SET query_code = students.query_code,
        visibility = students.visibility
    FROM students
    WHERE rks_snapshots.student_id = students.id
      AND (
        rks_snapshots.query_code = ''
        OR rks_snapshots.visibility <> students.visibility
      )
  `;

  await sql`
    ALTER TABLE rks_snapshots
    ALTER COLUMN visibility SET DEFAULT 'public'
  `;

  await sql`
    ALTER TABLE rks_snapshots
    ALTER COLUMN visibility SET NOT NULL
  `;

  await sql`
    ALTER TABLE rks_snapshots
    ALTER COLUMN query_code SET DEFAULT ''
  `;

  await sql`
    ALTER TABLE rks_snapshots
    ALTER COLUMN query_code SET NOT NULL
  `;

  await sql`
    ALTER TABLE rks_snapshots
    DROP CONSTRAINT IF EXISTS rks_snapshots_visibility_check
  `;

  await sql`
    ALTER TABLE rks_snapshots
    ADD CONSTRAINT rks_snapshots_visibility_check
    CHECK (visibility IN ('public', 'rank_only', 'code_only'))
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS rks_snapshots_class_rank_idx
      ON rks_snapshots(class_id, rank, rks DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS rks_snapshots_class_name_idx
      ON rks_snapshots(class_id, LOWER(student_name))
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS rks_snapshots_public_name_idx
      ON rks_snapshots(visibility, LOWER(student_name))
  `;

  await sql`
    INSERT INTO class_settings (class_id)
    SELECT id FROM classes
    ON CONFLICT (class_id) DO NOTHING
  `;
}
