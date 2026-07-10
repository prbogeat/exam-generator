const STATIC_EXAMS_INDEX_FILE = "assets/json/exams-index.json";
const NO_PARTIAL_FILTER_VALUE = "__no_partial__";

const state = {
  catalog: [],
  selectedSubject: "",
  selectedPartial: "",
  selectedExamUid: "",
};

const dom = {
  subjectSelect: document.getElementById("subjectSelect"),
  partialSelect: document.getElementById("partialSelect"),
  partialGroup: document.getElementById("partialGroup"),
  examSelect: document.getElementById("examSelect"),
  startBtn: document.getElementById("startBtn"),
  loadFileBtn: document.getElementById("loadFileBtn"),
  fileInput: document.getElementById("fileInput"),
  statusMessage: document.getElementById("statusMessage"),
};

function setStatus(message, type = "loading") {
  dom.statusMessage.textContent = message;
  dom.statusMessage.className = `status-message ${type}`;
}

function clearStatus() {
  dom.statusMessage.className = "status-message";
}

function updateManualLoadVisibility() {
  const hasSubjects = dom.subjectSelect.options.length > 1;
  const hasExamOptions = dom.examSelect.options.length > 1;
  const shouldShowManualLoad = !hasSubjects && !hasExamOptions;

  dom.loadFileBtn.classList.toggle("hidden", !shouldShowManualLoad);
}

function showError(message) {
  setStatus(message, "error");
}

async function loadCatalog() {
  try {
    setStatus("Cargando catálogo de exámenes...");
    updateManualLoadVisibility();
    const response = await fetch(STATIC_EXAMS_INDEX_FILE, { cache: "no-store" });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const items = Array.isArray(payload)
      ? payload
      : payload && Array.isArray(payload.items)
        ? payload.items
        : [];

    if (!items.length) {
      throw new Error("No hay exámenes disponibles");
    }

    state.catalog = items;
    populateSubjects();
    dom.loadFileBtn.classList.add("hidden");
    updateManualLoadVisibility();
    clearStatus();
  } catch (error) {
    showError(`Error al cargar catálogo: ${error.message}`);
    dom.subjectSelect.innerHTML = '<option value="">Error al cargar asignaturas</option>';
    dom.examSelect.innerHTML = '<option value="">Error al cargar exámenes</option>';
    dom.examSelect.disabled = true;
    dom.startBtn.disabled = true;
    updateManualLoadVisibility();
  }
}

function getUniqueSubjects() {
  const subjects = [...new Set(state.catalog.map((item) => item.subject).filter(Boolean))];
  return subjects.sort((a, b) => a.localeCompare(b, "es"));
}

function populateSubjects() {
  const subjects = getUniqueSubjects();
  dom.subjectSelect.innerHTML = '<option value="">-- Selecciona una asignatura --</option>';

  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    dom.subjectSelect.appendChild(option);
  });

  dom.subjectSelect.disabled = false;
}

function getExamsForSubject(subject) {
  return state.catalog.filter((item) => item.subject === subject);
}

function getPartialsForSubject(subject) {
  const exams = getExamsForSubject(subject);
  const partials = [...new Set(exams.map((item) => item.partial).filter(Boolean))];
  const hasNoPartial = exams.some((item) => !item.partial);

  const result = partials.sort((a, b) => a.localeCompare(b, "es")).map((partial) => ({
    value: partial,
    label: partial,
  }));

  if (hasNoPartial) {
    result.unshift({ value: NO_PARTIAL_FILTER_VALUE, label: "Sin parcial" });
  }

  return result;
}

function populatePartials(subject) {
  const partials = getPartialsForSubject(subject);

  if (!partials.length) {
    dom.partialGroup.classList.add("hidden");
    state.selectedPartial = "";
    return;
  }

  dom.partialGroup.classList.remove("hidden");
  dom.partialSelect.innerHTML = '<option value="">Todos los exámenes</option>';

  partials.forEach((partial) => {
    const option = document.createElement("option");
    option.value = partial.value;
    option.textContent = partial.label;
    dom.partialSelect.appendChild(option);
  });

  dom.partialSelect.value = "";
  state.selectedPartial = "";
}

