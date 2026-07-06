const dom = {
  presetSelector: document.getElementById("presetSelector"),
  sourceFileInput: document.getElementById("sourceFileInput"),
  sourceText: document.getElementById("sourceText"),
  subjectTitle: document.getElementById("subjectTitle"),
  examTitle: document.getElementById("examTitle"),
  outputFileName: document.getElementById("outputFileName"),
  subtitle: document.getElementById("subtitle"),
  notice: document.getElementById("notice"),
  questionCount: document.getElementById("questionCount"),
  maxScore: document.getElementById("maxScore"),
  wrongAnswersPerDiscountedCorrect: document.getElementById("wrongAnswersPerDiscountedCorrect"),
  timeLimitMinutes: document.getElementById("timeLimitMinutes"),
  randomSelection: document.getElementById("randomSelection"),
  pickCatalogFolderBtn: document.getElementById("pickCatalogFolderBtn"),
  clearCatalogFolderBtn: document.getElementById("clearCatalogFolderBtn"),
  catalogOutputHint: document.getElementById("catalogOutputHint"),
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
  selectedPreset: null,
  catalogRootHandle: null,
};

document.addEventListener("DOMContentLoaded", async () => {
  await loadPresets();
  bindEvents();
  seedDefaults();
});

function bindEvents() {
  dom.presetSelector.addEventListener("change", handlePresetChange);
  dom.sourceFileInput.addEventListener("change", handleSourceFile);
  dom.pickCatalogFolderBtn.addEventListener("click", pickCatalogOutputFolder);
  dom.clearCatalogFolderBtn.addEventListener("click", clearCatalogOutputFolder);
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
    state.selectedPreset = null;
    return;
  }

  state.selectedPreset = preset;

  dom.subjectTitle.value = preset.subjectTitle || "";
  dom.examTitle.value = preset.examTitle || "";
  dom.outputFileName.value = window.StaticExamCatalog
    ? window.StaticExamCatalog.normalizeOutputFileName(
        preset.output_path_parts?.[preset.output_path_parts.length - 1] || preset.examTitle || "examen.json"
      )
    : "examen.json";
  dom.subtitle.value = preset.subtitle || "";
  dom.notice.value = preset.notice || "";
  dom.questionCount.value = preset.numberOfQuestions || preset.questionCount || "30";
  dom.maxScore.value = preset.maxScore ?? 10;
  dom.wrongAnswersPerDiscountedCorrect.value = preset.wrongAnswersPerDiscountedCorrect ?? 3;
  dom.timeLimitMinutes.value = preset.timeLimitMinutes ?? 90;
  dom.randomSelection.value = preset.randomSelection ? "si" : "no";

  setStatus(`Preset cargado: ${preset.subjectTitle} - ${preset.examTitle}`, "success");
}

function seedDefaults() {
  dom.subjectTitle.value = "Fundamentos de Psicobiología";
  dom.examTitle.value = "Banco desde NotebookLM";
  dom.outputFileName.value = "banco-desde-notebooklm.json";
  dom.subtitle.value = "Banco de preguntas";
  dom.notice.value = "Generado a partir de la salida estructurada de NotebookLM.";
  dom.questionCount.value = "30";
  dom.maxScore.value = "10";
  dom.wrongAnswersPerDiscountedCorrect.value = "3";
  dom.timeLimitMinutes.value = "90";
  dom.randomSelection.value = "no";
  dom.presetSelector.value = "";
  updateSourcePlaceholder();
  syncCatalogOutputHint();
  renderConversation();
}

function syncCatalogOutputHint() {
  dom.catalogOutputHint.textContent = window.StaticExamCatalog
    ? window.StaticExamCatalog.buildCatalogHint(state.catalogRootHandle)
    : "Sin carpeta de catálogo elegida.";
}

async function pickCatalogOutputFolder() {
  if (!window.StaticExamCatalog || !window.StaticExamCatalog.supportsDirectoryPicker()) {
    setStatus("Este navegador no permite elegir carpetas locales. No se puede publicar el catálogo estático desde aquí.", "neutral");
    return;
  }

  try {
    state.catalogRootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    syncCatalogOutputHint();
    setStatus(`Carpeta de catálogo seleccionada: ${state.catalogRootHandle.name}`, "success");
  } catch (error) {
    if (error && error.name !== "AbortError") {
      setStatus(`No se pudo elegir la carpeta del catálogo: ${error.message}`, "error");
    }
  }
}

