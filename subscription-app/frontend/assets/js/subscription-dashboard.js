// Try to detect backend URL from port configuration
function getAPIBase() {
  const url = new URL(window.location.href);
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const localBackendBase = `${url.protocol}//${url.hostname}:8010/api`;

  // On remote (non-localhost) always derive the API base from the current origin.
  // Never use a stored value on remote: it may point to localhost from a previous
  // local dev session and would cause all requests to fail with network errors.
  if (!isLocalHost) {
    return `${window.location.origin}/api`;
  }

  const stored = localStorage.getItem("ea_api_base");
  if (stored) {
    try {
      const storedUrl = new URL(stored);
      if (["localhost", "127.0.0.1", "::1"].includes(storedUrl.hostname) && storedUrl.port === "8010") {
        return stored;
      }
    } catch (_error) {
      // Ignore malformed storage values and keep auto-detection.
    }
  }

  if (url.port !== "8010") {
    return localBackendBase;
  }

  return `${window.location.origin}/api`;
}

const API_BASE = getAPIBase();
const TOKEN_KEY = "ea_subscription_token";
const SELECTED_EXAM_KEY = "ea_selected_exam_uid";

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  user: null,
  catalog: [],
  favorites: [],
  adminUsers: [],
  currentExam: null,
  currentSubjectFilter: "",
  currentPartialFilter: "",
};

let lastFocusedElement = null;

const dom = {
  logoutBtn: document.getElementById("logoutBtn"),
  profileForm: document.getElementById("profileForm"),
  profileName: document.getElementById("profileName"),
  profileEmail: document.getElementById("profileEmail"),
  profilePlan: document.getElementById("profilePlan"),
  subjectSelect: document.getElementById("subjectSelect"),
  partialSelect: document.getElementById("partialSelect"),
  examSelect: document.getElementById("examSelect"),
  openExamBtn: document.getElementById("openExamBtn"),
  toggleFavoriteBtn: document.getElementById("toggleFavoriteBtn"),
  saveProgressBtn: document.getElementById("saveProgressBtn"),
  refreshCatalogBtn: document.getElementById("refreshCatalogBtn"),
  refreshHistoryBtn: document.getElementById("refreshHistoryBtn"),
  refreshFavoritesBtn: document.getElementById("refreshFavoritesBtn"),
  catalogStatus: document.getElementById("catalogStatus"),
  examModal: document.getElementById("examModal"),
  examModalBackdrop: document.getElementById("examModalBackdrop"),
  modalExamTitle: document.getElementById("modalExamTitle"),
  modalExamMeta: document.getElementById("modalExamMeta"),
  closeExamBtn: document.getElementById("closeExamBtn"),
  examFrame: document.getElementById("examFrame"),
  historyList: document.getElementById("historyList"),
  favoritesList: document.getElementById("favoritesList"),
  adminTabs: document.getElementById("adminTabs"),
  adminTabButtons: Array.from(document.querySelectorAll(".dashboard-tab")),
  catalogTabBtn: document.getElementById("catalogTabBtn"),
  adminTabBtn: document.getElementById("adminTabBtn"),
  catalogPanel: document.getElementById("catalogPanel"),
  adminPanel: document.getElementById("adminPanel"),
  adminCreateUserForm: document.getElementById("adminCreateUserForm"),
  adminUsersStatus: document.getElementById("adminUsersStatus"),
  adminUsersList: document.getElementById("adminUsersList"),
  refreshAdminUsersBtn: document.getElementById("refreshAdminUsersBtn"),
};

// Log missing elements for debugging
Object.entries(dom).forEach(([key, el]) => {
  if (!el) console.warn(`Missing DOM element: ${key}`);
});

function ensureSession() {
  if (!state.token) {
    window.location.href = "index.html";
  }
}

