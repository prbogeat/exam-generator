(function initRuntimeAccess(global) {
  const BACKEND_PROBE_PATH = "/api/exams";

  function hasCapacitor() {
    return Boolean(global.Capacitor && typeof global.Capacitor.isNativePlatform === "function");
  }

  function isNativeApp() {
    return hasCapacitor() && global.Capacitor.isNativePlatform();
  }

  function isLocalHost() {
    const host = String(global.location && global.location.hostname ? global.location.hostname : "").toLowerCase();
    if (!host) {
      return false;
    }

    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
  }

  async function hasBackendApi() {
    try {
      const response = await fetch(BACKEND_PROBE_PATH, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        return false;
      }

      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      return contentType.includes("application/json");
    } catch (_error) {
      return false;
    }
  }

  async function canUseGenerators() {
    if (isNativeApp()) {
      return false;
    }

    if (isLocalHost()) {
      return true;
    }

    return hasBackendApi();
  }

  global.AppRuntimeAccess = {
    isNativeApp,
    isLocalHost,
    hasBackendApi,
    canUseGenerators,
  };
})(window);
