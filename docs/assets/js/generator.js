// Cargar presets desde el JSON
const PRESETS_DATA = {};

const dom = {
  presetSelector: document.getElementById("presetSelector"),
  inputFile: document.getElementById("inputFile"),
  inputPathHint: document.getElementById("inputPathHint"),
  subjectTitle: document.getElementById("subjectTitle"),
  examTitle: document.getElementById("examTitle"),
  subtitle: document.getElementById("subtitle"),
  notice: document.getElementById("notice"),
  numberOfQuestions: document.getElementById("numberOfQuestions"),
  maxScore: document.getElementById("maxScore"),
  wrongAnswersPerDiscountedCorrect: document.getElementById("wrongAnswersPerDiscountedCorrect"),
  timeLimitMinutes: document.getElementById("timeLimitMinutes"),
  randomSelection: document.getElementById("randomSelection"),
  outputFileName: document.getElementById("outputFileName"),
  pickOutputFolderBtn: document.getElementById("pickOutputFolderBtn"),
  clearOutputFolderBtn: document.getElementById("clearOutputFolderBtn"),
  localOutputHint: document.getElementById("localOutputHint"),
  generateBtn: document.getElementById("generateBtn"),
  resetBtn: document.getElementById("resetBtn"),
  statusBox: document.getElementById("statusBox"),
  statusText: document.getElementById("statusText"),
};

const state = {
  selectedPreset: null,
  selectedFile: null,
  selectedFileName: "",
  outputFileName: "examen.json",
  localOutputFolderHandle: null,
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("data/presets.json");
    if (!response.ok) {
      throw new Error("No se pudo cargar presets.json");
    }

    const presets = await response.json();
    Object.assign(PRESETS_DATA, presets);
    populatePresetSelector();
    bindEvents();
    syncLocalOutputHint();
  } catch (error) {
    setStatus(`Error cargando presets: ${error.message}`, "error");
  }
});

function normalizeFolderPath(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/g, "");
}

function normalizeFileName(value) {
  return String(value || "").trim();
}

function getPresetOutputName(preset) {
  const outputParts = preset?.output_path_parts || [];
  return normalizeFileName(outputParts[outputParts.length - 1] || "examen.json") || "examen.json";
}

function populatePresetSelector() {
  Object.keys(PRESETS_DATA).forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = PRESETS_DATA[key].subjectTitle + " - " + PRESETS_DATA[key].examTitle;
    dom.presetSelector.appendChild(option);
  });
}

function syncLocalOutputHint() {
  if (state.localOutputFolderHandle) {
    dom.localOutputHint.textContent = `Carpeta local seleccionada: ${state.localOutputFolderHandle.name}`;
    return;
  }

  dom.localOutputHint.textContent = "Sin carpeta local elegida; el archivo se descargará al finalizar.";
}

function supportsDirectoryPicker() {
  return typeof window.showDirectoryPicker === "function";
}

async function pickLocalOutputFolder() {
  if (!supportsDirectoryPicker()) {
    setStatus("Este navegador no permite elegir carpetas locales. Se usará la descarga automática.", "neutral");
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    state.localOutputFolderHandle = handle;
    syncLocalOutputHint();
    setStatus(`Carpeta local seleccionada: ${handle.name}`, "success");
  } catch (error) {
    if (error && error.name !== "AbortError") {
      setStatus(`No se pudo elegir la carpeta local: ${error.message}`, "error");
    }
  }
}

function clearLocalOutputFolder() {
  state.localOutputFolderHandle = null;
  syncLocalOutputHint();
  setStatus("Se quitó la carpeta local. La salida se descargará automáticamente.", "neutral");
}

async function writeTextFileToDirectory(directoryHandle, fileName, content) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

