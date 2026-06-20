const dom = {
  presetSelector: document.getElementById("presetSelector"),
  sourceFileInput: document.getElementById("sourceFileInput"),
  sourceText: document.getElementById("sourceText"),
  subjectTitle: document.getElementById("subjectTitle"),
  examTitle: document.getElementById("examTitle"),
  subtitle: document.getElementById("subtitle"),
  notice: document.getElementById("notice"),
  questionCount: document.getElementById("questionCount"),
  maxScore: document.getElementById("maxScore"),
  wrongAnswersPerDiscountedCorrect: document.getElementById("wrongAnswersPerDiscountedCorrect"),
  timeLimitMinutes: document.getElementById("timeLimitMinutes"),
  randomSelection: document.getElementById("randomSelection"),
  generateBtn: document.getElementById("generateBtn"),
  resetBtn: document.getElementById("resetBtn"),
  copyJsonBtn: document.getElementById("copyJsonBtn"),
  downloadJsonBtn: document.getElementById("downloadJsonBtn"),
  statusBox: document.getElementById("statusBox"),
  statusText: document.getElementById("statusText"),
  jsonPreview: document.getElementById("jsonPreview"),
  conversation: document.getElementById("conversation"),
};

const state = {
  generatedJson: null,
  history: [],
  presets: {},
};

document.addEventListener("DOMContentLoaded", async () => {
  await loadPresets();
  bindEvents();
  seedDefaults();
});

function bindEvents() {
  dom.presetSelector.addEventListener("change", handlePresetChange);
  dom.sourceFileInput.addEventListener("change", handleSourceFile);
  dom.generateBtn.addEventListener("click", generateQuestionBank);
  dom.resetBtn.addEventListener("click", resetForm);
  dom.copyJsonBtn.addEventListener("click", copyGeneratedJson);
  dom.downloadJsonBtn.addEventListener("click", downloadGeneratedJson);
}

async function loadPresets() {
  try {
    const response = await fetch("data/presets.json");
    if (!response.ok) {
      throw new Error("No se pudo cargar presets.json");
    }

    state.presets = await response.json();
    populatePresetSelector();
  } catch (error) {
    setStatus(`No se pudieron cargar los presets: ${error.message}`, "error");
  }
}

function populatePresetSelector() {
  dom.presetSelector.innerHTML = '<option value="">-- Seleccionar preset --</option>';

  Object.entries(state.presets).forEach(([key, preset]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = `${preset.subjectTitle} - ${preset.examTitle}`;
    dom.presetSelector.appendChild(option);
  });
}

function handlePresetChange(event) {
  const preset = state.presets[event.target.value];
  if (!preset) {
    return;
  }

  dom.subjectTitle.value = preset.subjectTitle || "";
  dom.examTitle.value = preset.examTitle || "";
  dom.subtitle.value = preset.subtitle || "";
  dom.notice.value = preset.notice || "";
  dom.questionCount.value = preset.numberOfQuestions || preset.questionCount || "30";
  dom.maxScore.value = preset.maxScore ?? 10;
  dom.wrongAnswersPerDiscountedCorrect.value = preset.wrongAnswersPerDiscountedCorrect ?? 3;
  dom.timeLimitMinutes.value = preset.timeLimitMinutes ?? 90;
  dom.randomSelection.checked = Boolean(preset.randomSelection);

  setStatus(`Preset cargado: ${preset.subjectTitle} - ${preset.examTitle}`, "success");
}

function seedDefaults() {
  dom.subjectTitle.value = "Fundamentos de Psicobiología";
  dom.examTitle.value = "Banco desde NotebookLM";
  dom.subtitle.value = "Banco de preguntas";
  dom.notice.value = "Generado a partir de la salida estructurada de NotebookLM.";
  dom.questionCount.value = "30";
  dom.maxScore.value = "10";
  dom.wrongAnswersPerDiscountedCorrect.value = "3";
  dom.timeLimitMinutes.value = "90";
  dom.randomSelection.checked = false;
  dom.presetSelector.value = "";
  updateSourcePlaceholder();
  renderConversation();
}

async function handleSourceFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const text = await file.text();
  dom.sourceText.value = text;
  setStatus(`Salida cargada: ${file.name}`, "success");
}

function setStatus(message, tone = "neutral") {
  dom.statusText.textContent = message;
  dom.statusBox.dataset.tone = tone;
  dom.statusBox.style.display = "block";
}

function resetForm() {
  dom.presetSelector.value = "";
  dom.sourceFileInput.value = "";
  dom.sourceText.value = "";
  state.generatedJson = null;
  state.history = [];
  dom.jsonPreview.textContent = "Esperando generación...";
  dom.copyJsonBtn.disabled = true;
  dom.downloadJsonBtn.disabled = true;
  dom.statusBox.style.display = "none";
  seedDefaults();
}

