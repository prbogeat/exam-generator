#!/usr/bin/env python3
"""
Script para renombrar los archivos de exámenes generados en docs/assets/json/exams/
al formato estándar basado en el catálogo exams-index.json
"""

import json
import shutil
from pathlib import Path

def main():
    catalog_path = Path("docs/assets/json/exams-index.json")
    exams_base_path = Path("docs/assets/json/exams")
    
    if not catalog_path.exists():
        print(f"Error: {catalog_path} no existe")
        return
    
    # Leer el catálogo
    with open(catalog_path, 'r', encoding='utf-8') as f:
        catalog = json.load(f)
    
    print(f"Procesando {len(catalog['items'])} exámenes...")
    print()
    
    changes = []
    
    for item in catalog['items']:
        old_path = exams_base_path / item['examUid']
        
        if not old_path.exists():
            continue
        
        # Generar nuevo nombre basado en el examUid y examTitle
        # El examUid tiene la estructura: subject/parcial/filename.json
        # Queremos mantener la estructura de carpeta pero renombrar el archivo
        
        parts = item['examUid'].split('/')
        subject = parts[0]
        parcial = parts[1] if len(parts) > 1 else None
        
        # Crear nuevo nombre del archivo basado en el título (pero en minúsculas y con guiones)
        title = item['examTitle']
        # Convertir el título a un nombre de archivo válido
        new_filename = title.replace(' ', '-').replace('(', '').replace(')', '').lower()
        new_filename = new_filename.replace('---', '-').replace('--', '-')
        # Remover caracteres especiales
        new_filename = new_filename.replace('ó', 'o').replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ú', 'u')
        # Agregar extensión
        new_filename = f"{new_filename}.json"
        
        # Crear la nueva ruta
        if parcial:
            new_path = exams_base_path / subject / parcial / new_filename
        else:
            new_path = exams_base_path / subject / new_filename
        
        # Si la ruta ya existe y es el mismo archivo, saltar
        if new_path == old_path:
            continue
        
        # Si el archivo destino ya existe y es diferente, no sobrescribir
        if new_path.exists() and new_path != old_path:
            print(f"⚠ Archivo destino ya existe: {new_path}")
            continue
        
        try:
            new_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(old_path), str(new_path))
            changes.append({
                'old': str(old_path),
                'new': str(new_path),
                'title': title
            })
            print(f"✓ {subject} / {parcial if parcial else ''}")
            print(f"  {old_path.name}")
            print(f"  → {new_filename}")
            print()
        except Exception as e:
            print(f"✗ Error renombrando {old_path}: {e}")
    
    print("="*60)
    print(f"Total de archivos renombrados: {len(changes)}")
    print("="*60)

if __name__ == "__main__":
    main()