function getExamsForSelection(subject, partial) {
  let exams = getExamsForSubject(subject);

  if (partial) {
    if (partial === NO_PARTIAL_FILTER_VALUE) {
      exams = exams.filter((item) => !item.partial);
    } else {
      exams = exams.filter((item) => item.partial === partial);
    }
  }

  return exams;
}

function buildExamLabel(item) {
  const questions = item.totalQuestions > 0 ? `${item.totalQuestions} preguntas` : "preguntas";
  return `${item.examTitle} · ${questions}`;
}

function populateExams(subject, partial) {
  const exams = getExamsForSelection(subject, partial);
  dom.examSelect.innerHTML = "";

  if (!exams.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No hay exámenes disponibles";
    dom.examSelect.appendChild(option);
    dom.examSelect.disabled = true;
    dom.startBtn.disabled = true;
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "-- Selecciona un examen --";
  dom.examSelect.appendChild(placeholder);

  exams.forEach((exam) => {
    const option = document.createElement("option");
    option.value = exam.examUid;
    option.textContent = buildExamLabel(exam);
    dom.examSelect.appendChild(option);
  });

  dom.examSelect.disabled = false;
  dom.examSelect.value = "";
  state.selectedExamUid = "";
  dom.startBtn.disabled = true;
}

function onSubjectChanged() {
  const subject = dom.subjectSelect.value;
  state.selectedSubject = subject;

  if (!subject) {
    populatePartials("");
    populateExams("", "");
    return;
  }

  populatePartials(subject);
  populateExams(subject, "");
}

function onPartialChanged() {
  if (!state.selectedSubject) {
    return;
  }

  const partial = dom.partialSelect.value;
  state.selectedPartial = partial;
  populateExams(state.selectedSubject, partial);
}

function onExamChanged() {
  const examUid = dom.examSelect.value;
  state.selectedExamUid = examUid;
  dom.startBtn.disabled = !examUid;
}

async function startExam() {
  const examUid = state.selectedExamUid;
  if (!examUid) {
    showError("Por favor selecciona un examen");
    return;
  }

  const exam = state.catalog.find((item) => item.examUid === examUid);
  if (!exam || !exam.file) {
    showError("No se encontró el examen seleccionado");
    return;
  }

  try {
    setStatus("Cargando examen...");
    
    // Store the exam info in sessionStorage for the main page
    sessionStorage.setItem("selectedExamUid", exam.examUid);
    sessionStorage.setItem("selectedExamFile", exam.file);
    sessionStorage.setItem("selectedExamTitle", exam.examTitle);
    sessionStorage.setItem("selectedExamSubject", exam.subject);

    // Navigate to the main exam page
    window.location.href = "exam.html";
  } catch (error) {
    showError(`Error: ${error.message}`);
  }
}

function handleFileLoad(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target.result;
      const exam = JSON.parse(content);
      
      // Store in sessionStorage
      sessionStorage.setItem("loadedExamJSON", content);
      sessionStorage.setItem("loadedExamTitle", exam.metadata?.title || "Examen cargado");
      
      window.location.href = "exam.html";
    } catch (error) {
      showError(`Error al procesar archivo: ${error.message}`);
    }
  };
  reader.readAsText(file);
}

// Event listeners
dom.subjectSelect.addEventListener("change", onSubjectChanged);
dom.partialSelect.addEventListener("change", onPartialChanged);
dom.examSelect.addEventListener("change", onExamChanged);
dom.startBtn.addEventListener("click", startExam);
dom.loadFileBtn.addEventListener("click", () => dom.fileInput.click());
dom.fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleFileLoad(e.target.files[0]);
  }
});

// Load catalog on page load
updateManualLoadVisibility();
document.addEventListener("DOMContentLoaded", loadCatalog);

