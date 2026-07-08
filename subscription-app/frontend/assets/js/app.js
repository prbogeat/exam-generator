const API_BASE = localStorage.getItem("ea_api_base") || `${window.location.origin}/api`;
const TOKEN_KEY = "ea_subscription_token";
const SELECTED_EXAM_KEY = "ea_selected_exam_uid";

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  user: null,
  catalog: [],
  currentExam: null,
  currentSubjectFilter: "",
};

const dom = {
  logoutBtn: document.getElementById("logoutBtn"),
  profileForm: document.getElementById("profileForm"),
  profileName: document.getElementById("profileName"),
  profileEmail: document.getElementById("profileEmail"),
  profilePlan: document.getElementById("profilePlan"),
  subjectSelect: document.getElementById("subjectSelect"),
  examSelect: document.getElementById("examSelect"),
  openExamBtn: document.getElementById("openExamBtn"),
  saveProgressBtn: document.getElementById("saveProgressBtn"),
  refreshCatalogBtn: document.getElementById("refreshCatalogBtn"),
  refreshHistoryBtn: document.getElementById("refreshHistoryBtn"),
  catalogStatus: document.getElementById("catalogStatus"),
  examModal: document.getElementById("examModal"),
  modalExamTitle: document.getElementById("modalExamTitle"),
  modalExamMeta: document.getElementById("modalExamMeta"),
  closeExamBtn: document.getElementById("closeExamBtn"),
  examFrame: document.getElementById("examFrame"),
  historyList: document.getElementById("historyList"),
};

