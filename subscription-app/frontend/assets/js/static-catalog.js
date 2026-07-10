(function () {
  const INDEX_FILE_NAME = "exams-index.json";
  const EXAMS_DIR_NAME = "exams";

  function supportsDirectoryPicker() {
    return typeof window.showDirectoryPicker === "function";
  }

  function sanitizePathSegment(value, fallback = "sin-nombre") {
    const normalized = String(value || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/[\s\-]+/g, "-")
      .replace(/\.+$/g, "")
      .trim()
      .replace(/^-+|-+$/g, "");

    return normalized || fallback;
  }

  function normalizeOutputFileName(value, fallback = "examen.json") {
    const fallbackBase = String(fallback || "examen.json").replace(/\.json$/i, "") || "examen";
    let fileName = sanitizePathSegment(value, fallbackBase);
    if (!/\.json$/i.test(fileName)) {
      fileName += ".json";
    }
    return fileName;
  }

  function extractPartialSegment(text) {
    const match = String(text || "").match(/parcial\s+(\d+)/i);
    return match ? `Parcial ${match[1]}` : "";
  }

  function buildRelativePath(options) {
    const presetParts = Array.isArray(options?.preset?.output_path_parts)
      ? options.preset.output_path_parts.filter(Boolean).map((part) => String(part))
      : [];
    const outputFileName = normalizeOutputFileName(
      options?.outputFileName,
      presetParts[presetParts.length - 1] || options?.examTitle || "examen.json",
    );

    if (presetParts.length > 0) {
      const dirParts = presetParts
        .slice(0, -1)
        .map((part) => sanitizePathSegment(part))
        .filter(Boolean);
      return [...dirParts, outputFileName];
    }

    const pathParts = [sanitizePathSegment(options?.subjectTitle, "Asignatura")];
    const partial = extractPartialSegment(options?.examTitle);
    if (partial) {
      pathParts.push(partial);
    }

    pathParts.push(outputFileName);
    return pathParts;
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

  function normalizeExamForPublication(examJson, relativePath) {
    const questions = Array.isArray(examJson?.questions) ? examJson.questions : [];
    const normalized = {
      ...examJson,
      subjectTitle: relativePath[0] || String(examJson?.subjectTitle || "Asignatura"),
      totalQuestions: questions.length,
    };

    if (normalized.scoring && typeof normalized.scoring === "object") {
      const maxScore = Number(normalized.scoring.maxScore || 10);
      const penalty = Number(normalized.scoring.wrongAnswersPerDiscountedCorrect || 0);
      normalized.scoring = {
        ...normalized.scoring,
        formulaTip: buildFormulaTip(questions.length, penalty, maxScore),
      };
    }

    return normalized;
  }

  async function writeJsonFile(directoryHandle, fileName, payload) {
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
  }

  async function getExamsRootHandle(catalogRootHandle) {
    return catalogRootHandle.getDirectoryHandle(EXAMS_DIR_NAME, { create: true });
  }

  async function writeExamFile(catalogRootHandle, relativePath, examJson) {
    let currentHandle = await getExamsRootHandle(catalogRootHandle);

    for (const segment of relativePath.slice(0, -1)) {
      currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true });
    }

    await writeJsonFile(currentHandle, relativePath[relativePath.length - 1], examJson);
  }

  async function collectJsonFiles(directoryHandle, prefix = []) {
    const results = [];

    for await (const entry of directoryHandle.values()) {
      if (entry.kind === "directory") {
        const nested = await collectJsonFiles(entry, [...prefix, entry.name]);
        results.push(...nested);
        continue;
      }

      if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".json")) {
        results.push({ fileHandle: entry, relativePath: [...prefix, entry.name] });
      }
    }

    return results;
  }

  async function readJsonFile(fileHandle) {
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text());
  }

  function isPublicExam(relativePath, payload) {
    const lowerPath = relativePath.map((segment) => String(segment || "").toLowerCase());
    const fileStem = String(relativePath[relativePath.length - 1] || "").replace(/\.json$/i, "").toLowerCase();

    if (!payload || typeof payload !== "object") {
      return false;
    }

    if (!Array.isArray(payload.questions) || !payload.scoring || typeof payload.scoring !== "object") {
      return false;
    }

    if (!payload.subjectTitle || !payload.examTitle) {
      return false;
    }

    if (lowerPath.some((segment) => segment.includes("hecho") || segment.includes("correcion") || segment.includes("correccion"))) {
      return false;
    }

    if (fileStem.includes("realizado")) {
      return false;
    }

    return true;
  }

  function buildPublicFileUrl(relativePath) {
    return `assets/json/${EXAMS_DIR_NAME}/${relativePath.map((segment) => encodeURIComponent(segment)).join("/")}`;
  }

  function buildCatalogEntry(relativePath, payload) {
    const questions = Array.isArray(payload.questions) ? payload.questions : [];
    return {
      examUid: relativePath.join("/"),
      subject: String(relativePath[0] || payload.subjectTitle || "Asignatura"),
      partial: relativePath.find((segment) => /^parcial[\s-]\d+$/i.test(String(segment || "").trim())) || "",
      examTitle: String(payload.examTitle || "Examen"),
      subtitle: String(payload.subtitle || ""),
      totalQuestions: Number(payload.totalQuestions || questions.length || 0),
      file: buildPublicFileUrl(relativePath),
      sourcePath: `out/examenes/${relativePath.join("/")}`,
    };
  }

  function sortCatalogEntries(left, right) {
    return [left.subject, left.partial, left.examTitle, left.examUid]
      .join("\u0000")
      .localeCompare([right.subject, right.partial, right.examTitle, right.examUid].join("\u0000"), "es");
  }

  async function rebuildCatalogIndex(catalogRootHandle) {
    const examsRootHandle = await getExamsRootHandle(catalogRootHandle);
    const jsonFiles = await collectJsonFiles(examsRootHandle);
    const items = [];

    for (const item of jsonFiles) {
      try {
        const payload = await readJsonFile(item.fileHandle);
        if (!isPublicExam(item.relativePath, payload)) {
          continue;
        }
        items.push(buildCatalogEntry(item.relativePath, payload));
      } catch (_error) {
        // Ignora archivos rotos para no bloquear la regeneración del índice.
      }
    }

    items.sort(sortCatalogEntries);

    const indexPayload = {
      generatedAt: new Date().toISOString(),
      count: items.length,
      defaultExamUid: items[0]?.examUid || "",
      items,
    };

    await writeJsonFile(catalogRootHandle, INDEX_FILE_NAME, indexPayload);
    return indexPayload;
  }

  async function publishExamToCatalog(catalogRootHandle, examJson, options) {
    if (!catalogRootHandle) {
      throw new Error("Falta la carpeta local del catálogo.");
    }

    const relativePath = buildRelativePath(options);
    const normalizedExam = normalizeExamForPublication(examJson, relativePath);
    await writeExamFile(catalogRootHandle, relativePath, normalizedExam);
    const indexPayload = await rebuildCatalogIndex(catalogRootHandle);

    return {
      relativePath: `${EXAMS_DIR_NAME}/${relativePath.join("/")}`,
      fileName: relativePath[relativePath.length - 1],
      count: indexPayload.count,
      defaultExamUid: indexPayload.defaultExamUid,
      normalizedExam,
    };
  }

  function buildCatalogHint(catalogRootHandle) {
    if (!catalogRootHandle) {
      return "Sin carpeta de catálogo elegida. Selecciona localmente docs/assets/json para publicar y regenerar el índice.";
    }

    return `Catálogo local seleccionado: ${catalogRootHandle.name}. Se escribirá exams-index.json y la carpeta exams/.`;
  }

  window.StaticExamCatalog = {
    supportsDirectoryPicker,
    normalizeOutputFileName,
    buildRelativePath,
    buildCatalogHint,
    publishExamToCatalog,
  };
})();