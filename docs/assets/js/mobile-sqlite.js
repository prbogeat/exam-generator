(function initExamMobileDb(global) {
  const DB_NAME = "exam_local.db";
  const DB_VERSION = 1;

  let isReady = false;

  function hasCapacitor() {
    return Boolean(global.Capacitor && typeof global.Capacitor.isNativePlatform === "function");
  }

  function getSqlitePlugin() {
    return global.Capacitor && global.Capacitor.Plugins
      ? global.Capacitor.Plugins.CapacitorSQLite
      : null;
  }

  function isAvailable() {
    if (!hasCapacitor()) {
      return false;
    }
    if (!global.Capacitor.isNativePlatform()) {
      return false;
    }
    return Boolean(getSqlitePlugin());
  }

  function canonicalExamPayload(exam) {
    const payload = {
      subjectTitle: exam && exam.subjectTitle ? exam.subjectTitle : "",
      examTitle: exam && exam.examTitle ? exam.examTitle : "",
      subtitle: exam && exam.subtitle ? exam.subtitle : "",
      scoring: exam && exam.scoring ? exam.scoring : {},
      questions: exam && Array.isArray(exam.questions) ? exam.questions : [],
    };
    return JSON.stringify(payload);
  }

  function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }

  function computeExamUid(exam) {
    const canonical = canonicalExamPayload(exam);
    return hashString(canonical);
  }

  async function ensureDb() {
    if (!isAvailable()) {
      return false;
    }

    if (isReady) {
      return true;
    }

    const sqlite = getSqlitePlugin();

    try {
      await sqlite.createConnection({
        database: DB_NAME,
        version: DB_VERSION,
        encrypted: false,
        mode: "no-encryption",
        readonly: false,
      });
    } catch (_error) {
      // Connection can already exist after resume/reload.
    }

    try {
      await sqlite.open({ database: DB_NAME, readonly: false });
      await sqlite.execute({
        database: DB_NAME,
        statements: `
          CREATE TABLE IF NOT EXISTS exams (
            exam_uid TEXT PRIMARY KEY NOT NULL,
            subject_title TEXT NOT NULL,
            exam_title TEXT NOT NULL,
            subtitle TEXT,
            notice TEXT,
            total_questions INTEGER NOT NULL,
            exam_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_exams_updated_at ON exams(updated_at DESC);
        `,
      });
      isReady = true;
      return true;
    } catch (error) {
      console.warn("[ExamMobileDb] No se pudo inicializar SQLite nativa:", error);
      return false;
    }
  }

  async function saveExam(exam) {
    if (!exam || !Array.isArray(exam.questions) || exam.questions.length === 0) {
      return false;
    }

    const ready = await ensureDb();
    if (!ready) {
      return false;
    }

    const sqlite = getSqlitePlugin();
    const examUid = computeExamUid(exam);
    const nowIso = new Date().toISOString();

    try {
      await sqlite.run({
        database: DB_NAME,
        statement: `
          INSERT INTO exams (
            exam_uid,
            subject_title,
            exam_title,
            subtitle,
            notice,
            total_questions,
            exam_json,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(exam_uid) DO UPDATE SET
            subject_title = excluded.subject_title,
            exam_title = excluded.exam_title,
            subtitle = excluded.subtitle,
            notice = excluded.notice,
            total_questions = excluded.total_questions,
            exam_json = excluded.exam_json,
            updated_at = excluded.updated_at;
        `,
        values: [
          examUid,
          String(exam.subjectTitle || ""),
          String(exam.examTitle || ""),
          String(exam.subtitle || ""),
          String(exam.notice || ""),
          exam.questions.length,
          JSON.stringify(exam),
          nowIso,
        ],
      });
      return true;
    } catch (error) {
      console.warn("[ExamMobileDb] No se pudo guardar examen:", error);
      return false;
    }
  }

  async function getLatestExam() {
    const ready = await ensureDb();
    if (!ready) {
      return null;
    }

    const sqlite = getSqlitePlugin();

    try {
      const result = await sqlite.query({
        database: DB_NAME,
        statement: "SELECT exam_json FROM exams ORDER BY datetime(updated_at) DESC LIMIT 1",
      });

      const rows = result && Array.isArray(result.values) ? result.values : [];
      if (!rows.length || !rows[0].exam_json) {
        return null;
      }

      return JSON.parse(rows[0].exam_json);
    } catch (error) {
      console.warn("[ExamMobileDb] No se pudo leer último examen:", error);
      return null;
    }
  }

  async function listExams() {
    const ready = await ensureDb();
    if (!ready) {
      return [];
    }

    const sqlite = getSqlitePlugin();

    try {
      const result = await sqlite.query({
        database: DB_NAME,
        statement: `
          SELECT exam_uid, subject_title, exam_title, subtitle, total_questions, updated_at
          FROM exams
          ORDER BY datetime(updated_at) DESC
        `,
      });

      const rows = result && Array.isArray(result.values) ? result.values : [];
      return rows.map((row) => ({
        exam_uid: row.exam_uid,
        subject_title: row.subject_title,
        exam_title: row.exam_title,
        subtitle: row.subtitle,
        total_questions: row.total_questions,
        updated_at: row.updated_at,
      }));
    } catch (error) {
      console.warn("[ExamMobileDb] No se pudo listar exámenes:", error);
      return [];
    }
  }

  async function getExamByUid(examUid) {
    const uid = String(examUid || "").trim();
    if (!uid) {
      return null;
    }

    const ready = await ensureDb();
    if (!ready) {
      return null;
    }

    const sqlite = getSqlitePlugin();

    try {
      const result = await sqlite.query({
        database: DB_NAME,
        statement: "SELECT exam_json FROM exams WHERE exam_uid = ? LIMIT 1",
        values: [uid],
      });

      const rows = result && Array.isArray(result.values) ? result.values : [];
      if (!rows.length || !rows[0].exam_json) {
        return null;
      }

      return JSON.parse(rows[0].exam_json);
    } catch (error) {
      console.warn("[ExamMobileDb] No se pudo leer examen por UID:", error);
      return null;
    }
  }

  global.ExamMobileDb = {
    isAvailable,
    ensureDb,
    saveExam,
    getLatestExam,
    listExams,
    getExamByUid,
  };
})(window);
