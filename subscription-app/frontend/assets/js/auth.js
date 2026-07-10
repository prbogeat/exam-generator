// Try to detect backend URL from port configuration
function getAPIBase() {
  const url = new URL(window.location.href);
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const localBackendBase = `${url.protocol}//${url.hostname}:8010/api`;

  const stored = localStorage.getItem("ea_api_base");
  if (stored) {
    // Avoid using stale local values that point to the static frontend server.
    if (!isLocalHost) {
      return stored;
    }

    try {
      const storedUrl = new URL(stored);
      if (["localhost", "127.0.0.1", "::1"].includes(storedUrl.hostname) && storedUrl.port === "8010") {
        return stored;
      }
    } catch (_error) {
      // Ignore malformed storage values and keep auto-detection.
    }

    return localBackendBase;
  }

  if (isLocalHost && url.port !== "8010") {
    return localBackendBase;
  }

  return `${window.location.origin}/api`;
}

const API_BASE = getAPIBase();
const TOKEN_KEY = "ea_subscription_token";

const dom = {
  tabs: Array.from(document.querySelectorAll(".tab")),
  registerForm: document.getElementById("registerForm"),
  loginForm: document.getElementById("loginForm"),
  authMessage: document.getElementById("authMessage"),
  authPanel: document.querySelector(".auth-panel"),
  showRegister: document.getElementById("showRegister"),
  showLogin: document.getElementById("showLogin"),
};

function setMessage(message, type = "") {
  dom.authMessage.textContent = message;
  dom.authMessage.className = `message ${type} ${message ? "show" : ""}`.trim();
}

function setActiveTab(tab) {
  dom.tabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  
  // Mostrar/ocultar formularios usando clases active y hidden
  if (tab === "register") {
    dom.registerForm.classList.add("active");
    dom.registerForm.classList.remove("hidden");
    dom.loginForm.classList.remove("active");
    dom.loginForm.classList.add("hidden");
  } else if (tab === "login") {
    dom.loginForm.classList.add("active");
    dom.loginForm.classList.remove("hidden");
    dom.registerForm.classList.remove("active");
    dom.registerForm.classList.add("hidden");
  }
  
  // Mostrar el panel de autenticación cuando se activa una pestaña
  if (dom.authPanel) {
    dom.authPanel.classList.add("active");
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    let message;
    if (Array.isArray(payload.detail)) {
      // Pydantic 422 validation errors
      message = payload.detail.map((e) => e.msg).join(", ");
    } else {
      message = payload.detail || payload.error || `HTTP ${response.status}`;
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function submitAuth(path, form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const result = await request(path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  localStorage.setItem(TOKEN_KEY, result.token);
  window.location.href = "app.html";
}

function bindEvents() {
  // Validar que los elementos existan
  if (!dom.showRegister || !dom.showLogin) {
    console.error("❌ Elementos de botones no encontrados", { showRegister: dom.showRegister, showLogin: dom.showLogin });
    return;
  }

  dom.tabs.forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });

  dom.showRegister.addEventListener("click", (e) => {
    e.preventDefault();
    setActiveTab("register");
  });
  
  dom.showLogin.addEventListener("click", (e) => {
    e.preventDefault();
    setActiveTab("login");
  });

  if (dom.registerForm) {
    dom.registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("Creando cuenta...");
      try {
        await submitAuth("/auth/register", dom.registerForm);
      } catch (error) {
        if (error.status === 409) {
          setActiveTab("login");
          setMessage("Ese email ya existe. Inicia sesion.", "error");
          return;
        }
        setMessage(error.message, "error");
      }
    });
  }

  if (dom.loginForm) {
    dom.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("Verificando acceso...");
      try {
        await submitAuth("/auth/login", dom.loginForm);
      } catch (error) {
        if (error.status === 401) {
          setMessage("Email o contraseña incorrectos.", "error");
        } else if (error.status === 422) {
          setMessage("La contraseña debe tener al menos 8 caracteres.", "error");
        } else {
          setMessage(error.message, "error");
        }
      }
    });
  }
}

function redirectIfLoggedIn() {
  if (localStorage.getItem(TOKEN_KEY)) {
    window.location.href = "app.html";
  }
}

redirectIfLoggedIn();
console.log("✅ Inicializando auth...", { 
  apiBase: API_BASE,
  dom: {
    showRegister: !!dom.showRegister,
    showLogin: !!dom.showLogin,
    authPanel: !!dom.authPanel,
    registerForm: !!dom.registerForm,
    loginForm: !!dom.loginForm,
    tabs: dom.tabs.length
  }
});
bindEvents();
