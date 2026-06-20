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
from urllib.parse import urlparse, parse_qs
from typing import Any, Dict

# Importar la función de generación de exámenes
from generar_examen_lib import generate_exam_from_config

PORT = 8001
PROJECT_ROOT = Path(__file__).resolve().parent.parent  # raíz del proyecto (un nivel arriba de src/)
DOCS_DIR = PROJECT_ROOT / "docs"
OUTPUT_ROOT = PROJECT_ROOT / "out" / "examenes"

class ExamGeneratorHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        """Servir archivos estáticos desde docs/"""
        # No servir rutas /api como archivos
        if self.path.startswith("/api"):
            self.send_error(404, "Use POST para API")
            return

        if self.path == "/" or self.path == "":
            self.path = "/index.html"

        self.directory = str(DOCS_DIR)
        return super().do_GET()

    def do_POST(self):
        """Manejar POST /api/generate-exam"""
        if self.path != "/api/generate-exam":
            self.send_error(404, "Endpoint no encontrado")
            return

        try:
            # Leer contenido del POST
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            request_data = json.loads(body)

            # Generar examen
            request_config = dict(request_data.get("config", {}))
            request_config["saveFiles"] = False
            result = generate_exam_from_config(
                input_json_content=request_data.get("inputJson", ""),
                config=request_config,
            )
            # Responder con resultado
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8"))

        except Exception as e:
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            error_response = {"success": False, "error": str(e)}
            self.wfile.write(json.dumps(error_response, ensure_ascii=False).encode("utf-8"))

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
    with socketserver.TCPServer(("", port), ExamGeneratorHandler) as httpd:
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
