#!/usr/bin/env python3
"""
Script para optimizar todas las imágenes en todas las carpetas de tracks
Ejecuta el script de optimización en cada subcarpeta que contenga imágenes
"""

import os
import subprocess
import sys
from pathlib import Path

def find_optimize_script():
    """Busca el script de optimización en las carpetas de tracks"""
    tracks_dir = Path("public/tracks")
    if not tracks_dir.exists():
        print(f"Error: No se encuentra el directorio {tracks_dir}")
        return None
    
    # Buscar el script de optimización
    optimize_script = tracks_dir / "Boda" / "Boda (2)" / "d - baile" / "optimize_images.py"
    if optimize_script.exists():
        return optimize_script
    
    # Si no se encuentra, buscar en cualquier subcarpeta
    for script_path in tracks_dir.rglob("optimize_images.py"):
        return script_path
    
    return None

def copy_script_to_dirs(tracks_dir, optimize_script):
    """Copia el script de optimización a cada carpeta que tenga imágenes"""
    image_extensions = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG', '.webp', '.WEBP']
    
    # Obtener todas las carpetas que contengan imágenes
    dirs_with_images = set()
    for ext in image_extensions:
        for img_path in tracks_dir.rglob(f'*{ext}'):
            # Excluir backups y el script mismo
            if '_backup' not in str(img_path) and 'optimize_images.py' not in str(img_path):
                dirs_with_images.add(img_path.parent)
    
    print(f"Encontradas {len(dirs_with_images)} carpetas con imágenes")
    print("-" * 60)
    
    # Copiar script a cada carpeta si no existe
    import shutil
    for img_dir in sorted(dirs_with_images):
        target_script = img_dir / "optimize_images.py"
        if not target_script.exists():
            try:
                rel_dir = img_dir.relative_to(Path.cwd())
                print(f"Copiando script a: {rel_dir}")
            except ValueError:
                print(f"Copiando script a: {img_dir}")
            shutil.copy2(optimize_script, target_script)
    
    return dirs_with_images

def main():
    tracks_dir = Path("public/tracks")
    if not tracks_dir.exists():
        print(f"Error: No se encuentra el directorio {tracks_dir}")
        return
    
    # Buscar el script de optimización
    optimize_script = find_optimize_script()
    if not optimize_script:
        print("Error: No se encontró el script optimize_images.py")
        print("Asegúrate de que existe en alguna carpeta de tracks")
        return
    
    try:
        rel_path = optimize_script.relative_to(Path.cwd())
        print(f"Script de optimización encontrado en: {rel_path}")
    except ValueError:
        print(f"Script de optimización encontrado en: {optimize_script}")
    print("-" * 60)
    
    # Copiar script a todas las carpetas con imágenes
    dirs_with_images = copy_script_to_dirs(tracks_dir, optimize_script)
    
    if not dirs_with_images:
        print("No se encontraron carpetas con imágenes para optimizar.")
        return
    
    print("-" * 60)
    print("Ejecutando optimización en cada carpeta...")
    print("-" * 60)
    
    # Ejecutar el script en cada carpeta
    successful_dirs = 0
    failed_dirs = 0
    
    for img_dir in sorted(dirs_with_images):
        script_path = img_dir / "optimize_images.py"
        if script_path.exists():
            print(f"\n{'='*60}")
            try:
                rel_dir = img_dir.relative_to(Path.cwd())
                print(f"Procesando: {rel_dir}")
            except ValueError:
                print(f"Procesando: {img_dir}")
            print(f"{'='*60}")
            
            try:
                # Cambiar al directorio y ejecutar el script
                # Usar path absoluto para evitar problemas
                abs_script_path = script_path.resolve()
                abs_img_dir = img_dir.resolve()
                
                result = subprocess.run(
                    [sys.executable, str(abs_script_path)],
                    cwd=str(abs_img_dir),
                    capture_output=False,
                    text=True
                )
                
                if result.returncode == 0:
                    successful_dirs += 1
                else:
                    failed_dirs += 1
                    print(f"Error ejecutando script en {img_dir}")
            except Exception as e:
                failed_dirs += 1
                print(f"Error ejecutando script en {img_dir}: {e}")
    
    print("\n" + "=" * 60)
    print("Resumen:")
    print(f"  Carpetas procesadas exitosamente: {successful_dirs}")
    print(f"  Carpetas con errores: {failed_dirs}")
    print("=" * 60)

if __name__ == '__main__':
    main()

