const DEFAULT_DATA_FILE = "data/examen-plantilla.json";
const STATIC_EXAMS_INDEX_FILE = "assets/json/exams-index.json";
const NO_PARTIAL_FILTER_VALUE = "__no_partial__";

const state = {
  exam: null,
  answers: {},
  importedAnswers: null,
  importedAnswersSource: "",
  submitted: false,
  onlyErrors: false,
  elapsedMs: 0,
  timerStart: null,
  timerInterval: null,
  timerRunning: false,
  dbSource: "none",
  dbExamCatalog: [],
};

const floatingViewer = {
  root: null,
  title: null,
  openExternal: null,
  frame: null,
  image: null,
  initialized: false,
  zIndex: 1300,
  moved: false,
};

const dom = {
  pageTitle: document.getElementById("pageTitle"),
  pageSubtitle: document.getElementById("pageSubtitle"),
  noticeBox: document.getElementById("noticeBox"),
  dataStatus: document.getElementById("dataStatus"),
  questions: document.getElementById("questions"),
  resultBox: document.getElementById("resultBox"),
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
  timeBox: document.getElementById("timeBox"),
  correctBox: document.getElementById("correctBox"),
  gradeBox: document.getElementById("gradeBox"),
  timerTop: document.getElementById("timerTop"),
  startTimer: document.getElementById("startTimer"),
  gradeTop: document.getElementById("gradeTop"),
  gradeBottom: document.getElementById("gradeBottom"),
  toggleErrors: document.getElementById("toggleErrors"),
  resetTop: document.getElementById("resetTop"),
  resetBottom: document.getElementById("resetBottom"),
  loadDefaultData: document.getElementById("loadDefaultData"),
  refreshDbExams: document.getElementById("refreshDbExams"),
  dbSubjectSelect: document.getElementById("dbSubjectSelect"),
  dbPartialSelect: document.getElementById("dbPartialSelect"),
  dbExamSelect: document.getElementById("dbExamSelect"),
  loadSelectedDbExam: document.getElementById("loadSelectedDbExam"),
  saveAnswers: document.getElementById("saveAnswers"),
  examFileInput: document.getElementById("examFileInput"),
  answersFileInput: document.getElementById("answersFileInput"),
};

function getDbMetaValue(meta, ...keys) {
  for (const key of keys) {
    if (meta && Object.prototype.hasOwnProperty.call(meta, key) && meta[key] !== undefined && meta[key] !== null) {
      return meta[key];
    }
  }
  return "";
}

function extractPartialFromPath(rawPath) {
  const normalized = String(rawPath || "").replace(/\\/g, "/");
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/").filter(Boolean);
  const parcial = segments.find((segment) => /^parcial[\s-]\d+$/i.test(segment.trim()));
  return parcial ? parcial.trim() : "";
}

function normalizePartialName(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const match = text.match(/^parcial[\s-](\d+)$/i);
  if (match) {
    return `Parcial ${match[1]}`;
  }

  return text;
}

function normalizeDbExamMeta(meta, index) {
  const examUid = String(getDbMetaValue(meta, "examUid", "exam_uid", "uid", "key") || "").trim();
  const examTitle = String(getDbMetaValue(meta, "exam_title", "examTitle") || "Examen").trim();
  const subjectTitle = String(
    getDbMetaValue(meta, "subject_folder", "subject", "subject_title", "subjectTitle") || "Asignatura"
  ).trim();
  const sourcePath = String(getDbMetaValue(meta, "source_path", "sourcePath", "file") || "").trim();
  const partialFromMeta = String(getDbMetaValue(meta, "partial", "parcial") || "").trim();
  const partial = normalizePartialName(partialFromMeta || extractPartialFromPath(sourcePath));
  const totalQuestions = Number(getDbMetaValue(meta, "total_questions", "totalQuestions") || 0);
  const updatedAt = String(getDbMetaValue(meta, "updated_at", "updatedAt") || "").trim();
  const file = String(getDbMetaValue(meta, "file", "url") || "").trim();

  return {
    examUid,
    examTitle,
    subject: subjectTitle,
    partial,
    totalQuestions,
    updatedAt,
    index,
    file,
  };
}

function buildDbOptionLabel(item) {
  const total = item.totalQuestions > 0 ? `${item.totalQuestions} preguntas` : "preguntas sin definir";
  return `${item.examTitle} · ${total}`;
}

function populateDbSubjectSelect(subjects, selectedSubject) {
  dom.dbSubjectSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = subjects.length
    ? "-- Selecciona una asignatura --"
    : "-- No hay asignaturas publicadas --";
  dom.dbSubjectSelect.appendChild(placeholder);

  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    dom.dbSubjectSelect.appendChild(option);
  });

  if (selectedSubject && subjects.includes(selectedSubject)) {
    dom.dbSubjectSelect.value = selectedSubject;
  }
}

function hideDbPartialSelect() {
  dom.dbPartialSelect.classList.add("hidden");
  dom.dbPartialSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "-- Selecciona un parcial --";
  dom.dbPartialSelect.appendChild(placeholder);
}

