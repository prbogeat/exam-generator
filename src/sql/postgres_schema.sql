CREATE TABLE IF NOT EXISTS exams (
    id BIGSERIAL PRIMARY KEY,
    exam_uid TEXT NOT NULL UNIQUE,
    subject TEXT,
    subject_title TEXT NOT NULL,
    exam_title TEXT NOT NULL,
    subtitle TEXT,
    notice TEXT,
    max_score DOUBLE PRECISION,
    wrong_answers_per_discounted_correct DOUBLE PRECISION,
    time_limit_minutes INTEGER,
    formula_tip TEXT,
    total_questions INTEGER NOT NULL,
    source_path TEXT,
    exam_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_questions (
    id BIGSERIAL PRIMARY KEY,
    exam_id BIGINT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    source_id INTEGER,
    question_text TEXT NOT NULL,
    correct_option TEXT,
    explanation TEXT,
    image TEXT
);

CREATE TABLE IF NOT EXISTS exam_options (
    id BIGSERIAL PRIMARY KEY,
    question_id BIGINT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
    option_key TEXT NOT NULL,
    option_text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exams_updated_at ON exams(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id ON exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_options_question_id ON exam_options(question_id);