function openExamModal() {
  if (!dom.examModal) {
    return;
  }

  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  dom.examModal.classList.add("visible");
  dom.examModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  if (dom.closeExamBtn) {
    dom.closeExamBtn.focus();
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
      return {};
    }
    throw new Error(payload.detail || payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function uniqueSubjects(items) {
  return [...new Set(items.map((item) => item.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function uniquePartials(items) {
  return [...new Set(items.map((item) => item.partial).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function formatPlanLabel(plan) {
  const value = String(plan || "free").toLowerCase();
  if (value === "premium") return "Premium";
  if (value === "pro") return "Pro";
  return "Free";
}

function userIsAdmin() {
  return state.user && state.user.role === "admin";
}

function setCenterPanel(panelName) {
  const resolvedPanelName = panelName === "admin" && !userIsAdmin() ? "catalog" : panelName;

  if (dom.catalogPanel) {
    const showCatalog = resolvedPanelName === "catalog";
    dom.catalogPanel.hidden = !showCatalog;
    dom.catalogPanel.classList.toggle("active", showCatalog);
  }

  if (dom.adminPanel) {
    const showAdmin = resolvedPanelName === "admin" && userIsAdmin();
    dom.adminPanel.hidden = !showAdmin;
    dom.adminPanel.classList.toggle("active", showAdmin);
  }

  dom.adminTabButtons.forEach((button) => {
    const isActive = button.dataset.panel === resolvedPanelName;
    button.classList.toggle("active", isActive);
    if (button.dataset.panel === "admin") {
      const shouldHideAdminButton = !userIsAdmin();
      button.hidden = shouldHideAdminButton;
      button.setAttribute("aria-hidden", shouldHideAdminButton.toString());
    }
  });

  if (dom.adminTabs) {
    dom.adminTabs.classList.toggle("single-tab", !userIsAdmin());
  }
}

function setCatalogStatus(message) {
  if (dom.catalogStatus) dom.catalogStatus.textContent = message;
}

function formatDateTimeEs(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatScoreEs(value) {
  if (value === null || value === undefined || value === "") {
    return "sin corregir";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "sin corregir";
  }

  return numeric.toLocaleString("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function populateSubjects() {
  if (!dom.subjectSelect) return;
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

function populatePartials() {
  if (!dom.partialSelect) return;
  const items = state.currentSubjectFilter
    ? state.catalog.filter((item) => item.subject === state.currentSubjectFilter)
    : state.catalog;
  const partials = uniquePartials(items);

  dom.partialSelect.innerHTML = '<option value="">Todos los parciales</option>';
  partials.forEach((partial) => {
    const option = document.createElement("option");
    option.value = partial;
    option.textContent = partial;
    dom.partialSelect.appendChild(option);
  });

  if (state.currentPartialFilter && partials.includes(state.currentPartialFilter)) {
    dom.partialSelect.value = state.currentPartialFilter;
  } else {
    state.currentPartialFilter = "";
    dom.partialSelect.value = "";
  }
}

function filteredCatalog() {
  return state.catalog.filter((item) => {
    const subjectOk = !state.currentSubjectFilter || item.subject === state.currentSubjectFilter;
    const partialOk = !state.currentPartialFilter || item.partial === state.currentPartialFilter;
    return subjectOk && partialOk;
  });
}

function populateExams() {
  if (!dom.examSelect) return;
  const items = filteredCatalog();
  dom.examSelect.innerHTML = '<option value="">Selecciona un examen</option>';
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.examUid;
    option.textContent = `${item.examTitle} · ${item.totalQuestions || 0} preguntas · ${formatPlanLabel(item.accessLevel)}`;
    dom.examSelect.appendChild(option);
  });

  const remembered = sessionStorage.getItem(SELECTED_EXAM_KEY);
  if (remembered && items.some((item) => item.examUid === remembered)) {
    dom.examSelect.value = remembered;
  }

  updateFavoriteButton();
}

function isFavoriteExam(examUid) {
  return state.favorites.some((item) => item.examUid === examUid);
}

function updateFavoriteButton() {
  if (!dom.examSelect || !dom.toggleFavoriteBtn) return;
  const examUid = dom.examSelect.value;
  const favorite = examUid && isFavoriteExam(examUid);
  dom.toggleFavoriteBtn.disabled = !examUid;
  if (dom.toggleFavoriteBtn) dom.toggleFavoriteBtn.textContent = favorite ? "Quitar favorito" : "Añadir favorito";
}

function applyUser(user) {
  state.user = user;
  if (dom.profileName) dom.profileName.value = user.name || "";
  if (dom.profileEmail) dom.profileEmail.value = user.email || "";
  if (dom.profilePlan) dom.profilePlan.value = formatPlanLabel(user.plan);

  if (dom.adminTabBtn) {
    const shouldHideAdminButton = !userIsAdmin();
    dom.adminTabBtn.hidden = shouldHideAdminButton;
    dom.adminTabBtn.setAttribute("aria-hidden", shouldHideAdminButton.toString());
  }

  if (userIsAdmin()) {
    setCenterPanel("catalog");
  } else {
    state.adminUsers = [];
    if (dom.adminUsersList) {
      dom.adminUsersList.innerHTML = '<p class="empty-state">Solo el admin puede gestionar usuarios.</p>';
    }
    setCenterPanel("catalog");
  }
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
  populatePartials();
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
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "history-open";
    openButton.textContent = item.examTitle;
    openButton.addEventListener("click", () => {
      loadSavedProgress(item.examUid);
    });

    const subject = document.createElement("div");
    subject.textContent = item.subject;

    const score = document.createElement("div");
    score.textContent = `Puntuación: ${formatScoreEs(item.score)}`;

    const updated = document.createElement("div");
    updated.textContent = `Actualizado: ${formatDateTimeEs(item.updatedAt || item.completedAt)}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "secondary history-remove";
    removeButton.textContent = "Quitar";
    removeButton.addEventListener("click", async () => {
      removeButton.disabled = true;
      removeButton.textContent = "Quitando...";
      try {
        await removeProgress(item.examUid);
        node.remove();
      } catch (err) {
        removeButton.disabled = false;
        removeButton.textContent = "Quitar";
        const errMsg = document.createElement("span");
        errMsg.className = "history-remove-error";
        errMsg.textContent = `Error: ${err.message}`;
        node.appendChild(errMsg);
      }
    });

    node.appendChild(openButton);
    node.appendChild(subject);
    node.appendChild(score);
    node.appendChild(updated);
    node.appendChild(removeButton);
    dom.historyList.appendChild(node);
  });
}

async function loadFavorites() {
  const payload = await api("/account/favorites");
  state.favorites = Array.isArray(payload.items) ? payload.items : [];
  renderFavorites();
  updateFavoriteButton();
}

function renderFavorites() {
  dom.favoritesList.innerHTML = "";

  if (!state.favorites.length) {
    dom.favoritesList.innerHTML = '<p class="empty-state">Todavía no hay favoritos.</p>';
    return;
  }

  const grouped = new Map();
  state.favorites.forEach((item) => {
    const key = item.subject || "Sin asignatura";
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(item);
  });

  [...grouped.entries()].forEach(([subject, items]) => {
    const section = document.createElement("section");
    section.className = "favorite-group";

    const heading = document.createElement("h3");
    heading.className = "favorite-group-title";
    heading.textContent = subject;
    section.appendChild(heading);

    items.forEach((item) => {
      const row = document.createElement("article");
      row.className = "history-item favorite-item";

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "history-open";
      openButton.textContent = item.partial ? `${item.examTitle} · ${item.partial}` : item.examTitle;
      openButton.addEventListener("click", () => {
        openExamByCatalogItem(item.examUid);
      });

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "secondary favorite-remove";
      removeButton.textContent = "Quitar";
      removeButton.addEventListener("click", () => {
        removeFavorite(item.examUid);
      });

      row.appendChild(openButton);
      row.appendChild(removeButton);
      section.appendChild(row);
    });

    dom.favoritesList.appendChild(section);
  });
}

function buildRealizedAnswersPayload(answers, examTitle) {
  return {
    type: examTitle || "examen realizado",
    questions: Object.entries(answers || {}).map(([questionId, markedOption]) => ({
      id: questionId,
      marked_option: markedOption,
    })),
  };
}

async function openExamByCatalogItem(examUid) {
  const item = state.catalog.find((entry) => entry.examUid === examUid);
  if (!item) {
    setCatalogStatus("No se encontró el examen en el catálogo.");
    return;
  }

  if (item.subject) {
    state.currentSubjectFilter = item.subject;
    populateSubjects();
  }
  state.currentPartialFilter = item.partial || "";
  populatePartials();
  populateExams();
  dom.examSelect.value = item.examUid;
  updateFavoriteButton();
  await openSelectedExam();
}

async function loadSavedProgress(examUid) {
  try {
    const payload = await api(`/account/progress-detail?exam_uid=${encodeURIComponent(examUid)}`);
    const item = payload.item || {};
    if (item.answers) {
      sessionStorage.setItem(
        "subscriptionSavedAnswers",
        JSON.stringify(buildRealizedAnswersPayload(item.answers, item.examTitle))
      );
      sessionStorage.setItem(
        "subscriptionSavedAnswersLabel",
        `actividad guardada · ${formatDateTimeEs(item.updatedAt || item.completedAt)}`
      );
    }
    // If the exam was previously graded (has a score), restore the corrected state
    if (item.score != null) {
      sessionStorage.setItem("subscriptionAutoSubmit", "true");
    } else {
      sessionStorage.removeItem("subscriptionAutoSubmit");
    }
    await openExamByCatalogItem(item.examUid);
  } catch (error) {
    setCatalogStatus(`No se pudo recuperar progreso: ${error.message}`);
  }
}

async function toggleFavorite() {
  const examUid = dom.examSelect.value;
  if (!examUid) {
    return;
  }

  const selected = state.catalog.find((item) => item.examUid === examUid);
  if (!selected) {
    return;
  }

  if (isFavoriteExam(examUid)) {
    await removeFavorite(examUid);
    return;
  }

  try {
    await api("/account/favorites", {
      method: "POST",
      body: JSON.stringify({
        exam_uid: selected.examUid,
        exam_title: selected.examTitle,
        subject: selected.subject,
        partial: selected.partial || null,
        file: selected.file || null,
      }),
    });
    await loadFavorites();
    setCatalogStatus("Examen añadido a favoritos.");
  } catch (error) {
    setCatalogStatus(`No se pudo guardar favorito: ${error.message}`);
  }
}

async function removeFavorite(examUid) {
  try {
    await api(`/account/favorite?exam_uid=${encodeURIComponent(examUid)}`, {
      method: "DELETE",
    });
    await loadFavorites();
    setCatalogStatus("Examen quitado de favoritos.");
  } catch (error) {
    setCatalogStatus(`No se pudo quitar favorito: ${error.message}`);
  }
}

async function removeProgress(examUid) {
  if (!examUid) {
    return;
  }

  await api(`/account/progress?exam_uid=${encodeURIComponent(examUid)}`, {
    method: "DELETE",
  });

  if (state.currentExam && state.currentExam.examUid === examUid) {
    closeExamModal();
  }
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
    await api(`/exam?exam_uid=${encodeURIComponent(examUid)}`);
    state.currentExam = selected;
    sessionStorage.setItem("selectedExamUid", selected.examUid);
    sessionStorage.setItem("selectedExamFile", selected.file);
    sessionStorage.setItem("selectedExamTitle", selected.examTitle);
    sessionStorage.setItem("selectedExamSubject", selected.subject);
    sessionStorage.setItem(SELECTED_EXAM_KEY, selected.examUid);
    
    dom.modalExamTitle.textContent = selected.examTitle;
    dom.modalExamMeta.textContent = `${selected.subject}${selected.partial ? ` · ${selected.partial}` : ""}`;
    const examPageUrl = new URL("exam.html", window.location.href);
    examPageUrl.searchParams.set("source", "subscription");
    examPageUrl.searchParams.set("examUid", selected.examUid);
    dom.examFrame.src = examPageUrl.toString();
    if (dom.saveProgressBtn) dom.saveProgressBtn.disabled = false;
    
    openExamModal();
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
    const snapshot = dom.examFrame && dom.examFrame.contentWindow && dom.examFrame.contentWindow.ExamAppBridge
      ? dom.examFrame.contentWindow.ExamAppBridge.getSnapshot()
      : { answers: {}, score: null, submitted: false };

    let normalizedScore = null;
    if (snapshot && snapshot.score != null) {
      const numericScore = Number(snapshot.score);
      if (Number.isFinite(numericScore)) {
        normalizedScore = numericScore;
      }
    }

    if (normalizedScore === null && snapshot && snapshot.submitted && dom.examFrame && dom.examFrame.contentWindow) {
      const gradeNode = dom.examFrame.contentWindow.document.getElementById("gradeBox");
      const gradeText = gradeNode ? String(gradeNode.textContent || "").trim() : "";
      const fallback = Number(gradeText.replace(",", "."));
      if (Number.isFinite(fallback)) {
        normalizedScore = fallback;
      }
    }

    const payload = {
      exam_uid: state.currentExam.examUid,
      exam_title: state.currentExam.examTitle,
      subject: state.currentExam.subject,
      answers: (snapshot && snapshot.answers) || {},
      score: normalizedScore,
      completed_at: snapshot && snapshot.submitted ? new Date().toISOString() : null,
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
  };
  const result = await api("/account/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  applyUser(result.user);
}

function setAdminUsersStatus(message) {
  if (dom.adminUsersStatus) {
    dom.adminUsersStatus.textContent = message;
  }
}

function renderAdminUsers() {
  if (!dom.adminUsersList) {
    return;
  }

  dom.adminUsersList.innerHTML = "";

  if (!state.adminUsers.length) {
    dom.adminUsersList.innerHTML = '<p class="empty-state">No hay usuarios registrados.</p>';
    return;
  }

  state.adminUsers.forEach((user) => {
    const card = document.createElement("article");
    card.className = "history-item admin-user-item";

    const email = document.createElement("div");
    email.className = "admin-user-email";
    email.textContent = `${user.email}${user.role === "admin" ? " · Admin" : ""}`;

    const editor = document.createElement("div");
    editor.className = "admin-user-editor";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = user.name || "";
    nameInput.minLength = 2;
    nameInput.disabled = user.role === "admin";

    const planSelect = document.createElement("select");
    ["free", "pro", "premium"].forEach((plan) => {
      const option = document.createElement("option");
      option.value = plan;
      option.textContent = formatPlanLabel(plan);
      if (user.plan === plan) {
        option.selected = true;
      }
      planSelect.appendChild(option);
    });
    planSelect.disabled = user.role === "admin";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "secondary";
    saveButton.textContent = "Guardar";
    saveButton.disabled = user.role === "admin";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "secondary admin-delete-btn";
    deleteButton.textContent = "Borrar";
    deleteButton.disabled = user.role === "admin";

    saveButton.addEventListener("click", async () => {
      const payload = {
        name: nameInput.value.trim(),
        plan: planSelect.value,
      };

      if (!payload.name || payload.name.length < 2) {
        setAdminUsersStatus("El nombre debe tener al menos 2 caracteres.");
        return;
      }

      saveButton.disabled = true;
      saveButton.textContent = "Guardando...";
      try {
        await api(`/admin/users/${user.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setAdminUsersStatus("Usuario actualizado.");
        await loadAdminUsers();
      } catch (error) {
        setAdminUsersStatus(`No se pudo actualizar: ${error.message}`);
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Guardar";
      }
    });

    deleteButton.addEventListener("click", async () => {
      const confirmed = window.confirm(`¿Seguro que quieres borrar a ${user.email}?`);
      if (!confirmed) {
        return;
      }

      deleteButton.disabled = true;
      deleteButton.textContent = "Borrando...";
      try {
        await api(`/admin/users/${user.id}`, { method: "DELETE" });
        setAdminUsersStatus("Usuario eliminado.");
        await loadAdminUsers();
      } catch (error) {
        setAdminUsersStatus(`No se pudo borrar: ${error.message}`);
      } finally {
        deleteButton.disabled = false;
        deleteButton.textContent = "Borrar";
      }
    });

    editor.appendChild(nameInput);
    editor.appendChild(planSelect);
    editor.appendChild(saveButton);
    editor.appendChild(deleteButton);

    card.appendChild(email);
    card.appendChild(editor);
    dom.adminUsersList.appendChild(card);
  });
}

async function loadAdminUsers() {
  if (!userIsAdmin()) {
    return;
  }

  setAdminUsersStatus("Cargando usuarios...");
  const payload = await api("/admin/users");
  state.adminUsers = Array.isArray(payload.items) ? payload.items : [];
  renderAdminUsers();
  setAdminUsersStatus(`${state.adminUsers.length} usuario(s) cargado(s).`);
}

async function createAdminUser(event) {
  event.preventDefault();
  if (!userIsAdmin() || !dom.adminCreateUserForm) {
    return;
  }

  const formData = new FormData(dom.adminCreateUserForm);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    password: String(formData.get("password") || ""),
    plan: String(formData.get("plan") || "free"),
  };

  setAdminUsersStatus("Creando usuario...");
  try {
    await api("/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    dom.adminCreateUserForm.reset();
    const planSelect = dom.adminCreateUserForm.querySelector("select[name='plan']");
    if (planSelect) {
      planSelect.value = "free";
    }
    setAdminUsersStatus("Usuario creado correctamente.");
    await loadAdminUsers();
  } catch (error) {
    setAdminUsersStatus(`No se pudo crear: ${error.message}`);
  }
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
  sessionStorage.removeItem("subscriptionSavedAnswers");
  sessionStorage.removeItem("subscriptionSavedAnswersLabel");
  sessionStorage.removeItem("subscriptionAutoSubmit");
  window.location.href = "index.html";
}

function closeExamModal() {
  if (!dom.examModal) return;

  try {
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement && dom.examModal.contains(activeEl)) {
      activeEl.blur();
    }

    if (dom.examFrame) {
      dom.examFrame.src = "about:blank";
    }

    dom.examModal.classList.remove("visible");
    dom.examModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";

    state.currentExam = null;
    if (dom.saveProgressBtn) dom.saveProgressBtn.disabled = true;

    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    } else if (dom.openExamBtn) {
      dom.openExamBtn.focus();
    }
    lastFocusedElement = null;
  } catch (error) {
    console.error("Error closing exam modal:", error);
  }
}

function resetExamModalState() {
  if (dom.examFrame) {
    dom.examFrame.src = "about:blank";
  }
  state.currentExam = null;
  if (dom.saveProgressBtn) dom.saveProgressBtn.disabled = true;
  if (dom.examModal) {
    dom.examModal.classList.remove("visible");
    dom.examModal.setAttribute("aria-hidden", "true");
  }
  document.body.style.overflow = "";
}

function bindEvents() {
  if (dom.logoutBtn) dom.logoutBtn.addEventListener("click", logout);
  if (dom.profileForm) dom.profileForm.addEventListener("submit", saveProfile);
  if (dom.refreshCatalogBtn) dom.refreshCatalogBtn.addEventListener("click", loadCatalog);
  if (dom.refreshHistoryBtn) dom.refreshHistoryBtn.addEventListener("click", loadHistory);
  if (dom.refreshFavoritesBtn) dom.refreshFavoritesBtn.addEventListener("click", loadFavorites);
  if (dom.subjectSelect) dom.subjectSelect.addEventListener("change", () => {
    state.currentSubjectFilter = dom.subjectSelect.value;
    state.currentPartialFilter = "";
    populatePartials();
    populateExams();
  });
  if (dom.partialSelect) dom.partialSelect.addEventListener("change", () => {
    state.currentPartialFilter = dom.partialSelect.value;
    populateExams();
  });
  if (dom.examSelect) dom.examSelect.addEventListener("change", updateFavoriteButton);
  if (dom.openExamBtn) dom.openExamBtn.addEventListener("click", openSelectedExam);
  if (dom.toggleFavoriteBtn) dom.toggleFavoriteBtn.addEventListener("click", toggleFavorite);
  if (dom.saveProgressBtn) dom.saveProgressBtn.addEventListener("click", saveProgress);
  if (dom.adminCreateUserForm) dom.adminCreateUserForm.addEventListener("submit", createAdminUser);
  if (dom.refreshAdminUsersBtn) dom.refreshAdminUsersBtn.addEventListener("click", loadAdminUsers);
  dom.adminTabButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const panelName = button.dataset.panel === "admin" ? "admin" : "catalog";
      if (panelName === "admin" && !userIsAdmin()) {
        setCenterPanel("catalog");
        return;
      }
      setCenterPanel(panelName);
      if (panelName === "admin" && userIsAdmin()) {
        await loadAdminUsers();
      }
    });
  });
  
  // Close button handler
  if (dom.closeExamBtn) {
    dom.closeExamBtn.addEventListener("click", closeExamModal);
  }
  
  if (dom.examModal) {
    dom.examModal.addEventListener("click", (event) => {
      if (event.target === dom.examModal || event.target === dom.examModalBackdrop) {
        closeExamModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dom.examModal && dom.examModal.classList.contains("visible")) {
      closeExamModal();
    }
  });
}

async function initialize() {
  ensureSession();
  bindEvents();
  setCenterPanel("catalog");
  try {
    await loadUser();
  } catch (error) {
    // If the token was already removed (401 → redirect in progress) do nothing.
    if (!localStorage.getItem(TOKEN_KEY)) {
      return;
    }
    // Network or server error: show a recoverable error and offer logout.
    setCatalogStatus(`No se pudo conectar con el servidor: ${error.message}. Intenta recargar o cerrar sesión.`);
    return;
  }
  if (userIsAdmin()) {
    await loadAdminUsers();
  }
  await Promise.allSettled([loadCatalog(), loadHistory(), loadFavorites()]);
}

// Esperar a que el DOM esté completamente listo
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
