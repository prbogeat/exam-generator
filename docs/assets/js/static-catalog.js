(function () {
  const INDEX_FILE_NAME = "exams-index.json";
  const EXAMS_DIR_NAME = "exams";
  const DEFAULT_DEGREE_TITLE = "Grado en Psicología";
  const DEFAULT_COURSE_TITLE = "1º";

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

  function normalizePartialLabel(value) {
    const text = String(value || "").trim();
    const match = text.match(/^parcial[\s-]+(\d+)$/i);
    return match ? `Parcial ${match[1]}` : text;
  }

  function looksLikeCourseSegment(value) {
    return /^\d+\s*(?:º|°|o)?$/i.test(String(value || "").trim());
  }

  function resolveHierarchy(options, examJson) {
    const degreeTitle = String(
      options?.degreeTitle || options?.preset?.degreeTitle || examJson?.degreeTitle || DEFAULT_DEGREE_TITLE,
    ).trim() || DEFAULT_DEGREE_TITLE;
    const courseTitle = String(
      options?.courseTitle || options?.preset?.courseTitle || examJson?.courseTitle || DEFAULT_COURSE_TITLE,
    ).trim() || DEFAULT_COURSE_TITLE;
    const subjectTitle = String(options?.subjectTitle || examJson?.subjectTitle || "Asignatura").trim() || "Asignatura";
    return { degreeTitle, courseTitle, subjectTitle };
  }

  function extractHierarchyFromRelativePath(relativePath, payload) {
    const parts = relativePath.map((part) => String(part || "").trim()).filter(Boolean);
    if (parts.length >= 3 && looksLikeCourseSegment(parts[1])) {
      return {
        degreeTitle: String(payload?.degreeTitle || parts[0] || DEFAULT_DEGREE_TITLE),
        courseTitle: String(payload?.courseTitle || parts[1] || DEFAULT_COURSE_TITLE),
        subjectTitle: String(payload?.subjectTitle || parts[2] || "Asignatura"),
      };
    }

    return {
      degreeTitle: String(payload?.degreeTitle || DEFAULT_DEGREE_TITLE),
      courseTitle: String(payload?.courseTitle || DEFAULT_COURSE_TITLE),
      subjectTitle: String(payload?.subjectTitle || parts[0] || "Asignatura"),
    };
  }

  function buildRelativePath(options, examJson) {
    const presetParts = Array.isArray(options?.preset?.output_path_parts)
      ? options.preset.output_path_parts.filter(Boolean).map((part) => String(part))
      : [];
    const hierarchy = resolveHierarchy(options, examJson);
    const outputFileName = normalizeOutputFileName(
      options?.outputFileName,
      presetParts[presetParts.length - 1] || options?.examTitle || "examen.json",
    );

    if (presetParts.length > 0) {
      const dirParts = presetParts
        .slice(0, -1)
        .map((part) => sanitizePathSegment(part))
        .filter(Boolean);
      return [
        sanitizePathSegment(hierarchy.degreeTitle),
        sanitizePathSegment(hierarchy.courseTitle),
        ...dirParts,
        outputFileName,
      ];
    }

    const pathParts = [
      sanitizePathSegment(hierarchy.degreeTitle, "grado"),
      sanitizePathSegment(hierarchy.courseTitle, "curso"),
      sanitizePathSegment(hierarchy.subjectTitle, "asignatura"),
    ];
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

  function normalizeExamForPublication(examJson, hierarchy) {
    const questions = Array.isArray(examJson?.questions) ? examJson.questions : [];
    const normalized = {
      ...examJson,
      degreeTitle: hierarchy.degreeTitle,
      courseTitle: hierarchy.courseTitle,
      subjectTitle: hierarchy.subjectTitle,
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
    const hierarchy = extractHierarchyFromRelativePath(relativePath, payload);
    const questions = Array.isArray(payload.questions) ? payload.questions : [];
    const partialSegment =
      relativePath.find((segment) => /^parcial[\s-]\d+$/i.test(String(segment || "").trim())) || "";
    return {
      examUid: relativePath.join("/"),
      degree: hierarchy.degreeTitle,
      course: hierarchy.courseTitle,
      subject: hierarchy.subjectTitle,
      partial: normalizePartialLabel(partialSegment),
      examTitle: String(payload.examTitle || "Examen"),
      subtitle: String(payload.subtitle || ""),
      totalQuestions: Number(payload.totalQuestions || questions.length || 0),
      file: buildPublicFileUrl(relativePath),
      sourcePath: `out/examenes/${relativePath.join("/")}`,
    };
  }

  function sortCatalogEntries(left, right) {
    return [left.degree, left.course, left.subject, left.partial, left.examTitle, left.examUid]
      .join("\u0000")
      .localeCompare([right.degree, right.course, right.subject, right.partial, right.examTitle, right.examUid].join("\u0000"), "es");
  }

  function buildCatalogHierarchy(items) {
    const degreeMap = new Map();

    items.forEach((item) => {
      const degree = String(item.degree || DEFAULT_DEGREE_TITLE).trim() || DEFAULT_DEGREE_TITLE;
      const course = String(item.course || DEFAULT_COURSE_TITLE).trim() || DEFAULT_COURSE_TITLE;
      const subject = String(item.subject || item.subjectTitle || "Asignatura").trim() || "Asignatura";
      const partial = String(item.partial || "").trim();

      if (!degreeMap.has(degree)) {
        degreeMap.set(degree, { degree, count: 0, courses: new Map() });
      }
      const degreeNode = degreeMap.get(degree);
      degreeNode.count += 1;

      if (!degreeNode.courses.has(course)) {
        degreeNode.courses.set(course, { course, count: 0, subjects: new Map() });
      }
      const courseNode = degreeNode.courses.get(course);
      courseNode.count += 1;

      if (!courseNode.subjects.has(subject)) {
        courseNode.subjects.set(subject, { subject, count: 0, partials: new Set(), examUids: [] });
      }
      const subjectNode = courseNode.subjects.get(subject);
      subjectNode.count += 1;
      subjectNode.examUids.push(item.examUid);
      if (partial) {
        subjectNode.partials.add(partial);
      }
    });

    const degrees = [...degreeMap.values()]
      .sort((left, right) => left.degree.localeCompare(right.degree, "es"))
      .map((degreeNode) => ({
        degree: degreeNode.degree,
        count: degreeNode.count,
        courses: [...degreeNode.courses.values()]
          .sort((left, right) => left.course.localeCompare(right.course, "es"))
          .map((courseNode) => ({
            course: courseNode.course,
            count: courseNode.count,
            subjects: [...courseNode.subjects.values()]
              .sort((left, right) => left.subject.localeCompare(right.subject, "es"))
              .map((subjectNode) => ({
                subject: subjectNode.subject,
                count: subjectNode.count,
                partials: [...subjectNode.partials].sort((left, right) => left.localeCompare(right, "es")),
                examUids: subjectNode.examUids,
              })),
          })),
      }));

    return { degrees };
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
      hierarchy: buildCatalogHierarchy(items),
    };

    await writeJsonFile(catalogRootHandle, INDEX_FILE_NAME, indexPayload);
    return indexPayload;
  }

  async function publishExamToCatalog(catalogRootHandle, examJson, options) {
    if (!catalogRootHandle) {
      throw new Error("Falta la carpeta local del catálogo.");
    }

    const hierarchy = resolveHierarchy(options, examJson);
    const relativePath = buildRelativePath(options, examJson);
    const normalizedExam = normalizeExamForPublication(examJson, hierarchy);
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