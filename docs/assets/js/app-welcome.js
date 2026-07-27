const STATIC_EXAMS_INDEX_FILE = "assets/json/exams-index.json";
const NO_PARTIAL_FILTER_VALUE = "__no_partial__";
const DEFAULT_DEGREE = "Grado en Psicología";
const DEFAULT_COURSE = "1º";

const state = {
  catalog: [],
  selectedDegree: "",
  selectedCourse: "",
  selectedSubject: "",
  selectedPartial: "",
  selectedExamUid: "",
};

const dom = {
  degreeSelect: document.getElementById("degreeSelect"),
  courseSelect: document.getElementById("courseSelect"),
  subjectSelect: document.getElementById("subjectSelect"),
  partialSelect: document.getElementById("partialSelect"),
  courseGroup: document.getElementById("courseGroup"),
  partialGroup: document.getElementById("partialGroup"),
  examSelect: document.getElementById("examSelect"),
  startBtn: document.getElementById("startBtn"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
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
  const hasDegrees = dom.degreeSelect.options.length > 1;
  const hasExamOptions = dom.examSelect.options.length > 1;
  const shouldShowManualLoad = !hasDegrees && !hasExamOptions;

  dom.loadFileBtn.classList.toggle("hidden", !shouldShowManualLoad);
}

function showError(message) {
  setStatus(message, "error");
}

function normalizeCatalogItem(item) {
  return {
    ...item,
    degree: String(item?.degree || DEFAULT_DEGREE),
    course: String(item?.course || DEFAULT_COURSE),
    subject: String(item?.subject || item?.subjectTitle || "Asignatura"),
    partial: String(item?.partial || ""),
  };
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

    state.catalog = items.map(normalizeCatalogItem);
    populateDegrees();
    dom.loadFileBtn.classList.add("hidden");
    updateManualLoadVisibility();
    clearStatus();
  } catch (error) {
    showError(`Error al cargar catálogo: ${error.message}`);
    dom.degreeSelect.innerHTML = '<option value="">Error al cargar grados</option>';
    dom.courseSelect.innerHTML = '<option value="">Error al cargar cursos</option>';
    dom.subjectSelect.innerHTML = '<option value="">Error al cargar asignaturas</option>';
    dom.examSelect.innerHTML = '<option value="">Error al cargar exámenes</option>';
    dom.examSelect.disabled = true;
    dom.startBtn.disabled = true;
    updateManualLoadVisibility();
  }
}

