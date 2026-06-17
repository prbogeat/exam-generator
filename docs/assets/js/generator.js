// Cargar presets desde el JSON
const PRESETS_DATA = {}; // Se llenará desde el archivo presets.json

// Elementos DOM
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
  outputPath: document.getElementById("outputPath"),
  generateBtn: document.getElementById("generateBtn"),
  resetBtn: document.getElementById("resetBtn"),
  statusBox: document.getElementById("statusBox"),
  statusText: document.getElementById("statusText"),
};

const state = {
  selectedPreset: null,
  selectedFile: null,
  selectedFileName: "",
};

// Realizar fetch del archivo presets.json y procesarlo
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("data/presets.json");
    if (!response.ok) throw new Error("No se pudo cargar presets.json");
    
    const presets = await response.json();
    Object.assign(PRESETS_DATA, presets);
    populatePresetSelector();
    bindEvents();
  } catch (error) {
    setStatus(`Error cargando presets: ${error.message}`, "error");
  }
});

function populatePresetSelector() {
  Object.keys(PRESETS_DATA).forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = PRESETS_DATA[key].subjectTitle + " - " + PRESETS_DATA[key].examTitle;
    dom.presetSelector.appendChild(option);
  });
}

function loadPreset(presetKey) {
  if (!presetKey) {
    state.selectedPreset = null;
    return;
  }

  const preset = PRESETS_DATA[presetKey];
  if (!preset) return;

  state.selectedPreset = preset;

  // Rellenar campos con valores del preset
  dom.subjectTitle.value = preset.subjectTitle || "";
  dom.examTitle.value = preset.examTitle || "";
  dom.subtitle.value = preset.subtitle || "";
  dom.notice.value = preset.notice || "";
  dom.numberOfQuestions.value = preset.numberOfQuestions || 30;
  dom.maxScore.value = preset.maxScore || 10;
  dom.wrongAnswersPerDiscountedCorrect.value = preset.wrongAnswersPerDiscountedCorrect || 0;
  dom.timeLimitMinutes.value = preset.timeLimitMinutes || 90;
  dom.randomSelection.checked = preset.randomSelection || false;

  // Construir ruta de salida
  const outputParts = preset.output_path_parts || [];
  const outputPath = ["out", "examenes", ...outputParts].join("/");
  dom.outputPath.value = outputPath;

  // Mostrar ruta de entrada esperada
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
    randomSelection: dom.randomSelection.checked,
    outputPath: dom.outputPath.value.trim(),
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

  if (!config.outputPath) {
    errors.push("La ruta de salida es requerida");
  }

  return errors;
}

function bindEvents() {
  dom.presetSelector.addEventListener("change", (e) => {
    loadPreset(e.target.value);
  });

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
  dom.randomSelection.checked = false;
  dom.outputPath.value = "";
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

  // Leer contenido del archivo JSON
  const reader = new FileReader();
  
  reader.onload = async (e) => {
    try {
      const inputJson = e.target.result;
      
      // Validar que sea JSON válido
      JSON.parse(inputJson);

      setStatus("Generando examen en servidor...", "neutral");

      // Construir URL del servidor (usar el mismo host y puerto)
      const apiUrl = `${window.location.protocol}//${window.location.host}/api/generate-exam`;

      // Enviar al servidor
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
            outputPath: config.outputPath,
          },
        }),
      });

      const result = await response.json();

      if (result.success) {
        showGenerationResult(result);
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