function clearCatalogOutputFolder() {
  state.catalogRootHandle = null;
  syncCatalogOutputHint();
  setStatus("Se quitó la carpeta de catálogo. Ya no se publicarán exámenes automáticamente.", "neutral");
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
  dom.outputFileName.value = "banco-desde-notebooklm.json";
  state.generatedJson = null;
  state.history = [];
  state.selectedPreset = null;
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
    outputFileName: window.StaticExamCatalog
      ? window.StaticExamCatalog.normalizeOutputFileName(dom.outputFileName.value, dom.examTitle.value || "examen.json")
      : (dom.outputFileName.value || "examen.json").trim(),
    subtitle: dom.subtitle.value.trim(),
    notice: dom.notice.value.trim(),
    questionCount: normalizeInt(dom.questionCount.value, 30),
    maxScore: normalizeFloat(dom.maxScore.value, 10),
    wrongAnswersPerDiscountedCorrect: normalizeFloat(dom.wrongAnswersPerDiscountedCorrect.value, 3),
    timeLimitMinutes: normalizeInt(dom.timeLimitMinutes.value, 90),
    randomSelection: dom.randomSelection.value === "si",
  };
}

async function generateQuestionBank() {
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
  const reportBlocks = [`${selectedQuestions.length} preguntas convertidas al formato final del examen.`];

  state.generatedJson = examJson;
  state.history.push({ role: "user", content: sourceText.slice(0, 1200) });
  state.history.push({ role: "assistant", content: `${selectedQuestions.length} preguntas convertidas al formato final del examen.` });
  renderConversation();

  if (state.catalogRootHandle && window.StaticExamCatalog) {
    try {
      const published = await window.StaticExamCatalog.publishExamToCatalog(state.catalogRootHandle, examJson, {
        preset: state.selectedPreset,
        subjectTitle: config.subjectTitle,
        examTitle: config.examTitle,
        outputFileName: config.outputFileName,
      });
      state.generatedJson = published.normalizedExam;
      reportBlocks.push(`Publicado en catálogo: ${published.relativePath}`);
      reportBlocks.push(`Índice actualizado: ${published.count} examen(es)`);
    } catch (error) {
      reportBlocks.push(`Aviso: no se pudo publicar en el catálogo estático: ${error.message}`);
    }
  }

  dom.jsonPreview.textContent = JSON.stringify(state.generatedJson, null, 2);
  dom.copyJsonBtn.disabled = false;
  dom.downloadJsonBtn.disabled = false;
  setStatus(`Examen generado correctamente.\n\n${reportBlocks.join("\n")}`, "success");
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
    if (json && typeof json === "object") {
      const hasQuestionText = typeof json.pregunta === "string" || typeof json.text === "string";
      const hasOptions =
        (json.opciones && typeof json.opciones === "object") ||
        (json.options && (typeof json.options === "object" || Array.isArray(json.options)));
      if (hasQuestionText && hasOptions) {
        return { questions: [json] };
      }
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

  const questionLine = findFirstLine(lines, [
    /^pregunta\s*[:\-]\s*(.+)$/i,
    /^question\s*[:\-]\s*(.+)$/i,
    /^"?pregunta"?\s*:\s*"?(.+?)"?\s*,?$/i,
    /^"?question"?\s*:\s*"?(.+?)"?\s*,?$/i,
    /^(?:#+\s*)?(?:pregunta\s*\d+|\d+\.)\s*(.+)$/i,
  ]);
  const questionText = questionLine || lines[0].replace(/^#+\s*/, "").replace(/^\d+\.?\s*/, "").trim();

  const options = extractOptions(lines);
  const correctLine = findFirstLine(lines, [
    /^correcta\s*[:\-]\s*([a-d])$/i,
    /^respuesta\s*correcta\s*[:\-]\s*([a-d])$/i,
    /^answer\s*[:\-]\s*([a-d])$/i,
    /^"?correcta"?\s*:\s*"?([a-d])"?\s*,?$/i,
    /^"?correctOption"?\s*:\s*"?([a-d])"?\s*,?$/i,
  ]);
  const explanation = findFirstLine(lines, [
    /^explicacion\s*[:\-]\s*(.+)$/i,
    /^explicación\s*[:\-]\s*(.+)$/i,
    /^justificacion\s*[:\-]\s*(.+)$/i,
    /^justificación\s*[:\-]\s*(.+)$/i,
    /^"?explicacion"?\s*:\s*"?(.+?)"?\s*,?$/i,
    /^"?explicación"?\s*:\s*"?(.+?)"?\s*,?$/i,
    /^"?explanation"?\s*:\s*"?(.+?)"?\s*,?$/i,
  ]) || "";
  const image = extractImage(lines, block);

  if (!questionText || Object.keys(options).length < 2) {
    return null;
  }

  const correctKey = (correctLine || inferCorrectOption(questionText, options)).toUpperCase();

  return {
    pregunta: questionText,
    opciones: options,
    correcta: correctKey,
    explicacion: explanation,
    imagen: image,
  };
}

function extractImage(lines, block) {
  const explicit = findFirstLine(lines, [
    /^\s*(?:[-*+]\s*)?(?:\*\*)?imagen(?:\*\*)?\s*[:\-]\s*(.+)$/i,
    /^\s*(?:[-*+]\s*)?(?:\*\*)?image(?:\*\*)?\s*[:\-]\s*(.+)$/i,
    /^\s*(?:[-*+]\s*)?(?:\*\*)?figura(?:\*\*)?\s*[:\-]\s*(.+)$/i,
    /^\s*(?:[-*+]\s*)?(?:\*\*)?recurso(?:\*\*)?\s*[:\-]\s*(.+)$/i,
    /^\s*"?(?:imagen|image|imagen_url|image_url|figura|recurso)"?\s*:\s*"?(.+?)"?\s*,?$/i,
  ]);

  if (explicit) {
    return sanitizeImageValue(explicit);
  }

  const markdownImage = String(block || "").match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (markdownImage && markdownImage[1]) {
    return sanitizeImageValue(markdownImage[1]);
  }

  const markdownLink = String(block || "").match(/\[(?:imagen|image|figura|recurso)[^\]]*\]\(([^)]+)\)/i);
  if (markdownLink && markdownLink[1]) {
    return sanitizeImageValue(markdownLink[1]);
  }

  const plainUrl = String(block || "").match(/https?:\/\/\S+/i);
  if (plainUrl && plainUrl[0]) {
    return sanitizeImageValue(plainUrl[0]);
  }

  return "";
}

function sanitizeImageValue(raw) {
  if (raw === null || raw === undefined) {
    return "";
  }

  let value = String(raw).trim();
  value = value
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/^\((.*)\)$/g, "$1")
    .replace(/[),.;]+$/g, "")
    .trim();

  return value;
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
    /^"?([a-d])"?\s*:\s*"?(.+?)"?\s*,?$/i,
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
    questions: questions.map((question, index) => {
      const sourceOptions = resolveQuestionOptions(question);
      const normalizedOptions = normalizeOptions(sourceOptions);
      const resolvedImage = resolveQuestionImage(question);
      const converted = {
        id: index + 1,
        sourceId: safeInt(question.id, index + 1),
        used: true,
        text: resolveQuestionText(question, index),
        options: normalizedOptions,
        correctOption: normalizeCorrectOption(resolveQuestionCorrect(question), sourceOptions),
        explanation: resolveQuestionExplanation(question),
      };

      if (resolvedImage) {
        converted.image = resolvedImage;
      }

      return converted;
    }),
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
    "- Lote de preguntas con líneas tipo Pregunta / A / B / C / D / Correcta / Explicacion / Imagen",
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

  const fileName = buildConfig().outputFileName;
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