function renderConversation() {
  if (state.history.length === 0) {
    dom.conversation.innerHTML = '<div class="conversation-empty">Todavía no hay interacciones.</div>';
    return;
  }

  dom.conversation.innerHTML = state.history
    .map((entry, index) => `
      <article class="message ${entry.role}">
        <div class="message-meta">${index + 1}. ${entry.role === "user" ? "Entrada" : "Salida"}</div>
        <div class="message-content">${escapeHtml(entry.content)}</div>
      </article>
    `)
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeFloat(value, fallback) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildConfig() {
  return {
    subjectTitle: dom.subjectTitle.value.trim(),
    examTitle: dom.examTitle.value.trim(),
    subtitle: dom.subtitle.value.trim(),
    notice: dom.notice.value.trim(),
    questionCount: normalizeInt(dom.questionCount.value, 30),
    maxScore: normalizeFloat(dom.maxScore.value, 10),
    wrongAnswersPerDiscountedCorrect: normalizeFloat(dom.wrongAnswersPerDiscountedCorrect.value, 3),
    timeLimitMinutes: normalizeInt(dom.timeLimitMinutes.value, 90),
    randomSelection: dom.randomSelection.checked,
  };
}

function generateQuestionBank() {
  const config = buildConfig();
  const sourceText = dom.sourceText.value.trim();

  if (!sourceText) {
    setStatus("Debes pegar la salida de NotebookLM o cargar un archivo base.", "error");
    return;
  }

  if (!config.subjectTitle || !config.examTitle) {
    setStatus("Completa el título de asignatura y el título del examen.", "error");
    return;
  }

  const parsed = parseNotebookOutput(sourceText);
  if (!parsed.questions.length) {
    setStatus("No se encontraron preguntas. Pega el bloque JSON o el lote de preguntas que devuelve NotebookLM.", "error");
    return;
  }

  const selectedQuestions = selectQuestions(parsed.questions, config.questionCount, config.randomSelection);
  const examJson = buildExamJson(selectedQuestions, config);

  state.generatedJson = examJson;
  state.history.push({ role: "user", content: sourceText.slice(0, 1200) });
  state.history.push({ role: "assistant", content: `${selectedQuestions.length} preguntas convertidas al formato final del examen.` });
  renderConversation();

  dom.jsonPreview.textContent = JSON.stringify(examJson, null, 2);
  dom.copyJsonBtn.disabled = false;
  dom.downloadJsonBtn.disabled = false;
  setStatus(`Examen generado correctamente: ${selectedQuestions.length} preguntas.`, "success");
}

function parseNotebookOutput(text) {
  const trimmed = stripNotebookFences(text);

  try {
    const json = JSON.parse(trimmed);
    if (Array.isArray(json)) {
      return { questions: json };
    }
    if (json && Array.isArray(json.questions)) {
      return { questions: json.questions };
    }
  } catch {
    // continue with text parsing
  }

  const blocks = splitQuestionBlocks(trimmed);
  const questions = blocks
    .map(parseQuestionBlock)
    .filter((question) => question !== null);

  return { questions };
}

function stripNotebookFences(text) {
  const cleaned = String(text || "").trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  const quoteMatch = cleaned.match(/^'''json\s*([\s\S]*?)\s*'''$/i) || cleaned.match(/^'''\s*([\s\S]*?)\s*'''$/i);
  if (quoteMatch) {
    return quoteMatch[1].trim();
  }

  return cleaned;
}

function splitQuestionBlocks(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const blocks = [];
  let current = [];

  for (const line of lines) {
    const isHeader = /^\s*(?:#+\s*)?(?:pregunta\s*\d+|\d+\.|q\d+|question\s*\d+)\b/i.test(line);
    if (isHeader && current.length > 0) {
      blocks.push(current.join("\n").trim());
      current = [line];
      continue;
    }

    current.push(line);
  }

  if (current.length > 0) {
    blocks.push(current.join("\n").trim());
  }

  return blocks.filter(Boolean);
}

function parseQuestionBlock(block) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return null;
  }

  const questionLine = findFirstLine(lines, [/^pregunta\s*[:\-]\s*(.+)$/i, /^question\s*[:\-]\s*(.+)$/i, /^(?:#+\s*)?(?:pregunta\s*\d+|\d+\.)\s*(.+)$/i]);
  const questionText = questionLine || lines[0].replace(/^#+\s*/, "").replace(/^\d+\.?\s*/, "").trim();

  const options = extractOptions(lines);
  const correctLine = findFirstLine(lines, [/^correcta\s*[:\-]\s*([a-d])$/i, /^respuesta\s*correcta\s*[:\-]\s*([a-d])$/i, /^answer\s*[:\-]\s*([a-d])$/i]);
  const explanation = findFirstLine(lines, [/^explicacion\s*[:\-]\s*(.+)$/i, /^explicación\s*[:\-]\s*(.+)$/i, /^justificacion\s*[:\-]\s*(.+)$/i, /^justificación\s*[:\-]\s*(.+)$/i]) || "";

  if (!questionText || Object.keys(options).length < 2) {
    return null;
  }

  const correctKey = (correctLine || inferCorrectOption(questionText, options)).toUpperCase();

  return {
    pregunta: questionText,
    opciones: options,
    correcta: correctKey,
    explicacion: explanation,
  };
}

function findFirstLine(lines, patterns) {
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }
  return "";
}

function extractOptions(lines) {
  const options = {};
  const patterns = [
    /^([a-d])\s*[\).:\-]\s*(.+)$/i,
    /^opci[oó]n\s*([a-d])\s*[\).:\-]\s*(.+)$/i,
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        options[match[1].toUpperCase()] = match[2].trim();
      }
    }
  }

  return options;
}

