#!/usr/bin/env python3
"""
Script para renombrar los archivos de exámenes en input/banco_de_preguntas/
al formato estándar: UNED - Mes Año - Tipo (Parcial)
"""

import json
import re
import os
from pathlib import Path

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

def get_parcial_from_path(file_path: Path) -> str:
    """Determina el parcial basado en la ruta del archivo."""
    path_str = str(file_path).lower()
    if 'parcial 1' in path_str:
        return 'Parcial 1'
    elif 'parcial 2' in path_str:
        return 'Parcial 2'
    return ''

def extract_date_type_from_filename(filename: str) -> tuple:
    """
    Extrae mes, año y tipo del nombre del archivo.
    Ejemplos:
      - "Enero 2026 - Tipo A.json" -> ('Enero', '2026', 'A')
      - "Examen Junio-2024.json" -> ('Junio', '2024', None)
      - "Examen Septiembre-2023-D.json" -> ('Septiembre', '2023', 'D')
      - "Examen-Junio-A-2025.json" -> ('Junio', '2025', 'A')
    """
    filename = Path(filename).stem
    
    # Patrón 1: Mes Año - Tipo X (espacios)
    pattern1 = r'(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})\s*-?\s*tipo\s*([a-f])?'
    match1 = re.search(pattern1, filename, re.IGNORECASE)
    if match1:
        month = MONTHS_ES.get(match1.group(1).lower(), match1.group(1))
        year = match1.group(2)
        tipo = match1.group(3).upper() if match1.group(3) else None
        return (month, year, tipo)
    
    # Patrón 2: Mes-Ano-Tipo (Examen-Junio-A-2025)
    pattern2 = r'(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)-([a-f])-(\d{4})'
    match2 = re.search(pattern2, filename, re.IGNORECASE)
    if match2:
        month = MONTHS_ES.get(match2.group(1).lower(), match2.group(1))
        tipo = match2.group(2).upper()
        year = match2.group(3)
        return (month, year, tipo)
    
    # Patrón 3: Examen Mes-Año-Tipo (con guiones - Examen Junio-2023-A)
    pattern3 = r'(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)-(\d{4})-([a-f])'
    match3 = re.search(pattern3, filename, re.IGNORECASE)
    if match3:
        month = MONTHS_ES.get(match3.group(1).lower(), match3.group(1))
        year = match3.group(2)
        tipo = match3.group(3).upper()
        return (month, year, tipo)
    
    # Patrón 4: Examen Mes-Año (sin tipo - Examen Junio-2024)
    pattern4 = r'examen\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)-(\d{4})'
    match4 = re.search(pattern4, filename, re.IGNORECASE)
    if match4:
        month = MONTHS_ES.get(match4.group(1).lower(), match4.group(1))
        year = match4.group(2)
        return (month, year, None)
    
    # Patrón 5: Mes-Año (solo mes y año)
    pattern5 = r'-(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)-(\d{4})'
    match5 = re.search(pattern5, filename, re.IGNORECASE)
    if match5:
        month = MONTHS_ES.get(match5.group(1).lower(), match5.group(1))
        year = match5.group(2)
        return (month, year, None)
    
    return (None, None, None)

def generate_new_filename(old_filename: str, parcial: str) -> str:
    """Genera el nuevo nombre del archivo."""
    ext = Path(old_filename).suffix
    
    month, year, tipo = extract_date_type_from_filename(old_filename)
    
    if not month or not year:
        return None
    
    tipo_str = f" - Tipo {tipo}" if tipo else ""
    parcial_str = f" ({parcial})" if parcial else ""
    
    new_name = f"UNED - {month} {year}{tipo_str}{parcial_str}{ext}"
    return new_name

def rename_files_in_directory(directory: Path):
    """Renombra todos los archivos JSON en un directorio."""
    parcial = get_parcial_from_path(directory)
    
    json_files = list(directory.glob("*.json"))
    
    if not json_files:
        return []
    
    changes = []
    
    for file_path in json_files:
        old_name = file_path.name
        new_name = generate_new_filename(old_name, parcial)
        
        if new_name and new_name != old_name:
            new_path = file_path.parent / new_name
            
            try:
                file_path.rename(new_path)
                changes.append({
                    'old': old_name,
                    'new': new_name,
                    'path': str(directory)
                })
                print(f"✓ {directory.name}/")
                print(f"  {old_name}")
                print(f"  → {new_name}")
            except Exception as e:
                print(f"✗ Error renombrando {old_name}: {e}")
    
    return changes

def main():
    base_path = Path("input/banco_de_preguntas/psicobiologia")
    
    if not base_path.exists():
        print(f"Error: {base_path} no existe")
        return
    
    all_changes = []
    
    # Procesar Parcial 1
    parcial1_path = base_path / "Parcial 1"
    if parcial1_path.exists():
        print("\n" + "="*60)
        print("Procesando: Parcial 1")
        print("="*60)
        changes = rename_files_in_directory(parcial1_path)
        all_changes.extend(changes)
    
    # Procesar Parcial 2
    parcial2_path = base_path / "Parcial 2"
    if parcial2_path.exists():
        print("\n" + "="*60)
        print("Procesando: Parcial 2")
        print("="*60)
        changes = rename_files_in_directory(parcial2_path)
        all_changes.extend(changes)
    
    print("\n" + "="*60)
    print(f"Total de archivos renombrados: {len(all_changes)}")
    print("="*60)

if __name__ == "__main__":
    main()