function resolveQuestionText(question, index) {
  return String(question.pregunta || question.text || `Pregunta ${index + 1}`).trim();
}

function resolveQuestionExplanation(question) {
  return String(question.explicacion || question.explanation || "").trim();
}

function resolveQuestionCorrect(question) {
  return String(question.correcta || question.correctOption || "").trim();
}

function resolveQuestionImage(question) {
  const candidate =
    question?.imagen ||
    question?.image ||
    question?.imagen_url ||
    question?.image_url ||
    question?.figura ||
    question?.resource ||
    "";

  if (typeof candidate === "string") {
    const markdownImage = candidate.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (markdownImage && markdownImage[1]) {
      return sanitizeImageValue(markdownImage[1]);
    }

    const markdownLink = candidate.match(/\[[^\]]+\]\(([^)]+)\)/);
    if (markdownLink && markdownLink[1]) {
      return sanitizeImageValue(markdownLink[1]);
    }

    return sanitizeImageValue(candidate);
  }

  if (candidate && typeof candidate === "object") {
    const nested =
      candidate.url ||
      candidate.src ||
      candidate.href ||
      candidate.path ||
      candidate.link ||
      "";
    return sanitizeImageValue(nested);
  }

  return "";
}

function resolveQuestionOptions(question) {
  if (question && typeof question.opciones === "object" && !Array.isArray(question.opciones)) {
    return question.opciones;
  }

  if (Array.isArray(question?.options)) {
    return question.options.reduce((acc, option, idx) => {
      const fallbackKey = String.fromCharCode(65 + idx);
      const key = String(option?.key || fallbackKey).trim().toUpperCase() || fallbackKey;
      const text = String(option?.text || "").trim();
      if (/^[A-D]$/.test(key) && text) {
        acc[key] = text;
      }
      return acc;
    }, {});
  }

  if (question && typeof question.options === "object" && !Array.isArray(question.options)) {
    return question.options;
  }

  return {};
}