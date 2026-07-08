const API_BASE = localStorage.getItem("ea_api_base") || `${window.location.origin}/api`;
const TOKEN_KEY = "ea_subscription_token";

const dom = {
  tabs: Array.from(document.querySelectorAll(".tab")),
  registerForm: document.getElementById("registerForm"),
  loginForm: document.getElementById("loginForm"),
  authMessage: document.getElementById("authMessage"),
  showRegister: document.getElementById("showRegister"),
  showLogin: document.getElementById("showLogin"),
};

function setMessage(message, type = "") {
  dom.authMessage.textContent = message;
  dom.authMessage.className = `message ${type}`.trim();
}

function setActiveTab(tab) {
  dom.tabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  dom.registerForm.classList.toggle("hidden", tab !== "register");
  dom.loginForm.classList.toggle("hidden", tab !== "login");
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
    throw new Error(payload.detail || payload.error || `HTTP ${response.status}`);
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
  dom.tabs.forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });

  dom.showRegister.addEventListener("click", () => setActiveTab("register"));
  dom.showLogin.addEventListener("click", () => setActiveTab("login"));

  dom.registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("Creando cuenta...");
    try {
      await submitAuth("/auth/register", dom.registerForm);
    } catch (error) {
      setMessage(error.message, "error");
    }
  });

  dom.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("Verificando acceso...");
    try {
      await submitAuth("/auth/login", dom.loginForm);
    } catch (error) {
      setMessage(error.message, "error");
    }
  });
}

function redirectIfLoggedIn() {
  if (localStorage.getItem(TOKEN_KEY)) {
    window.location.href = "app.html";
  }
}

redirectIfLoggedIn();
bindEvents();