function populateDbPartialSelect(partials, selectedPartial) {
  if (!partials.length) {
    hideDbPartialSelect();
    return;
  }

  dom.dbPartialSelect.classList.remove("hidden");
  dom.dbPartialSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "-- Selecciona un parcial --";
  dom.dbPartialSelect.appendChild(placeholder);

  partials.forEach((partial) => {
    const option = document.createElement("option");
    option.value = partial.value;
    option.textContent = partial.label;
    dom.dbPartialSelect.appendChild(option);
  });

  if (selectedPartial && partials.some((partial) => partial.value === selectedPartial)) {
    dom.dbPartialSelect.value = selectedPartial;
    return;
  }

  dom.dbPartialSelect.value = partials[0].value;
}

function populateDbExamSelect(list, selectedExamUid = "") {
  dom.dbExamSelect.replaceChildren();

  if (!list.length) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "-- No hay exámenes publicados disponibles --";
    dom.dbExamSelect.appendChild(placeholder);
    return;
  }

  list.forEach((item) => {
    if (!item.examUid) {
      return;
    }

    const option = document.createElement("option");
    option.value = item.examUid;
    option.textContent = buildDbOptionLabel(item);
    dom.dbExamSelect.appendChild(option);
  });

  if (selectedExamUid) {
    const selectedIndex = list.findIndex((item) => item.examUid === selectedExamUid);
    if (selectedIndex >= 0) {
      dom.dbExamSelect.options[selectedIndex].selected = true;
      return;
    }
  }

  dom.dbExamSelect.options[0].selected = true;
}

function normalizeDbExamList(rawList) {
  return rawList
    .map((meta, index) => normalizeDbExamMeta(meta, index))
    .filter((item) => item.examUid);
}

function getFilteredExamsForCurrentSelection(catalog) {
  const selectedSubject = dom.dbSubjectSelect.value;
  if (!selectedSubject) {
    return [];
  }

  const examsForSubject = catalog.filter((item) => item.subject === selectedSubject);
  if (dom.dbPartialSelect.classList.contains("hidden")) {
    return examsForSubject;
  }

  const selectedPartial = dom.dbPartialSelect.value;
  if (!selectedPartial) {
    return examsForSubject;
  }

  if (selectedPartial === NO_PARTIAL_FILTER_VALUE) {
    return examsForSubject.filter((item) => !item.partial);
  }

  return examsForSubject.filter((item) => item.partial === selectedPartial);
}

