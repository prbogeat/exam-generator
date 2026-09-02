/**
 * Módulo de exportación a PDF para exámenes
 * Exporta la información no editable del examen: resultados, tiempo, y preguntas respondidas con corrección
 */

class ExamPDFExporter {
  /**
   * @param {Object} exam - Objeto del examen
   * @param {Object} answers - Respuestas del usuario (id -> opción seleccionada)
   * @param {Boolean} submitted - Si el examen ha sido corregido
   * @param {Number} elapsedMs - Tiempo empleado en milisegundos
   */
  constructor(exam, answers, submitted, elapsedMs) {
    this.exam = exam;
    this.answers = answers;
    this.submitted = submitted;
    this.elapsedMs = elapsedMs;
  }

  /**
   * Calcula las estadísticas del examen
   */
  getStats() {
    let correct = 0,
      wrong = 0,
      blank = 0;

    this.exam.questions.forEach((question) => {
      const selected = this.answers[String(question.id)] || "";
      if (selected === "") {
        blank++;
      } else if (selected === question.correctOption) {
        correct++;
      } else {
        wrong++;
      }
    });

    const stats = { correct, wrong, blank };

    // Cálculo de nota basado en la fórmula
    let rawGrade = 0;
    if (this.exam.scoring && this.exam.scoring.formula) {
      const formula = this.exam.scoring.formula;
      rawGrade =
        formula.base +
        correct * formula.correctPoints -
        wrong * formula.incorrectPoints;
    }

    stats.rawGrade = rawGrade;
    return stats;
  }