function inferCorrectOption(questionText, options) {
  const optionKeys = Object.keys(options);
  if (optionKeys.length === 0) {
    return "A";
  }

  const lowerQuestion = questionText.toLowerCase();
  for (const key of optionKeys) {
    const optionText = String(options[key] || "").toLowerCase();
    if (lowerQuestion.includes(optionText) && optionText.length > 4) {
      return key;
    }
  }

  return optionKeys[0];
}

function selectQuestions(questions, questionCount, randomSelection) {
  const normalized = questions.slice();
  if (randomSelection) {
    normalized.sort(() => Math.random() - 0.5);
  }
  return normalized.slice(0, Math.max(1, questionCount));
}

function buildExamJson(questions, config) {
  const questionCount = questions.length;
  return {
    subjectTitle: config.subjectTitle,
    examTitle: config.examTitle,
    subtitle: config.subtitle,
    notice: config.notice,
    totalQuestions: questionCount,
    scoring: {
      maxScore: config.maxScore,
      wrongAnswersPerDiscountedCorrect: config.wrongAnswersPerDiscountedCorrect,
      timeLimitMinutes: config.timeLimitMinutes,
      formulaTip: buildFormulaTip(questionCount, config.wrongAnswersPerDiscountedCorrect, config.maxScore),
    },
    questions: questions.map((question, index) => ({
      id: index + 1,
      sourceId: safeInt(question.id, index + 1),
      used: true,
      text: question.pregunta,
      options: normalizeOptions(question.opciones),
      correctOption: normalizeCorrectOption(question.correcta, question.opciones),
      explanation: question.explicacion || "",
    })),
  };
}

function buildNotebookHint() {
  return [
    "Pega directamente aquí la salida que te da NotebookLM.",
    "",
    "Se acepta cualquiera de estos formatos:",
    "- JSON puro",
    "- Bloque envuelto por ```json ... ```",
    "- Bloque envuelto por '''json ... '''",
    "- Lote de preguntas con líneas tipo Pregunta / A / B / C / D / Correcta / Explicacion",
    "",
    "Después completa solo estos datos básicos del examen y pulsa Generar JSON.",
  ].join("\n");
}

function updateSourcePlaceholder() {
  dom.sourceText.placeholder = buildNotebookHint();
}

function normalizeOptions(options) {
  const resolved = ["A", "B", "C", "D"]
    .map((key) => {
      const lowerKey = key.toLowerCase();
      const value = options[key] ?? options[lowerKey] ?? options[key.toUpperCase()];
      return value ? { key, text: String(value).trim() } : null;
    })
    .filter(Boolean);

  if (resolved.length > 0) {
    return resolved;
  }

  return Object.entries(options)
    .map(([key, value]) => ({ key: String(key).trim().toUpperCase(), text: String(value).trim() }))
    .filter((option) => /^[A-D]$/.test(option.key));
}

function safeInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCorrectOption(correctOption, options) {
  const key = String(correctOption || "").trim().toUpperCase();
  if (options[key] || options[key.toLowerCase()]) {
    return key;
  }
  const fallback = Object.keys(options)[0];
  return fallback || "A";
}

function buildFormulaTip(questionCount, wrongAnswersPerDiscountedCorrect, maxScore) {
  if (!questionCount) {
    return "";
  }

  if (wrongAnswersPerDiscountedCorrect > 0) {
    return `[(A - E / ${wrongAnswersPerDiscountedCorrect}) / ${questionCount}] x ${maxScore}`;
  }

  return `[(A) / ${questionCount}] x ${maxScore}`;
}

function copyGeneratedJson() {
  if (!state.generatedJson) {
    return;
  }

  navigator.clipboard.writeText(JSON.stringify(state.generatedJson, null, 2));
  setStatus("JSON copiado al portapapeles.", "success");
}

function downloadGeneratedJson() {
  if (!state.generatedJson) {
    return;
  }

  const fileName = `${(dom.examTitle.value || "banco-preguntas").trim().replace(/\s+/g, "-").toLowerCase()}.json`;
  const blob = new Blob([JSON.stringify(state.generatedJson, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}