function buildPartialFilterOptions(examsForSubject) {
  const partials = [...new Set(examsForSubject.map((item) => item.partial).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
  const hasNoPartialExams = examsForSubject.some((item) => !item.partial);

  if (!partials.length) {
    return [];
  }

  const options = partials.map((partial) => ({ value: partial, label: partial }));
  if (hasNoPartialExams) {
    options.unshift({ value: NO_PARTIAL_FILTER_VALUE, label: "Sin parcial" });
  }

  return options;
}

function populateDbSelectors(catalog) {
  const previousSubject = dom.dbSubjectSelect.value;
  const previousPartial = dom.dbPartialSelect.value;
  const previousExam = dom.dbExamSelect.value;

  const subjects = [...new Set(catalog.map((item) => item.subject).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es")
  );

  const selectedSubject =
    previousSubject && subjects.includes(previousSubject)
      ? previousSubject
      : subjects.length
        ? subjects[0]
        : "";

  populateDbSubjectSelect(subjects, selectedSubject);

  const examsForSubject = selectedSubject
    ? catalog.filter((item) => item.subject === selectedSubject)
    : [];

  const partials = buildPartialFilterOptions(examsForSubject);

  populateDbPartialSelect(partials, previousPartial);

  const filteredExams = getFilteredExamsForCurrentSelection(catalog);

  populateDbExamSelect(filteredExams, previousExam);
}

function onDbSubjectChanged() {
  const subject = dom.dbSubjectSelect.value;
  const examsForSubject = subject
    ? state.dbExamCatalog.filter((item) => item.subject === subject)
    : [];

  const partials = buildPartialFilterOptions(examsForSubject);

  populateDbPartialSelect(partials, "");
  populateDbExamSelect(getFilteredExamsForCurrentSelection(state.dbExamCatalog));

  if (dom.dbExamSelect.value) {
    loadCurrentCatalogSelection();
  }
}

function onDbPartialChanged() {
  populateDbExamSelect(getFilteredExamsForCurrentSelection(state.dbExamCatalog));

  if (dom.dbExamSelect.value) {
    loadCurrentCatalogSelection();
  }
}

function isNativeApp() {
  return Boolean(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform()
  );
}

async function listDbExams() {
  const response = await fetch(STATIC_EXAMS_INDEX_FILE, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload)
    ? payload
    : payload && Array.isArray(payload.items)
      ? payload.items
      : null;

  if (!items) {
    throw new Error("Respuesta inválida de exams-index.json");
  }

  state.dbSource = "static";
  return items;
}

async function refreshDbExamList() {
  setDataStatus("Actualizando catálogo estático de exámenes...", "neutral");

  try {
    const exams = await listDbExams();
    state.dbExamCatalog = normalizeDbExamList(exams);
    populateDbSelectors(state.dbExamCatalog);

    if (!state.dbExamCatalog.length) {
      setDataStatus("No hay exámenes publicados todavía en assets/json.", "neutral");
      return;
    }

    setDataStatus(`Catálogo actualizado (${state.dbExamCatalog.length} examen(es)).`, "neutral");
  } catch (error) {
    state.dbExamCatalog = [];
    populateDbSelectors([]);
    state.dbSource = "none";
    setDataStatus(`No se pudo cargar el catálogo estático: ${error.message}`, "error");
  }
}

async function loadExamByUidFromDb(examUid) {
  const uid = String(examUid || "").trim();
  if (!uid) {
    throw new Error("Selecciona un examen publicado.");
  }

  const selectedExam = state.dbExamCatalog.find((item) => item.examUid === uid);
  if (!selectedExam || !selectedExam.file) {
    throw new Error("No se encontró el JSON del examen seleccionado.");
  }

  await loadExamFromUrl(
    selectedExam.file,
    `${selectedExam.subject} · ${selectedExam.examTitle}`,
    { subjectTitle: selectedExam.subject }
  );
}

function loadCurrentCatalogSelection() {
  loadExamByUidFromDb(dom.dbExamSelect.value).catch((error) => {
    setDataStatus(`No se pudo cargar el examen publicado: ${error.message}`, "error");
  });
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function createTextNode(tag, text, className = "") {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  node.textContent = text;
  return node;
}

function isDirectImageUrl(url) {
  return /\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i.test(String(url || ""));
}

function toEmbeddableUrl(rawUrl) {
  const url = String(rawUrl || "").trim();
  const driveMatch = url.match(/^https?:\/\/drive\.google\.com\/file\/d\/([^/]+)\/view(?:\?.*)?$/i);
  if (driveMatch) {
    return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  }
  return url;
}

function closeFloatingViewer() {
  if (!floatingViewer.root) {
    return;
  }

  floatingViewer.root.classList.remove("visible");
  floatingViewer.root.setAttribute("aria-hidden", "true");
  floatingViewer.frame.src = "about:blank";
  floatingViewer.image.src = "";
}

function initFloatingViewer() {
  if (floatingViewer.initialized) {
    return;
  }

  const root = document.createElement("section");
  root.className = "floating-resource-viewer";
  root.setAttribute("aria-hidden", "true");

  const header = document.createElement("div");
  header.className = "floating-resource-header";

  const title = document.createElement("strong");
  title.className = "floating-resource-title";
  title.textContent = "Recurso adjunto";

  const actions = document.createElement("div");
  actions.className = "floating-resource-actions";

  const openExternal = document.createElement("a");
  openExternal.className = "floating-resource-open";
  openExternal.target = "_blank";
  openExternal.rel = "noopener noreferrer";
  openExternal.textContent = "Abrir fuera";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "floating-resource-close";
  close.textContent = "Cerrar";

  actions.appendChild(openExternal);
  actions.appendChild(close);
  header.appendChild(title);
  header.appendChild(actions);

  const body = document.createElement("div");
  body.className = "floating-resource-body";

  const image = document.createElement("img");
  image.className = "floating-resource-image";
  image.alt = "Recurso adjunto";

  const frame = document.createElement("iframe");
  frame.className = "floating-resource-frame";
  frame.title = "Recurso adjunto";
  frame.loading = "lazy";
  frame.referrerPolicy = "no-referrer";

  body.appendChild(image);
  body.appendChild(frame);
  root.appendChild(header);
  root.appendChild(body);
  document.body.appendChild(root);

  close.addEventListener("click", closeFloatingViewer);

  const drag = {
    pointerId: null,
    startX: 0,
    startY: 0,
    baseLeft: 0,
    baseTop: 0,
  };

  header.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    // Keep action controls clickable; drag only when pointer starts outside actions.
    if (event.target.closest(".floating-resource-actions")) {
      return;
    }

    const rect = root.getBoundingClientRect();
    drag.pointerId = event.pointerId;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.baseLeft = rect.left;
    drag.baseTop = rect.top;
    header.setPointerCapture(event.pointerId);
    root.classList.add("dragging");
  });

  header.addEventListener("pointermove", (event) => {
    if (drag.pointerId !== event.pointerId) {
      return;
    }

    const nextLeft = drag.baseLeft + (event.clientX - drag.startX);
    const nextTop = drag.baseTop + (event.clientY - drag.startY);
    root.style.left = `${Math.max(8, nextLeft)}px`;
    root.style.top = `${Math.max(8, nextTop)}px`;
    root.style.transform = "none";
    floatingViewer.moved = true;
  });

  const stopDragging = (event) => {
    if (drag.pointerId !== event.pointerId) {
      return;
    }
    header.releasePointerCapture(event.pointerId);
    drag.pointerId = null;
    root.classList.remove("dragging");
  };

  header.addEventListener("pointerup", stopDragging);
  header.addEventListener("pointercancel", stopDragging);

  root.addEventListener("pointerdown", () => {
    floatingViewer.zIndex += 1;
    root.style.zIndex = String(floatingViewer.zIndex);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFloatingViewer();
    }
  });

  floatingViewer.root = root;
  floatingViewer.title = title;
  floatingViewer.openExternal = openExternal;
  floatingViewer.frame = frame;
  floatingViewer.image = image;
  floatingViewer.initialized = true;
}

function openFloatingViewer(url, label) {
  initFloatingViewer();

  const safeUrl = String(url || "").trim();
  if (!safeUrl) {
    return;
  }

  floatingViewer.title.textContent = label || "Recurso adjunto";
  floatingViewer.openExternal.href = safeUrl;
  floatingViewer.frame.src = "about:blank";
  floatingViewer.image.src = "";

  if (isDirectImageUrl(safeUrl)) {
    floatingViewer.image.src = safeUrl;
    floatingViewer.image.style.display = "block";
    floatingViewer.frame.style.display = "none";
  } else {
    floatingViewer.frame.src = toEmbeddableUrl(safeUrl);
    floatingViewer.frame.style.display = "block";
    floatingViewer.image.style.display = "none";
  }

  floatingViewer.zIndex += 1;
  floatingViewer.root.style.zIndex = String(floatingViewer.zIndex);

  if (!floatingViewer.moved) {
    floatingViewer.root.style.top = "80px";
    floatingViewer.root.style.left = "50%";
    floatingViewer.root.style.transform = "translateX(-50%)";
  }

  floatingViewer.root.classList.add("visible");
  floatingViewer.root.setAttribute("aria-hidden", "false");
}

function getTotalQuestions() {
  return state.exam ? state.exam.questions.length : 0;
}

function getPenaltyDivisor() {
  const raw = Number(state.exam && state.exam.scoring && state.exam.scoring.wrongAnswersPerDiscountedCorrect);
  return raw > 0 ? raw : 0;
}

function getMaxScore() {
  const raw = Number(state.exam && state.exam.scoring && state.exam.scoring.maxScore);
  return raw > 0 ? raw : 10;
}

function getTimeLimitMinutes() {
  const raw = Number(state.exam && state.exam.scoring && state.exam.scoring.timeLimitMinutes);
  return raw > 0 ? raw : 90;
}

function updateTimer() {
  const text = formatTime(state.elapsedMs);
  dom.timerTop.textContent = text;
  dom.timeBox.textContent = text;
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
  }
  state.timerInterval = null;
  state.timerRunning = false;
  updateTimer();
}