function ensureSession() {
  if (!state.token) {
    window.location.href = "index.html";
  }
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`,
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = "index.html";
    }
    throw new Error(payload.detail || payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function uniqueSubjects(items) {
  return [...new Set(items.map((item) => item.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function setCatalogStatus(message) {
  dom.catalogStatus.textContent = message;
}

function populateSubjects() {
  const subjects = uniqueSubjects(state.catalog);
  dom.subjectSelect.innerHTML = '<option value="">Todas las asignaturas</option>';
  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    dom.subjectSelect.appendChild(option);
  });
  dom.subjectSelect.value = state.currentSubjectFilter;
}

function filteredCatalog() {
  if (!state.currentSubjectFilter) {
    return state.catalog;
  }
  return state.catalog.filter((item) => item.subject === state.currentSubjectFilter);
}

function populateExams() {
  const items = filteredCatalog();
  dom.examSelect.innerHTML = '<option value="">Selecciona un examen</option>';
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.examUid;
    option.textContent = `${item.examTitle} · ${item.totalQuestions || 0} preguntas`;
    dom.examSelect.appendChild(option);
  });

  const remembered = sessionStorage.getItem(SELECTED_EXAM_KEY);
  if (remembered && items.some((item) => item.examUid === remembered)) {
    dom.examSelect.value = remembered;
  }
}

function applyUser(user) {
  state.user = user;
  dom.profileName.value = user.name || "";
  dom.profileEmail.value = user.email || "";
  dom.profilePlan.value = user.plan || "free";
}

async function loadUser() {
  const payload = await api("/auth/me");
  applyUser(payload.user);
}

async function loadCatalog() {
  setCatalogStatus("Cargando catálogo privado...");
  const payload = await api("/catalog");
  const items = Array.isArray(payload.items) ? payload.items : [];
  state.catalog = items;
  populateSubjects();
  populateExams();
  setCatalogStatus(items.length ? `${items.length} exámenes disponibles.` : "No hay exámenes disponibles.");
}

async function loadHistory() {
  const payload = await api("/account/progress");
  const items = Array.isArray(payload.items) ? payload.items : [];
  dom.historyList.innerHTML = "";

  if (!items.length) {
    dom.historyList.innerHTML = '<p class="empty-state">Todavía no hay actividad guardada.</p>';
    return;
  }

  items.forEach((item) => {
    const node = document.createElement("article");
    node.className = "history-item";
    node.innerHTML = `
      <strong>${item.examTitle}</strong>
      <div>${item.subject}</div>
      <div>Puntuación: ${item.score ?? "sin corregir"}</div>
      <div>Actualizado: ${item.updatedAt || item.completedAt || "-"}</div>
    `;
    dom.historyList.appendChild(node);
  });
}

async function openSelectedExam() {
  const examUid = dom.examSelect.value;
  if (!examUid) {
    setCatalogStatus("Selecciona un examen para abrirlo.");
    return;
  }

  const selected = state.catalog.find((item) => item.examUid === examUid);
  if (!selected) {
    setCatalogStatus("No se encontró el examen seleccionado.");
    return;
  }

  try {
    await api(`/exams/${encodeURIComponent(examUid)}`);
    state.currentExam = selected;
    sessionStorage.setItem("selectedExamUid", selected.examUid);
    sessionStorage.setItem("selectedExamFile", `/docs/${selected.file}`);
    sessionStorage.setItem("selectedExamTitle", selected.examTitle);
    sessionStorage.setItem("selectedExamSubject", selected.subject);
    sessionStorage.setItem(SELECTED_EXAM_KEY, selected.examUid);
    
    dom.modalExamTitle.textContent = selected.examTitle;
    dom.modalExamMeta.textContent = `${selected.subject}${selected.partial ? ` · ${selected.partial}` : ""}`;
    dom.examFrame.src = `${window.location.origin}/docs/exam.html?source=subscription&examUid=${encodeURIComponent(selected.examUid)}`;
    dom.saveProgressBtn.disabled = false;
    
    if (dom.examModal && typeof dom.examModal.showModal === "function") {
      dom.examModal.showModal();
    }
  } catch (error) {
    console.error("Error opening exam:", error);
    setCatalogStatus(`Error al abrir examen: ${error.message}`);
  }
}

async function saveProgress() {
  if (!state.currentExam) {
    return;
  }

  try {
    const payload = {
      exam_uid: state.currentExam.examUid,
      exam_title: state.currentExam.examTitle,
      subject: state.currentExam.subject,
      answers: {},
      score: null,
    };

    await api("/account/progress", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await loadHistory();
    dom.modalExamMeta.textContent = `${dom.modalExamMeta.textContent} · progreso guardado`;
  } catch (error) {
    console.error("Error al guardar progreso:", error);
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const payload = {
    name: dom.profileName.value.trim(),
    plan: dom.profilePlan.value,
  };
  const result = await api("/account/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  applyUser(result.user);
}

async function logout() {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch {
    // ignore logout API failure and clear local state anyway
  }
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem("selectedExamUid");
  sessionStorage.removeItem("selectedExamFile");
  sessionStorage.removeItem("selectedExamTitle");
  sessionStorage.removeItem("selectedExamSubject");
  sessionStorage.removeItem(SELECTED_EXAM_KEY);
  window.location.href = "index.html";
}

function closeExamModal() {
  if (!dom.examModal) return;
  
  try {
    if (typeof dom.examModal.close === "function") {
      dom.examModal.close();
    }
    // Limpia el iframe de forma segura
    setTimeout(() => {
      if (dom.examFrame) {
        dom.examFrame.src = "about:blank";
      }
    }, 100);
    
    // Reset state
    state.currentExam = null;
    dom.saveProgressBtn.disabled = true;
  } catch (error) {
    console.error("Error closing exam modal:", error);
  }
}

function bindEvents() {
  dom.logoutBtn.addEventListener("click", logout);
  dom.profileForm.addEventListener("submit", saveProfile);
  dom.refreshCatalogBtn.addEventListener("click", loadCatalog);
  dom.refreshHistoryBtn.addEventListener("click", loadHistory);
  dom.subjectSelect.addEventListener("change", () => {
    state.currentSubjectFilter = dom.subjectSelect.value;
    populateExams();
  });
  dom.openExamBtn.addEventListener("click", openSelectedExam);
  dom.saveProgressBtn.addEventListener("click", saveProgress);
  
  // Close button handler
  if (dom.closeExamBtn) {
    dom.closeExamBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeExamModal();
    });
  }
  
  // Escape key handler
  if (dom.examModal) {
    dom.examModal.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeExamModal();
      }
    });
  }
}

async function initialize() {
  ensureSession();
  bindEvents();
  await loadUser();
  await loadCatalog();
  await loadHistory();
}

void initialize();