  /**
   * Formatea tiempo en milisegundos a HH:MM:SS
   */
  formatTime(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / 60000) % 60);
    const hours = Math.floor(ms / 3600000);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  /**
   * Crea el HTML del resultado del examen
   */
  createResultSection() {
    const stats = this.getStats();
    const timeLimitMinutes = this.exam.timing?.minutes || 120;
    const withinTime = this.elapsedMs / 60000 <= timeLimitMinutes;

    let html = `
      <div class="pdf-result">
        <h2>${stats.rawGrade >= 5 ? "✓" : "⚠"} Resultado</h2>
        <div class="result-stats">
          <p><strong>Aciertos:</strong> ${stats.correct} · <strong>Errores:</strong> ${stats.wrong} · <strong>En blanco:</strong> ${stats.blank}</p>
          <p><strong>Tiempo empleado:</strong> ${this.formatTime(this.elapsedMs)}${
      withinTime
        ? ` (dentro del tiempo oficial de ${timeLimitMinutes} minutos)`
        : ` (superados los ${timeLimitMinutes} minutos oficiales)`
    }</p>
          <p><strong>Fórmula:</strong> ${this.exam.scoring?.formulaTip || "No definida"}</p>
          <p><strong>Nota:</strong> ${Math.max(0, stats.rawGrade).toFixed(2)}</p>
        </div>
      </div>
    `;

    return html;
  }

  /**
   * Crea HTML para las barras de progreso de fallos/aciertos
   */
  createProgressBars() {
    const stats = this.getStats();
    const total = this.exam.questions.length;
    const correctPercent = (stats.correct / total) * 100;
    const wrongPercent = (stats.wrong / total) * 100;
    const blankPercent = (stats.blank / total) * 100;

    return `
      <div class="pdf-progress-bars">
        <div class="progress-item">
          <label>Aciertos (${stats.correct}/${total})</label>
          <div class="progress-bar">
            <div class="progress-fill correct" style="width: ${correctPercent}%"></div>
          </div>
        </div>
        <div class="progress-item">
          <label>Errores (${stats.wrong}/${total})</label>
          <div class="progress-bar">
            <div class="progress-fill wrong" style="width: ${wrongPercent}%"></div>
          </div>
        </div>
        <div class="progress-item">
          <label>En blanco (${stats.blank}/${total})</label>
          <div class="progress-bar">
            <div class="progress-fill blank" style="width: ${blankPercent}%"></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Crea HTML para una opción de pregunta
   */
  createOptionHTML(question, option, selectedKey) {
    const isCorrect = option.key === question.correctOption;
    const isSelected = option.key === selectedKey;
    const showCorrectness = this.submitted && selectedKey !== "";

    let statusIcon = "";
    let statusClass = "";

    if (showCorrectness && isSelected && isCorrect) {
      statusIcon = "✓";
      statusClass = "ok";
    } else if (showCorrectness && isSelected && !isCorrect) {
      statusIcon = "✗";
      statusClass = "bad";
    } else if (showCorrectness && !isSelected && isCorrect) {
      statusIcon = "✓";
      statusClass = "correct-answer";
    }

    const selectedClass = isSelected ? "selected" : "";

    return `
      <div class="pdf-option ${selectedClass} ${statusClass}">
        <span class="option-key">${option.key})</span>
        <span class="option-text">${this.escapeHtml(option.text)}</span>
        ${statusIcon ? `<span class="status-icon">${statusIcon}</span>` : ""}
      </div>
    `;
  }

  /**
   * Crea HTML para la retroalimentación de una pregunta
   */
  createFeedbackHTML(question, selectedKey) {
    if (!this.submitted) return "";

    const isCorrect = selectedKey === question.correctOption;
    const isBlank = selectedKey === "";

    if (!question.feedback) return "";

    return `
      <div class="pdf-feedback ${isCorrect ? "ok" : "incorrect"}">
        <strong>Explicación:</strong>
        <p>${this.escapeHtml(question.feedback)}</p>
      </div>
    `;
  }

  /**
   * Escapa caracteres HTML especiales
   */
  escapeHtml(text) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Crea la sección de preguntas respondidas
   */
  createQuestionsSection() {
    let html = '<div class="pdf-questions">';

    this.exam.questions.forEach((question) => {
      const selectedKey = this.answers[String(question.id)] || "";
      const isCorrect = selectedKey !== "" && selectedKey === question.correctOption;
      const isBlank = selectedKey === "";

      // Mostrar esta pregunta solo si:
      // - El examen NO está corregido (mostrar todas)
      // - O está corregido y no es en blanco (mostrar respondidas)
      const shouldShow = !this.submitted || !isBlank;

      if (!shouldShow) return;

      let questionClass = "pdf-question";
      if (this.submitted) {
        questionClass += isCorrect ? " correct" : " incorrect";
      }

      html += `
        <div class="${questionClass}">
          <div class="pdf-question-header">
            <h3><span class="question-number">${question.id}.</span> ${this.escapeHtml(question.text)}</h3>
            ${
              this.submitted
                ? `<span class="question-status ${isCorrect ? "ok" : "bad"}">${isCorrect ? "✓" : "✗"}</span>`
                : ""
            }
          </div>
      `;

      // Imagen de la pregunta
      if (question.image) {
        const isImageUrl = question.image.startsWith("http://") || question.image.startsWith("https://") || question.image.startsWith("data:");
        if (isImageUrl) {
          html += `<div class="pdf-question-image"><img src="${question.image}" alt="Imagen pregunta ${question.id}" /></div>`;
        }
      }

      // Opciones
      html += '<div class="pdf-options">';
      question.options.forEach((option) => {
        html += this.createOptionHTML(question, option, selectedKey);
      });
      html += "</div>";

      // Retroalimentación
      const feedback = this.createFeedbackHTML(question, selectedKey);
      if (feedback) {
        html += feedback;
      }

      html += "</div>";
    });

    html += "</div>";
    return html;
  }

  /**
   * Crea el HTML completo para el PDF
   */
  createPDFContent() {
    const examTitle = this.exam.title || "Examen";
    const examSubject = this.exam.subject || "";
    const timestamp = new Date().toLocaleString("es-ES");

    let html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${this.escapeHtml(examTitle)}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #fff;
            font-size: 12px;
          }

          .pdf-container {
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
          }

          .pdf-header {
            border-bottom: 2px solid #0f5a47;
            margin-bottom: 20px;
            padding-bottom: 15px;
          }

          .pdf-header h1 {
            font-size: 24px;
            color: #0f5a47;
            margin-bottom: 8px;
          }

          .pdf-header .subtitle {
            font-size: 14px;
            color: #666;
            margin-bottom: 5px;
          }

          .pdf-header .timestamp {
            font-size: 11px;
            color: #999;
          }

          .pdf-result {
            background: #f9f9f9;
            border-left: 4px solid #0f5a47;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
          }

          .pdf-result h2 {
            font-size: 18px;
            color: #0f5a47;
            margin-bottom: 12px;
          }

          .result-stats p {
            margin: 8px 0;
            font-size: 12px;
          }

          .result-stats strong {
            color: #0f5a47;
          }

          .pdf-progress-bars {
            margin: 20px 0;
            padding: 15px;
            background: #f9f9f9;
            border-radius: 4px;
          }

          .progress-item {
            margin-bottom: 12px;
          }

          .progress-item label {
            display: block;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 5px;
            color: #333;
          }

          .progress-bar {
            height: 20px;
            background: #e0e0e0;
            border-radius: 3px;
            overflow: hidden;
            display: flex;
          }

          .progress-fill {
            height: 100%;
            transition: width 0.3s ease;
          }

          .progress-fill.correct {
            background: #4caf50;
          }

          .progress-fill.wrong {
            background: #f44336;
          }

          .progress-fill.blank {
            background: #ffc107;
          }

          .pdf-questions {
            margin-top: 20px;
          }

          .pdf-question {
            page-break-inside: avoid;
            margin-bottom: 20px;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 15px;
            background: #fff;
          }

          .pdf-question.correct {
            border-left: 4px solid #4caf50;
            background: #f1f8f4;
          }

          .pdf-question.incorrect {
            border-left: 4px solid #f44336;
            background: #fef1f0;
          }

          .pdf-question-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 12px;
          }

          .pdf-question-header h3 {
            font-size: 13px;
            flex: 1;
            margin: 0;
          }

          .question-number {
            font-weight: 700;
            color: #0f5a47;
            margin-right: 5px;
          }

          .question-status {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            font-weight: bold;
            font-size: 14px;
            flex-shrink: 0;
            margin-left: 10px;
          }

          .question-status.ok {
            background: #4caf50;
            color: white;
          }

          .question-status.bad {
            background: #f44336;
            color: white;
          }

          .pdf-question-image {
            margin: 12px 0;
            text-align: center;
          }

          .pdf-question-image img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
            border: 1px solid #ddd;
          }

          .pdf-options {
            margin: 12px 0;
          }

          .pdf-option {
            padding: 8px 12px;
            margin: 6px 0;
            border: 1px solid #ddd;
            border-radius: 4px;
            display: flex;
            align-items: center;
            background: #fff;
            font-size: 12px;
          }

          .pdf-option.selected {
            background: #e8f5e9;
            border-color: #4caf50;
          }

          .pdf-option.ok {
            border-color: #4caf50;
            border-left: 3px solid #4caf50;
            background: #f1f8f4;
          }

          .pdf-option.bad {
            border-color: #f44336;
            border-left: 3px solid #f44336;
            background: #fef1f0;
          }

          .pdf-option.correct-answer {
            border-color: #4caf50;
            border-left: 3px solid #4caf50;
            background: #f1f8f4;
          }

          .option-key {
            font-weight: 700;
            color: #0f5a47;
            margin-right: 8px;
            min-width: 20px;
          }

          .option-text {
            flex: 1;
          }

          .status-icon {
            font-weight: bold;
            font-size: 16px;
            margin-left: 8px;
          }

          .pdf-option.ok .status-icon {
            color: #4caf50;
          }

          .pdf-option.bad .status-icon {
            color: #f44336;
          }

          .pdf-feedback {
            margin-top: 10px;
            padding: 10px;
            border-radius: 4px;
            font-size: 12px;
          }

          .pdf-feedback.ok {
            background: #c8e6c9;
            border-left: 3px solid #4caf50;
          }

          .pdf-feedback.incorrect {
            background: #ffcdd2;
            border-left: 3px solid #f44336;
          }

          .pdf-feedback strong {
            display: block;
            margin-bottom: 5px;
            color: #333;
          }

          .pdf-feedback p {
            margin: 0;
            color: #333;
          }

          @media print {
            body {
              padding: 0;
              margin: 0;
            }
            .pdf-container {
              padding: 10px;
            }
            .pdf-question {
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="pdf-container">
          <div class="pdf-header">
            <h1>${this.escapeHtml(examTitle)}</h1>
            ${examSubject ? `<div class="subtitle">Asignatura: ${this.escapeHtml(examSubject)}</div>` : ""}
            <div class="timestamp">Exportado el ${timestamp}</div>
          </div>

          ${this.submitted ? this.createResultSection() : ""}

          ${this.submitted ? this.createProgressBars() : ""}

          ${this.createQuestionsSection()}
        </div>
      </body>
      </html>
    `;

    return html;
  }

  /**
   * Exporta el examen a PDF
   * @returns {Promise<void>}
   */
  async exportToPDF() {
    if (!window.html2pdf) {
      console.error("html2pdf no está cargado");
      alert("Error: librería de PDF no disponible. Por favor, recarga la página.");
      return;
    }

    const content = this.createPDFContent();

    // Crear un elemento temporal para renderizar el HTML
    const element = document.createElement("div");
    element.innerHTML = content;

    const options = {
      margin: 10,
      filename: `${this.exam.title || "examen"}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { orientation: "portrait", unit: "mm", format: "a4" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    };

    try {
      await html2pdf().set(options).from(element).save();
    } catch (error) {
      console.error("Error al exportar PDF:", error);
      alert("Error al generar el PDF. Por favor, intenta de nuevo.");
    }
  }
}

/**
 * Función auxiliar para exportar el examen actual
 * Se llama desde app.js
 */
async function exportExamToPDF(exam, answers, submitted, elapsedMs) {
  if (!exam) {
    alert("No hay un examen cargado para exportar.");
    return;
  }

  const exporter = new ExamPDFExporter(exam, answers, submitted, elapsedMs);
  await exporter.exportToPDF();
}
