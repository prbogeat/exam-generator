/**
 * Exportación a PDF desde snapshot del DOM corregido.
 * Mantiene estilos/colores reales y elimina controles editables.
 */

function sanitizePdfFilename(text) {
  return String(text || "examen")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function createPdfHeader() {
  const title = document.getElementById("pageTitle")?.textContent?.trim() || "Examen";
  const subtitle = document.getElementById("pageSubtitle")?.textContent?.trim() || "";
  const hierarchy = document.getElementById("pageHierarchy")?.textContent?.trim() || "";

  const header = document.createElement("section");
  header.className = "pdf-header-block";

  const h1 = document.createElement("h1");
  h1.textContent = title;
  header.appendChild(h1);

  if (hierarchy) {
    const p = document.createElement("p");
    p.className = "pdf-hierarchy";
    p.textContent = hierarchy;
    header.appendChild(p);
  }

  if (subtitle) {
    const p = document.createElement("p");
    p.className = "pdf-subtitle";
    p.textContent = subtitle;
    header.appendChild(p);
  }

  const stamp = document.createElement("p");
  stamp.className = "pdf-stamp";
  stamp.textContent = `Exportado el ${new Date().toLocaleString("es-ES")}`;
  header.appendChild(stamp);

  return header;
}

function decorateQuestionOptionsForPdf(questionsRoot) {
  const options = questionsRoot.querySelectorAll(".option");
  options.forEach((option) => {
    option.querySelectorAll("input, button, select, textarea").forEach((node) => node.remove());

    const marker = document.createElement("span");
    marker.className = "pdf-option-marker";

    if (option.classList.contains("wrong")) {
      marker.textContent = "✗";
      marker.classList.add("bad");
    } else if (option.classList.contains("correct") || option.classList.contains("selected")) {
      marker.textContent = "✓";
      marker.classList.add("ok");
    } else {
      marker.textContent = "•";
    }

    option.insertBefore(marker, option.firstChild);
  });
}

function filterOnlyAnsweredQuestions(questionsRoot) {
  const questions = questionsRoot.querySelectorAll("article.question");
  questions.forEach((question) => {
    const hasSelected = question.querySelector(".option.selected");
    if (!hasSelected) {
      question.remove();
    }
  });
}

function createPdfRootSnapshot() {
  const wrapper = document.createElement("div");
  wrapper.className = "pdf-export-root";

  wrapper.appendChild(createPdfHeader());

  const summary = document.querySelector("section.summary")?.cloneNode(true);
  if (summary) {
    summary.classList.add("pdf-summary");
    wrapper.appendChild(summary);
  }

  const result = document.getElementById("resultBox")?.cloneNode(true);
  if (result) {
    result.style.display = "block";
    result.classList.add("pdf-result-box");
    wrapper.appendChild(result);
  }

  const questions = document.getElementById("questions")?.cloneNode(true);
  if (questions) {
    questions.classList.add("pdf-questions-box");
    decorateQuestionOptionsForPdf(questions);
    filterOnlyAnsweredQuestions(questions);
    wrapper.appendChild(questions);
  }

  return wrapper;
}

function waitForImages(node) {
  const images = Array.from(node.querySelectorAll("img"));
  if (!images.length) {
    return Promise.resolve();
  }

  return Promise.all(
    images.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        })
    )
  ).then(() => undefined);
}

function createPdfStyleTag() {
  const style = document.createElement("style");
  style.textContent = `
    .pdf-export-root { background: #fff; color: #0f172a; width: 100%; max-width: 1080px; padding: 18px; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
    .pdf-header-block { border-bottom: 2px solid #e2e8f0; margin-bottom: 14px; padding-bottom: 10px; }
    .pdf-header-block h1 { margin: 0; color: #0f766e; font-size: 24px; }
    .pdf-hierarchy { margin: 6px 0 0; color: #0b5d57; font-weight: 800; }
    .pdf-subtitle { margin: 6px 0 0; color: #64748b; }
    .pdf-stamp { margin: 6px 0 0; color: #64748b; font-size: 12px; }
    .pdf-summary { margin: 0 0 14px; }
    .pdf-summary .card { box-shadow: none !important; }
    .pdf-result-box { display: block !important; margin-bottom: 14px; }
    .pdf-questions-box { display: grid; gap: 12px; }
    .pdf-questions-box .question { box-shadow: none !important; page-break-inside: avoid; }
    .pdf-questions-box .option { cursor: default; align-items: flex-start; }
    .pdf-questions-box .option > .pdf-option-marker {
      flex: 0 0 20px !important;
      width: 20px;
      min-width: 20px;
      max-width: 20px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 0;
      line-height: 1.2;
    }
    .pdf-questions-box .option > span:not(.pdf-option-marker) {
      flex: 1 1 auto !important;
      min-width: 0;
      display: block;
    }
    .pdf-option-marker { text-align: center; font-weight: 800; margin-right: 4px; color: #334155; }
    .pdf-option-marker.ok { color: #1a7431; }
    .pdf-option-marker.bad { color: #be123c; }
    .pdf-questions-box .option strong { white-space: normal; }
  `;
  return style;
}

async function exportExamToPDF(exam, _answers, _submitted, _elapsedMs) {
  if (!exam) {
    alert("No hay un examen cargado para exportar.");
    return;
  }

  if (!window.html2pdf) {
    alert("Error: librería de PDF no disponible. Recarga la página e inténtalo de nuevo.");
    return;
  }

  const mount = document.createElement("div");
  mount.style.position = "absolute";
  mount.style.left = "-2200px";
  mount.style.top = "0";
  mount.style.width = "1100px";
  mount.style.background = "#fff";
  mount.style.pointerEvents = "none";

  mount.appendChild(createPdfStyleTag());
  mount.appendChild(createPdfRootSnapshot());
  document.body.appendChild(mount);

  const filename = `${sanitizePdfFilename(exam.examTitle || exam.title || "examen")}.pdf`;

  try {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await waitForImages(mount);

    await html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
          scrollX: 0,
          scrollY: 0,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(mount.querySelector(".pdf-export-root") || mount)
      .save();
  } catch (error) {
    console.error("Error al exportar PDF:", error);
    alert("No se pudo generar el PDF. Revisa la consola para más detalle.");
  } finally {
    mount.remove();
  }
}