function startTimer() {
  if (!state.exam || state.submitted || state.timerRunning) {
    return;
  }

  state.timerRunning = true;
  state.timerStart = Date.now() - state.elapsedMs;
  dom.startTimer.textContent = "Contador en marcha";

  state.timerInterval = setInterval(() => {
    state.elapsedMs = Date.now() - state.timerStart;
    updateTimer();
  }, 250);
}

function setDataStatus(text, tone = "neutral") {
  dom.dataStatus.textContent = text;
  dom.dataStatus.dataset.tone = tone;
}

function setControlsState() {
  const hasExam = Boolean(state.exam && state.exam.questions.length);

  dom.startTimer.disabled = !hasExam || state.submitted;
  dom.gradeTop.disabled = !hasExam || state.submitted;
  dom.gradeBottom.disabled = !hasExam || state.submitted;
  dom.resetTop.disabled = !hasExam;
  dom.resetBottom.disabled = !hasExam;
  dom.saveAnswers.disabled = !hasExam;
}

function slugifyFilename(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function buildRealizedExamPayload() {
  if (!state.exam) {
    throw new Error("No hay examen cargado.");
  }

  return {
    subject: state.exam.subjectTitle || "Asignatura",
    type: state.exam.examTitle || "Examen",
    date: new Date().toISOString().slice(0, 10),
    description: state.exam.subtitle || "",
    questions: state.exam.questions.map((question) => ({
      id: question.id,
      text: question.text,
      marked_option: state.answers[String(question.id)] || "",
    })),
  };
}

function saveAnswersToJson() {
  try {
    const payload = buildRealizedExamPayload();
    const jsonText = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const subject = slugifyFilename(payload.subject) || "asignatura";
    const exam = slugifyFilename(payload.type) || "examen";
    a.href = url;
    a.download = `${subject}-${exam}-realizado.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setDataStatus(`Respuestas guardadas en JSON (${a.download}).`, "neutral");
  } catch (error) {
    setDataStatus(`No se pudieron guardar respuestas: ${error.message}`, "error");
  }
}

function updateStaticTexts() {
  if (!state.exam) {
    document.title = "Examen dinámico";
    dom.pageTitle.textContent = "Examen dinámico";
    dom.pageSubtitle.textContent =
      "Selecciona un examen publicado o carga un JSON local manualmente.";
    dom.noticeBox.textContent =
      "La página genera la cabecera, preguntas, progreso y cálculo de nota a partir del JSON. También puede precargar respuestas desde un examen realizado.";
    return;
  }

  document.title = `${state.exam.subjectTitle} · ${state.exam.examTitle}`;
  dom.pageTitle.textContent = `${state.exam.subjectTitle} · ${state.exam.examTitle}`;
  dom.pageSubtitle.textContent =
    state.exam.subtitle || `${getTotalQuestions()} preguntas · explicación tras corregir`;

  const formulaTip = state.exam.scoring.formulaTip
    ? ` Cálculo: ${state.exam.scoring.formulaTip}.`
    : "";

  dom.noticeBox.textContent = `${
    state.exam.notice || "Examen generado dinámicamente desde JSON."
  }${formulaTip}`;
}

function computeGrade(correct, wrong) {
  const total = getTotalQuestions();
  if (!total) {
    return 0;
  }

  const penaltyDivisor = getPenaltyDivisor();
  const penaltyPerWrong = penaltyDivisor > 0 ? 1 / penaltyDivisor : 0;

  return ((correct - wrong * penaltyPerWrong) / total) * getMaxScore();
}

function getMarkedOption(question) {
  const possibleKeys = [
    "marked_option",
    "markedOption",
    "selected_option",
    "selectedOption",
    "answer",
    "respuesta",
  ];

  for (const key of possibleKeys) {
    if (Object.prototype.hasOwnProperty.call(question, key)) {
      return String(question[key] || "").trim().toUpperCase();
    }
  }

  return "";
}

function getStats() {
  const answered = Object.keys(state.answers).length;
  const correct = (state.exam ? state.exam.questions : []).filter((question) => {
    return question.correctOption && state.answers[String(question.id)] === question.correctOption;
  }).length;
  const wrong = answered - correct;
  const blank = Math.max(0, getTotalQuestions() - answered);
  const rawGrade = computeGrade(correct, wrong);

  return { answered, correct, wrong, blank, rawGrade };
}

function updateProgress() {
  const total = getTotalQuestions();
  const stats = getStats();
  const width = total ? `${Math.round((stats.answered / total) * 100)}%` : "0%";

  dom.progressBar.style.width = width;
  dom.progressText.textContent = `Respondidas: ${stats.answered}/${total} · En blanco: ${stats.blank}`;
  dom.correctBox.textContent = state.submitted ? String(stats.correct) : "—";
  dom.gradeBox.textContent = state.submitted ? Math.max(0, stats.rawGrade).toFixed(2) : "—";

  updateTimer();
  setControlsState();
}

function updateDataStatus() {
  if (!state.exam) {
    if (state.importedAnswers) {
      setDataStatus(
        `Respuestas cargadas: ${state.importedAnswersSource}. Falta cargar examen.`,
        "neutral"
      );
      return;
    }

    setDataStatus("Fuente de datos: pendiente.", "neutral");
    return;
  }

  const parts = [`Examen: ${state.exam.examTitle || "cargado"}`];
  if (state.importedAnswers) {
    parts.push(`Respuestas: ${state.importedAnswersSource}`);
  }

  setDataStatus(parts.join(" · "), "neutral");
}

function createOption(question, option) {
  const questionId = String(question.id);
  const selected = state.answers[questionId] === option.key;
  const correct = state.submitted && question.correctOption === option.key;
  const wrong = state.submitted && selected && question.correctOption !== option.key;

  const label = document.createElement("label");
  label.className = "option";
  label.dataset.questionId = questionId;
  label.dataset.optionKey = option.key;

  if (selected) {
    label.classList.add("selected");
  }
  if (correct) {
    label.classList.add("correct");
  }
  if (wrong) {
    label.classList.add("wrong");
  }

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = selected;
  input.disabled = state.submitted;

  const textWrapper = document.createElement("span");
  const strong = document.createElement("strong");
  strong.textContent = `${option.key}) `;
  textWrapper.appendChild(strong);
  textWrapper.append(document.createTextNode(option.text));

  label.appendChild(input);
  label.appendChild(textWrapper);

  return label;
}

function createFeedback(question) {
  const selectedKey = state.answers[String(question.id)] || "";
  const isCorrect = selectedKey !== "" && selectedKey === question.correctOption;

  const feedback = document.createElement("div");
  feedback.className = "feedback";
  feedback.style.display = state.submitted ? "block" : "none";

  const firstLine = document.createElement("div");
  let statusText = "Sin responder.";
  if (selectedKey !== "" && isCorrect) {
    statusText = "Correcta.";
  }
  if (selectedKey !== "" && !isCorrect) {
    statusText = "Incorrecta.";
  }

  firstLine.append(document.createTextNode(`${statusText} `));
  if (question.correctOption) {
    firstLine.append(document.createTextNode("Respuesta válida: "));
    firstLine.appendChild(createTextNode("strong", question.correctOption));
    firstLine.append(document.createTextNode("."));
  } else {
    firstLine.append(
      document.createTextNode("No hay respuesta correcta configurada en el JSON.")
    );
  }

  const secondLine = document.createElement("div");
  secondLine.style.marginTop = "6px";
  secondLine.appendChild(createTextNode("strong", "Explicación: "));
  secondLine.append(
    document.createTextNode(question.explanation || "Sin explicación disponible.")
  );

  feedback.appendChild(firstLine);
  feedback.appendChild(secondLine);

  return feedback;
}

function renderQuestions() {
  dom.questions.replaceChildren();

  if (!state.exam) {
    const article = document.createElement("article");
    article.className = "question empty-state";
    article.textContent =
      "No hay examen cargado. Usa el catálogo publicado o la carga manual desde JSON.";
    dom.questions.appendChild(article);
    updateProgress();
    return;
  }

  const visibleQuestions =
    state.submitted && state.onlyErrors
      ? state.exam.questions.filter((question) => {
          return state.answers[String(question.id)] !== question.correctOption;
        })
      : state.exam.questions;

  if (!visibleQuestions.length) {
    const article = document.createElement("article");
    article.className = "question empty-state";
    article.textContent = "No hay preguntas pendientes en la vista actual.";
    dom.questions.appendChild(article);
    updateProgress();
    return;
  }

  visibleQuestions.forEach((question) => {
    const selectedKey = state.answers[String(question.id)] || "";
    const isCorrect = selectedKey !== "" && selectedKey === question.correctOption;

    const article = document.createElement("article");
    article.className = "question";

    const heading = document.createElement("h2");
    const number = document.createElement("span");
    number.className = "qnum";
    number.textContent = `${question.id}.`;

    heading.appendChild(number);
    heading.append(document.createTextNode(question.text));

    if (state.submitted) {
      const status = document.createElement("span");
      status.className = `status ${isCorrect ? "ok" : "bad"}`;
      status.textContent = isCorrect ? "OK" : "X";
      heading.append(document.createTextNode(" "));
      heading.appendChild(status);
    }

    article.appendChild(heading);

    if (question.image) {
      const imgWrap = document.createElement("div");
      imgWrap.className = "question-image";
      const isImageUrl = isDirectImageUrl(question.image);
      if (isImageUrl) {
        const img = document.createElement("img");
        img.src = question.image;
        img.alt = "Imagen asociada a la pregunta";
        img.loading = "lazy";
        imgWrap.appendChild(img);
      } else {
        const link = document.createElement("a");
        link.href = question.image;
        link.textContent = "\uD83D\uDCCE Ver recurso adjunto";
        link.addEventListener("click", (event) => {
          event.preventDefault();
          openFloatingViewer(question.image, `Pregunta ${question.id}: recurso adjunto`);
        });
        imgWrap.appendChild(link);
      }
      article.appendChild(imgWrap);
    }

    question.options.forEach((option) => article.appendChild(createOption(question, option)));
    article.appendChild(createFeedback(question));

    dom.questions.appendChild(article);
  });

  updateProgress();
}

function resetExam(scrollToTop, keepImportedAnswers = true, hardReset = false) {
  if (hardReset) {
    state.answers = {};
    state.importedAnswers = null;
    state.importedAnswersSource = "";
  } else {
    state.answers = keepImportedAnswers && state.importedAnswers ? { ...state.importedAnswers } : {};
  }
  state.submitted = false;
  state.onlyErrors = false;
  state.elapsedMs = 0;
  state.timerStart = null;

  stopTimer();

  dom.resultBox.style.display = "none";
  dom.resultBox.replaceChildren();
  dom.toggleErrors.classList.add("hidden");
  dom.toggleErrors.textContent = "Ver solo fallos/en blanco";
  dom.gradeTop.classList.remove("hidden");
  dom.gradeBottom.classList.remove("hidden");
  dom.startTimer.textContent = "Iniciar contador";

  updateStaticTexts();
  updateDataStatus();
  renderQuestions();

  if (scrollToTop) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function renderResult() {
  const stats = getStats();
  const withinTime = state.elapsedMs / 60000 <= getTimeLimitMinutes();

  dom.resultBox.replaceChildren();
  dom.resultBox.style.display = "block";
  dom.resultBox.appendChild(
    createTextNode("h2", `${stats.rawGrade >= 5 ? "OK" : "Atención"} · Resultado`)
  );

  const line1 = document.createElement("p");
  line1.append(document.createTextNode("Aciertos: "));
  line1.appendChild(createTextNode("strong", String(stats.correct)));
  line1.append(document.createTextNode(" · Errores: "));
  line1.appendChild(createTextNode("strong", String(stats.wrong)));
  line1.append(document.createTextNode(" · En blanco: "));
  line1.appendChild(createTextNode("strong", String(stats.blank)));
  line1.append(document.createTextNode("."));

  const line2 = document.createElement("p");
  line2.append(document.createTextNode("Tiempo empleado: "));
  line2.appendChild(createTextNode("strong", formatTime(state.elapsedMs)));
  line2.append(
    document.createTextNode(
      withinTime
        ? `. Dentro del tiempo oficial de ${getTimeLimitMinutes()} minutos.`
        : `. Has superado los ${getTimeLimitMinutes()} minutos oficiales.`
    )
  );

  const line3 = document.createElement("p");
  line3.append(document.createTextNode("Fórmula aplicada: "));
  line3.appendChild(createTextNode("strong", state.exam.scoring.formulaTip || "No definida"));
  line3.append(document.createTextNode(". Nota: "));
  line3.appendChild(createTextNode("strong", Math.max(0, stats.rawGrade).toFixed(2)));
  line3.append(document.createTextNode("."));

  dom.resultBox.appendChild(line1);
  dom.resultBox.appendChild(line2);
  dom.resultBox.appendChild(line3);
}

function gradeExam() {
  if (!state.exam || state.submitted) {
    return;
  }

  state.submitted = true;
  stopTimer();
  renderResult();

  dom.toggleErrors.classList.remove("hidden");
  dom.gradeTop.classList.add("hidden");
  dom.gradeBottom.classList.add("hidden");
  dom.startTimer.disabled = true;

  renderQuestions();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function normalizeExamData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("El JSON no contiene un objeto válido.");
  }

  if (!Array.isArray(data.questions)) {
    throw new Error("El JSON debe incluir un array questions.");
  }

  const questions = data.questions.map((question, index) => {
    if (!question || typeof question !== "object") {
      throw new Error(`La pregunta ${index + 1} no es válida.`);
    }

    const options = Array.isArray(question.options)
      ? question.options.map((option, optionIndex) => {
          if (!option || typeof option !== "object") {
            throw new Error(
              `La opción ${optionIndex + 1} de la pregunta ${index + 1} no es válida.`
            );
          }

          const fallbackKey = String.fromCharCode(65 + optionIndex);
          const key = String(option.key || fallbackKey).trim() || fallbackKey;

          return {
            key,
            text: String(option.text || "").trim(),
          };
        })
      : [];

    if (!options.length) {
      throw new Error(`La pregunta ${index + 1} no tiene opciones.`);
    }

    const validKeys = options.map((option) => option.key);
    const correctOption = String(question.correctOption || "").trim();

    return {
      id: question.id || index + 1,
      text: String(question.text || `Pregunta ${index + 1}`),
      image: String(question.image || "").trim(),
      options,
      correctOption: validKeys.includes(correctOption) ? correctOption : "",
      explanation: String(question.explanation || "").trim(),
    };
  });

  return {
    subjectTitle: String(data.subjectTitle || "Asignatura"),
    examTitle: String(data.examTitle || "Examen"),
    subtitle: String(data.subtitle || ""),
    notice: String(data.notice || ""),
    scoring: {
      maxScore:
        Number(data.scoring && data.scoring.maxScore) > 0
          ? Number(data.scoring.maxScore)
          : 10,
      wrongAnswersPerDiscountedCorrect:
        Number(data.scoring && data.scoring.wrongAnswersPerDiscountedCorrect) > 0
          ? Number(data.scoring.wrongAnswersPerDiscountedCorrect)
          : 0,
      formulaTip: String((data.scoring && data.scoring.formulaTip) || ""),
      timeLimitMinutes:
        Number(data.scoring && data.scoring.timeLimitMinutes) > 0
          ? Number(data.scoring.timeLimitMinutes)
          : 90,
    },
    questions,
  };
}

function normalizeRealizedExamData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("El JSON de respuestas no contiene un objeto válido.");
  }

  if (!Array.isArray(data.questions)) {
    throw new Error("El JSON de respuestas debe incluir un array questions.");
  }

  const answers = {};

  data.questions.forEach((question, index) => {
    if (!question || typeof question !== "object") {
      throw new Error(`La respuesta ${index + 1} no es válida.`);
    }

    const questionId = String(question.id || index + 1).trim();
    const markedOption = getMarkedOption(question);

    if (questionId && markedOption) {
      answers[questionId] = markedOption;
    }
  });

  return {
    label: String(data.type || data.examTitle || data.title || "examen realizado"),
    answers,
  };
}

function applyExamData(exam, sourceLabel) {
  state.exam = exam;
  resetExam(false, true);
  updateStaticTexts();

  if (window.ExamMobileDb && window.ExamMobileDb.isAvailable && window.ExamMobileDb.isAvailable()) {
    window.ExamMobileDb.saveExam(exam).then((saved) => {
      if (!saved && isNativeApp()) {
        setDataStatus(
          "No se pudo guardar el examen en la BD nativa del dispositivo.",
          "error"
        );
      }
    }).catch(() => {
      // Si falla persistencia nativa, la app sigue operativa con estado en memoria.
      if (isNativeApp()) {
        setDataStatus(
          "Error al guardar examen en BD nativa del dispositivo.",
          "error"
        );
      }
    });
  }

  if (sourceLabel) {
    setDataStatus(
      `Examen cargado: ${sourceLabel}${state.importedAnswers ? ` · Respuestas: ${state.importedAnswersSource}` : ""}`,
      "neutral"
    );
  } else {
    updateDataStatus();
  }
}

function applyRealizedAnswers(realized, sourceLabel) {
  state.importedAnswers = realized.answers;
  state.importedAnswersSource = sourceLabel;

  if (state.exam) {
    resetExam(false, true);
  } else {
    updateDataStatus();
  }
}

async function loadExamFromUrl(url, label, overrides = {}) {
  setDataStatus(`Cargando ${label}...`, "neutral");

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    applyExamData(
      {
        ...normalizeExamData(data),
        ...overrides,
      },
      label
    );
  } catch (error) {
    if (!state.exam) {
      updateStaticTexts();
      updateDataStatus();
      renderQuestions();
    }

    const message =
      location.protocol === "file:"
        ? `No se puede cargar ${label} automáticamente en file://. Usa “Cargar otro JSON” o abre la carpeta con un servidor HTTP.`
        : `No se pudo cargar ${label}: ${error.message}`;

    setDataStatus(message, "error");
  }
}