function triggerJsonDownload(fileName, data) {
  const jsonText = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function loadPreset(presetKey) {
  if (!presetKey) {
    state.selectedPreset = null;
    return;
  }

  const preset = PRESETS_DATA[presetKey];
  if (!preset) return;

  state.selectedPreset = preset;

  dom.subjectTitle.value = preset.subjectTitle || "";
  dom.examTitle.value = preset.examTitle || "";
  dom.subtitle.value = preset.subtitle || "";
  dom.notice.value = preset.notice || "";
  dom.numberOfQuestions.value = preset.numberOfQuestions || 30;
  dom.maxScore.value = preset.maxScore || 10;
  dom.wrongAnswersPerDiscountedCorrect.value = preset.wrongAnswersPerDiscountedCorrect || 0;
  dom.timeLimitMinutes.value = preset.timeLimitMinutes || 90;
  dom.randomSelection.value = preset.randomSelection ? "si" : "no";

  state.outputFileName = getPresetOutputName(preset);
  dom.outputFileName.value = state.outputFileName;

  const inputParts = preset.input_path_parts || [];
  const inputPath = ["input", "banco_de_preguntas", ...inputParts].join("/");
  dom.inputPathHint.textContent = `Ruta esperada: ${inputPath}`;

  setStatus(`Preset cargado: ${preset.subjectTitle}`, "success");
}

function setStatus(text, tone = "neutral") {
  dom.statusText.textContent = text;
  dom.statusBox.dataset.tone = tone;
  dom.statusBox.style.display = "block";
}

function getCurrentConfig() {
  return {
    inputFile: state.selectedFile,
    inputFileName: state.selectedFileName,
    subjectTitle: dom.subjectTitle.value.trim(),
    examTitle: dom.examTitle.value.trim(),
    subtitle: dom.subtitle.value.trim(),
    notice: dom.notice.value.trim(),
    numberOfQuestions: parseInt(dom.numberOfQuestions.value, 10),
    maxScore: parseFloat(dom.maxScore.value),
    wrongAnswersPerDiscountedCorrect: parseFloat(dom.wrongAnswersPerDiscountedCorrect.value),
    timeLimitMinutes: parseInt(dom.timeLimitMinutes.value, 10),
    randomSelection: dom.randomSelection.value === "si",
    outputFileName: normalizeFileName(state.outputFileName),
  };
}

function validateConfig(config) {
  const errors = [];

  if (!config.inputFile) {
    errors.push("Se debe seleccionar un archivo de entrada JSON");
  }

  if (!config.subjectTitle) {
    errors.push("El título de la asignatura es requerido");
  }

  if (!config.examTitle) {
    errors.push("El título del examen es requerido");
  }

  if (!config.numberOfQuestions || config.numberOfQuestions < 1) {
    errors.push("El número de preguntas debe ser mayor a 0");
  }

  if (!normalizeFileName(state.outputFileName)) {
    errors.push("El nombre del fichero de salida es requerido");
  }

  return errors;
}

function bindEvents() {
  dom.presetSelector.addEventListener("change", (e) => {
    loadPreset(e.target.value);
  });

  dom.outputFileName.addEventListener("input", (e) => {
    state.outputFileName = normalizeFileName(e.target.value);
  });

  dom.pickOutputFolderBtn.addEventListener("click", pickLocalOutputFolder);
  dom.clearOutputFolderBtn.addEventListener("click", clearLocalOutputFolder);

  dom.inputFile.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) {
      state.selectedFile = file;
      state.selectedFileName = file.name;
      dom.inputPathHint.textContent = `Archivo seleccionado: ${file.name}`;
      setStatus(`Archivo cargado: ${file.name}`, "success");
    }
  });

  dom.generateBtn.addEventListener("click", generateExam);
  dom.resetBtn.addEventListener("click", resetForm);
}

