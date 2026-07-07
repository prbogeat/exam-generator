#!/usr/bin/env python3
"""
Script para homogeneizar los nombres de exámenes en el catálogo.
Patrón objetivo:
  - Con parcial: {Asignatura} - {Mes} {Año} - Tipo {X} (Parcial {N})
  - Sin parcial: {Asignatura} - {Mes} {Año} - Tipo {X}
  - Casos especiales: Mantener como están (Banco completo, 40 al azar, etc.)
"""

import json
import re
from pathlib import Path
from datetime import datetime

MONTHS_ES = {
    'enero': 'Enero',
    'febrero': 'Febrero',
    'marzo': 'Marzo',
    'abril': 'Abril',
    'mayo': 'Mayo',
    'junio': 'Junio',
    'julio': 'Julio',
    'agosto': 'Agosto',
    'septiembre': 'Septiembre',
    'octubre': 'Octubre',
    'noviembre': 'Noviembre',
    'diciembre': 'Diciembre',
}

def extract_date_and_type_from_uid(uid: str) -> tuple:
    """
    Extrae mes, año y tipo del examUid.
    Ejemplos:
      - enero-2026-tipo-a.json -> ('Enero', '2026', 'A')
      - junio-2026-c.json -> ('Junio', '2026', 'C')
      - junio-a-2025.json -> ('Junio', '2025', 'A')
      - examen-uned-1.json -> (None, None, None)
    """
    filename = Path(uid).stem
    
    # Patrón 1: mes-año-tipo-X (enero-2026-tipo-a)
    pattern1 = r'(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)-(\d{4})[-tipo]*([a-z])?'
    match1 = re.search(pattern1, filename)
    
    if match1:
        month_es = MONTHS_ES.get(match1.group(1), match1.group(1))
        year = match1.group(2)
        tipo = match1.group(3).upper() if match1.group(3) else None
        return (month_es, year, tipo)
    
    # Patrón 2: mes-tipo-año (junio-a-2025)
    pattern2 = r'(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)-([a-z])-(\d{4})'
    match2 = re.search(pattern2, filename)
    
    if match2:
        month_es = MONTHS_ES.get(match2.group(1), match2.group(1))
        tipo = match2.group(2).upper()
        year = match2.group(3)
        return (month_es, year, tipo)
    
    # Patrón 3: mes-año (sin tipo explícito)
    pattern3 = r'(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)-(\d{4})'
    match3 = re.search(pattern3, filename)
    
    if match3:
        month_es = MONTHS_ES.get(match3.group(1), match3.group(1))
        year = match3.group(2)
        return (month_es, year, None)
    
    return (None, None, None)

def generate_title(item: dict) -> str:
    """
    Genera el título homogeneizado para un examen.
    """
    subject = item['subject']
    partial = item['partial']
    uid = item['examUid']
    
    # Casos especiales que no siguen el patrón
    filename = Path(uid).stem
    
    # Caso: Banco completo (generación automática)
    if 'generado' in filename and '250' in str(item.get('totalQuestions', '')):
        return f"{subject} - Banco completo"
    
    # Caso: 40 al azar (sin fecha)
    if '40' in filename and 'azar' in filename:
        return f"{subject} - 40 al azar"
    
    # Caso: Examen generado (sin fecha específica)
    if 'examen-generado' in filename:
        partial_str = f" ({partial})" if partial else ""
        return f"{subject} - Examen Generado{partial_str}"
    
    # Caso: examen-uned-40-X (40 preguntas con tipo) - DEBE IR ANTES de examen-uned-(\d+)
    match_40 = re.match(r'examen-uned-40-([a-z])', filename)
    if match_40:
        tipo = match_40.group(1).upper()
        # Caso especial: 40-a es "al azar"
        if tipo == 'A':
            return f"{subject} - 40 al azar"
        partial_str = f" ({partial})" if partial else ""
        return f"{subject} - 40 Tipo {tipo}{partial_str}"
    
    # Caso: examen-uned-1, examen-uned-2, etc. (sin fecha)
    # Estos no tienen información de fecha en el nombre, usamos el número como referencia
    match_num = re.match(r'examen-uned-(\d+)', filename)
    if match_num:
        number = match_num.group(1)
        partial_str = f" ({partial})" if partial else ""
        return f"{subject} - Examen UNED {number}{partial_str}"
    
    # Caso estándar: tiene mes, año y posiblemente tipo
    month, year, tipo = extract_date_and_type_from_uid(uid)
    
    if month and year:
        # Extraer tipo de la estructura si no está en el UID
        if not tipo and filename:
            # Buscar letra final: -a, -b, -c, etc.
            tipo_match = re.search(r'tipo-([a-z])', filename)
            if tipo_match:
                tipo = tipo_match.group(1).upper()
            else:
                # Último carácter si es letra
                match = re.search(r'-([a-z])\.json$', uid)
                if match:
                    tipo = match.group(1).upper()
        
        tipo_str = f" - Tipo {tipo}" if tipo else ""
        partial_str = f" ({partial})" if partial else ""
        
        return f"{subject} - {month} {year}{tipo_str}{partial_str}"
    
    # Fallback: mantener algo sensible
    partial_str = f" ({partial})" if partial else ""
    return f"{subject}{partial_str}"

def main():
    # Ruta del archivo de catálogo
    catalog_path = Path("docs/assets/json/exams-index.json")
    
    if not catalog_path.exists():
        print(f"Error: {catalog_path} no existe")
        return
    
    # Leer el catálogo
    with open(catalog_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"Procesando {len(data['items'])} exámenes...")
    print()
    
    # Procesar cada examen
    changes = []
    for item in data['items']:
        old_title = item['examTitle']
        new_title = generate_title(item)
        
        if old_title != new_title:
            changes.append({
                'uid': item['examUid'],
                'old': old_title,
                'new': new_title
            })
            item['examTitle'] = new_title
            print(f"[OK] {item['subject']}")
            print(f"  Anterior: {old_title}")
            print(f"  Nuevo:   {new_title}")
            print()
    
    # Actualizar timestamp
    data['generatedAt'] = datetime.now().isoformat() + "+00:00"
    
    # Guardar el archivo actualizado
    with open(catalog_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\n{'='*60}")
    print(f"Cambios realizados: {len(changes)}/{len(data['items'])}")
    print(f"Archivo actualizado: {catalog_path}")
    print(f"{'='*60}")
    
    # Mostrar resumen de cambios
    if changes:
        print("\nResumen de cambios:")
        for change in changes:
            print(f"\n  {Path(change['uid']).stem}")
            print(f"  {change['old']} -> {change['new']}")

if __name__ == "__main__":
    main()