async function loadDefaultExam() {
  if (state.dbExamCatalog.length) {
    const selectedExamUid = dom.dbExamSelect.value || state.dbExamCatalog[0].examUid;
    if (selectedExamUid) {
      await loadExamByUidFromDb(selectedExamUid);
      return;
    }
  }

  await loadExamFromUrl(DEFAULT_DATA_FILE, DEFAULT_DATA_FILE);
}

async function loadExamFromFile(file) {
  setDataStatus(`Leyendo ${file.name}...`, "neutral");

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    applyExamData(normalizeExamData(data), file.name);
  } catch (error) {
    setDataStatus(`No se pudo leer ${file.name}: ${error.message}`, "error");
  } finally {
    dom.examFileInput.value = "";
  }
}

async function loadRealizedAnswersFromFile(file) {
  setDataStatus(`Leyendo respuestas ${file.name}...`, "neutral");

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    applyRealizedAnswers(normalizeRealizedExamData(data), file.name);
  } catch (error) {
    setDataStatus(`No se pudieron cargar respuestas desde ${file.name}: ${error.message}`, "error");
  } finally {
    dom.answersFileInput.value = "";
  }
}

function bindEvents() {
  dom.questions.addEventListener("click", (event) => {
    const option = event.target.closest(".option");
    if (!option || !state.exam || state.submitted) {
      return;
    }

    startTimer();

    const questionId = option.dataset.questionId;
    const optionKey = option.dataset.optionKey;

    if (state.answers[questionId] === optionKey) {
      delete state.answers[questionId];
    } else {
      state.answers[questionId] = optionKey;
    }

    renderQuestions();
  });

  dom.startTimer.addEventListener("click", startTimer);
  dom.gradeTop.addEventListener("click", gradeExam);
  dom.gradeBottom.addEventListener("click", gradeExam);
  dom.resetTop.addEventListener("click", () => resetExam(true, true, true));
  dom.resetBottom.addEventListener("click", () => resetExam(true, true, true));

  dom.toggleErrors.addEventListener("click", () => {
    state.onlyErrors = !state.onlyErrors;
    dom.toggleErrors.textContent = state.onlyErrors
      ? "Ver todas"
      : "Ver solo fallos/en blanco";
    renderQuestions();
  });

  dom.loadDefaultData.addEventListener("click", () => {
    loadExamFromUrl(DEFAULT_DATA_FILE, DEFAULT_DATA_FILE);
  });

  dom.refreshDbExams.addEventListener("click", () => {
    refreshDbExamList();
  });

  dom.dbSubjectSelect.addEventListener("change", onDbSubjectChanged);
  dom.dbPartialSelect.addEventListener("change", onDbPartialChanged);
  dom.dbExamSelect.addEventListener("change", loadCurrentCatalogSelection);

  dom.loadSelectedDbExam.addEventListener("click", () => {
    loadCurrentCatalogSelection();
  });

  dom.saveAnswers.addEventListener("click", saveAnswersToJson);

  dom.examFileInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) {
      loadExamFromFile(file);
    }
  });

  dom.answersFileInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) {
      loadRealizedAnswersFromFile(file);
    }
  });
}

async function initializeApp() {
  initFloatingViewer();
  bindEvents();
  updateStaticTexts();
  updateDataStatus();
  renderQuestions();
  await refreshDbExamList();
  await loadDefaultExam();
}

function registerServiceWorker() {
  const hasSupport = "serviceWorker" in navigator;
  const isAllowedProtocol = window.location.protocol === "https:" || window.location.hostname === "localhost";

  if (!hasSupport || !isAllowedProtocol) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Registration can fail in restrictive environments; the app still works online.
    });
  });
}

void initializeApp();
registerServiceWorker();
