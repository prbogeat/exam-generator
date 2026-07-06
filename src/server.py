"""
Servidor HTTP simple para generación de exámenes desde la UI.
Maneja:
- GET / → Sirve los archivos estáticos (documentos en /docs)
- POST /api/generate-exam → Genera examen desde JSON configuracion
"""

from __future__ import annotations

import http.server
import json
import socketserver
import sys
from pathlib import Path
from typing import Any, Dict

# Importar la función de generación de exámenes
from generar_examen_lib import generate_exam_from_config
from exam_db import get_connection, get_exam_json_by_uid, get_latest_exam_json, list_exams

PORT = 8001
PROJECT_ROOT = Path(__file__).resolve().parent.parent  # raíz del proyecto (un nivel arriba de src/)
DOCS_DIR = PROJECT_ROOT / "docs"

class ExamGeneratorHandler(http.server.SimpleHTTPRequestHandler):
    def _send_json(self, status_code: int, payload: Dict[str, Any]) -> None:
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))

    def do_GET(self):
        """Servir archivos estáticos desde docs/"""
        if self.path == "/api/exams":
            try:
                with get_connection() as conn:
                    exams = list_exams(conn, limit=200)
                self._send_json(200, {"success": True, "exams": exams})
                return
            except Exception as e:
                self._send_json(500, {"success": False, "error": str(e)})
                return

        if self.path == "/api/exams/latest":
            try:
                with get_connection() as conn:
                    exam = get_latest_exam_json(conn)

                if exam is None:
                    self._send_json(404, {"success": False, "error": "No hay examenes en la base local."})
                    return

                self._send_json(200, {"success": True, "exam": exam})
                return
            except Exception as e:
                self._send_json(500, {"success": False, "error": str(e)})
                return

        if self.path.startswith("/api/exams/"):
            try:
                exam_uid = self.path.rsplit("/", 1)[-1].strip()
                if not exam_uid:
                    self._send_json(400, {"success": False, "error": "exam_uid vacio."})
                    return

                with get_connection() as conn:
                    exam = get_exam_json_by_uid(conn, exam_uid)

                if exam is None:
                    self._send_json(404, {"success": False, "error": "Examen no encontrado."})
                    return

                self._send_json(200, {"success": True, "exam": exam})
                return
            except Exception as e:
                self._send_json(500, {"success": False, "error": str(e)})
                return

        # No servir rutas /api como archivos
        if self.path.startswith("/api"):
            self.send_error(404, "Use POST para API")
            return

        if self.path == "/" or self.path == "":
            self.path = "/index.html"

        self.directory = str(DOCS_DIR)
        return super().do_GET()

    def do_POST(self):
        """Manejar POST de las APIs del proyecto"""
        if self.path == "/api/generate-exam":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length).decode("utf-8")
                request_data = json.loads(body)

                request_config = dict(request_data.get("config", {}))
                request_config["saveFiles"] = False
                result = generate_exam_from_config(
                    input_json_content=request_data.get("inputJson", ""),
                    config=request_config,
                )
                self._send_json(200, result)
                return

            except Exception as e:
                self._send_json(400, {"success": False, "error": str(e)})
                return

        self.send_error(404, "Endpoint no encontrado")

    def do_OPTIONS(self):
        """Manejar CORS preflight"""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        """Log personalizado"""
        print(f"[{self.log_date_time_string()}] {format % args}")


def run_server(port: int = PORT):
    """Iniciar servidor HTTP"""
    class ReusableThreadingTCPServer(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

    with ReusableThreadingTCPServer(("", port), ExamGeneratorHandler) as httpd:
        print(f"🚀 Servidor de generación de exámenes en http://localhost:{port}")
        print(f"   Documentos: {DOCS_DIR}")
        print(f"   API: POST http://localhost:{port}/api/generate-exam")
        print(f"\n   Presiona Ctrl+C para detener.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n👋 Servidor detenido.")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run_server(port)