function getUniqueDegrees() {
  return [...new Set(state.catalog.map((item) => item.degree).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function getCoursesForDegree(degree) {
  if (!degree) {
    return [];
  }
  return [...new Set(state.catalog.filter((item) => item.degree === degree).map((item) => item.course).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function getSubjectsForHierarchy(degree, course) {
  if (!degree || !course) {
    return [];
  }
  return [...new Set(state.catalog.filter((item) => item.degree === degree && item.course === course).map((item) => item.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function populateDegrees() {
  const degrees = getUniqueDegrees();
  dom.degreeSelect.innerHTML = '<option value="">-- Selecciona un grado --</option>';

  degrees.forEach((degree) => {
    const option = document.createElement("option");
    option.value = degree;
    option.textContent = degree;
    dom.degreeSelect.appendChild(option);
  });

  dom.degreeSelect.disabled = false;
  dom.courseSelect.disabled = true;
  dom.subjectSelect.disabled = true;
}

function populateCourses(degree) {
  const courses = getCoursesForDegree(degree);
  dom.courseSelect.innerHTML = '<option value="">-- Selecciona un curso --</option>';

  if (!courses.length) {
    dom.courseSelect.disabled = true;
    state.selectedCourse = "";
    return;
  }

  courses.forEach((course) => {
    const option = document.createElement("option");
    option.value = course;
    option.textContent = course;
    dom.courseSelect.appendChild(option);
  });

  dom.courseSelect.disabled = false;
  dom.courseSelect.value = "";
  state.selectedCourse = "";
}

function populateSubjects(degree, course) {
  const subjects = getSubjectsForHierarchy(degree, course);
  dom.subjectSelect.innerHTML = '<option value="">-- Selecciona una asignatura --</option>';

  if (!subjects.length) {
    dom.subjectSelect.disabled = true;
    state.selectedSubject = "";
    return;
  }

  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    dom.subjectSelect.appendChild(option);
  });

  dom.subjectSelect.disabled = false;
}

function getExamsForSelection(degree, course, subject, partial) {
  let exams = state.catalog;

  if (degree) {
    exams = exams.filter((item) => item.degree === degree);
  }

  if (course) {
    exams = exams.filter((item) => item.course === course);
  }

  if (subject) {
    exams = exams.filter((item) => item.subject === subject);
  }

  if (partial) {
    if (partial === NO_PARTIAL_FILTER_VALUE) {
      exams = exams.filter((item) => !item.partial);
    } else {
      exams = exams.filter((item) => item.partial === partial);
    }
  }

  return exams;
}

function getPartialsForSelection(degree, course, subject) {
  const exams = getExamsForSelection(degree, course, subject, "");
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

function populatePartials(degree, course, subject) {
  const partials = getPartialsForSelection(degree, course, subject);

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

function buildExamLabel(item) {
  const questions = item.totalQuestions > 0 ? `${item.totalQuestions} preguntas` : "preguntas";
  return `${item.examTitle} · ${questions}`;
}

function populateExams(degree, course, subject, partial) {
  const exams = getExamsForSelection(degree, course, subject, partial);
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

function onDegreeChanged() {
  const degree = dom.degreeSelect.value;
  state.selectedDegree = degree;

  state.selectedCourse = "";
  state.selectedSubject = "";
  state.selectedPartial = "";

  if (!degree) {
    populateCourses("");
    populateSubjects("", "");
    populatePartials("", "", "");
    populateExams("", "", "", "");
    return;
  }

  populateCourses(degree);
  populateSubjects("", "");
  populatePartials("", "", "");
  populateExams(degree, "", "", "");
}

function onCourseChanged() {
  const course = dom.courseSelect.value;
  state.selectedCourse = course;

  state.selectedSubject = "";
  state.selectedPartial = "";

  if (!state.selectedDegree || !course) {
    populateSubjects("", "");
    populatePartials("", "", "");
    populateExams(state.selectedDegree, "", "", "");
    return;
  }

  populateSubjects(state.selectedDegree, course);
  populatePartials("", "", "");
  populateExams(state.selectedDegree, course, "", "");
}

function onSubjectChanged() {
  const subject = dom.subjectSelect.value;
  state.selectedSubject = subject;

  if (!state.selectedDegree || !state.selectedCourse || !subject) {
    populatePartials("", "", "");
    populateExams(state.selectedDegree, state.selectedCourse, "", "");
    return;
  }

  populatePartials(state.selectedDegree, state.selectedCourse, subject);
  populateExams(state.selectedDegree, state.selectedCourse, subject, "");
}

function onPartialChanged() {
  if (!state.selectedDegree || !state.selectedCourse || !state.selectedSubject) {
    return;
  }

  const partial = dom.partialSelect.value;
  state.selectedPartial = partial;
  populateExams(state.selectedDegree, state.selectedCourse, state.selectedSubject, partial);
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
    sessionStorage.setItem("selectedExamDegree", exam.degree || "");
    sessionStorage.setItem("selectedExamCourse", exam.course || "");
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

function clearFilters() {
  state.selectedDegree = "";
  state.selectedCourse = "";
  state.selectedSubject = "";
  state.selectedPartial = "";
  state.selectedExamUid = "";

  // Restore exactly the same initial UI state users see after loading catalog.
  populateDegrees();

  dom.degreeSelect.value = "";

  dom.courseSelect.innerHTML = '<option value="">Selecciona un grado primero</option>';
  dom.courseSelect.disabled = true;

  dom.subjectSelect.innerHTML = '<option value="">Selecciona un curso primero</option>';
  dom.subjectSelect.disabled = true;

  dom.partialGroup.classList.add("hidden");
  dom.partialSelect.innerHTML = '<option value="">Todos los exámenes</option>';

  dom.examSelect.innerHTML = '<option value="">Selecciona una asignatura primero</option>';
  dom.examSelect.disabled = true;

  dom.startBtn.disabled = true;
  clearStatus();
}

// Event listeners
dom.degreeSelect.addEventListener("change", onDegreeChanged);
dom.courseSelect.addEventListener("change", onCourseChanged);
dom.subjectSelect.addEventListener("change", onSubjectChanged);
dom.partialSelect.addEventListener("change", onPartialChanged);
dom.examSelect.addEventListener("change", onExamChanged);
dom.startBtn.addEventListener("click", startExam);
dom.clearFiltersBtn.addEventListener("click", clearFilters);
dom.loadFileBtn.addEventListener("click", () => dom.fileInput.click());
dom.fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleFileLoad(e.target.files[0]);
  }
});

// Load catalog on page load
updateManualLoadVisibility();
document.addEventListener("DOMContentLoaded", loadCatalog);