function resetForm() {
  dom.presetSelector.value = "";
  dom.inputFile.value = "";
  dom.subjectTitle.value = "";
  dom.examTitle.value = "";
  dom.subtitle.value = "";
  dom.notice.value = "";
  dom.numberOfQuestions.value = "30";
  dom.maxScore.value = "10";
  dom.wrongAnswersPerDiscountedCorrect.value = "0";
  dom.timeLimitMinutes.value = "90";
  dom.randomSelection.value = "no";
  state.outputFileName = "examen.json";
  state.localOutputFolderHandle = null;
  dom.outputFileName.value = state.outputFileName;
  syncLocalOutputHint();
  dom.inputPathHint.textContent = "Ruta esperada: -";
  state.selectedPreset = null;
  state.selectedFile = null;
  state.selectedFileName = "";
  dom.statusBox.style.display = "none";
}

async function generateExam() {
  const config = getCurrentConfig();
  const errors = validateConfig(config);

  if (errors.length > 0) {
    setStatus(`Error: ${errors.join("; ")}`, "error");
    return;
  }

  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const inputJson = e.target.result;

      JSON.parse(inputJson);

      setStatus("Generando examen en servidor...", "neutral");

      const apiUrl = `${window.location.protocol}//${window.location.host}/api/generate-exam`;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputJson: inputJson,
          config: {
            subjectTitle: config.subjectTitle,
            examTitle: config.examTitle,
            subtitle: config.subtitle,
            notice: config.notice,
            numberOfQuestions: config.numberOfQuestions,
            maxScore: config.maxScore,
            wrongAnswersPerDiscountedCorrect: config.wrongAnswersPerDiscountedCorrect,
            timeLimitMinutes: config.timeLimitMinutes,
            randomSelection: config.randomSelection,
            outputFileName: config.outputFileName,
            saveFiles: false,
          },
        }),
      });

      const result = await response.json();

      if (result.success) {
        await handleGeneratedExam(result, config);
      } else {
        setStatus(`Error generando examen: ${result.error}`, "error");
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        setStatus(`Error: JSON de entrada inválido - ${error.message}`, "error");
      } else {
        setStatus(`Error: ${error.message}`, "error");
      }
    }
  };

  reader.onerror = () => {
    setStatus("Error leyendo el archivo", "error");
  };

  reader.readAsText(config.inputFile);
}

async function handleGeneratedExam(result, config) {
  const examFileName = normalizeFileName(config.outputFileName) || "examen.json";
  const templateFileName = result.templatePath ? normalizeFileName(result.templatePath.split("/").pop()) : `${examFileName.replace(/\.json$/i, "")}-realizado.json`;
  const examJson = result.examJson || null;
  const templateJson = result.templateJson || null;

  if (state.localOutputFolderHandle) {
    try {
      if (!examJson) {
        throw new Error("El servidor no devolvió el JSON del examen para guardarlo localmente.");
      }

      await writeTextFileToDirectory(
        state.localOutputFolderHandle,
        examFileName,
        JSON.stringify(examJson, null, 2),
      );

      if (templateJson) {
        await writeTextFileToDirectory(
          state.localOutputFolderHandle,
          templateFileName,
          JSON.stringify(templateJson, null, 2),
        );
      }

      setStatus(
        `✅ Examen generado correctamente\n\nGuardado localmente en: ${state.localOutputFolderHandle.name}/${examFileName}${templateJson ? `\nPlantilla guardada como: ${templateFileName}` : ""}\n\n${result.message}`,
        "success",
      );
      return;
    } catch (error) {
      setStatus(`No se pudo guardar en la carpeta local: ${error.message}. Se descargará el archivo.`, "error");
    }
  }

  if (examJson) {
    triggerJsonDownload(examFileName, examJson);
    if (templateJson) {
      triggerJsonDownload(templateFileName, templateJson);
    }
    setStatus(
      `✅ Examen generado correctamente\n\nDescargado como: ${examFileName}${templateJson ? ` y ${templateFileName}` : ""}\n\n${result.message}`,
      "success",
    );
    return;
  }

  showGenerationResult(result);
}

function showGenerationResult(result) {
  const summary = `✅ Examen generado correctamente

Detalles:
- Preguntas: ${result.questionCount}
- Salida examen: ${result.outputPath}
- Salida plantilla: ${result.templatePath}

${result.message}
  `.trim();

  setStatus(summary, "success");
}
