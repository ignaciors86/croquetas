#!/usr/bin/env python3
"""
Script para optimizar imágenes de la colección bodita
Reduce el tamaño manteniendo alta calidad
"""

import os
from PIL import Image
import shutil
from pathlib import Path

# Configuración
MAX_SIZE = 1920  # Tamaño máximo en píxeles (ancho o alto)
QUALITY = 92  # Calidad JPEG (85-95 es un buen rango, 92 es alta calidad)
BACKUP_DIR = "_backup_original"

def optimize_image(input_path, output_path, max_size=MAX_SIZE, quality=QUALITY):
    """Optimiza una imagen reduciendo su tamaño manteniendo alta calidad"""
    try:
        with Image.open(input_path) as img:
            # Obtener dimensiones originales
            original_width, original_height = img.size
            
            # Calcular nuevas dimensiones manteniendo proporción
            if original_width > max_size or original_height > max_size:
                if original_width > original_height:
                    new_width = max_size
                    new_height = int((original_height / original_width) * max_size)
                else:
                    new_height = max_size
                    new_width = int((original_width / original_height) * max_size)
                
                # Redimensionar con alta calidad (LANCZOS es el mejor algoritmo)
                img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Guardar optimizado
            if img.format == 'JPEG' or input_path.lower().endswith('.jpg') or input_path.lower().endswith('.jpeg'):
                img.save(output_path, 'JPEG', quality=quality, optimize=True)
            elif img.format == 'PNG' or input_path.lower().endswith('.png'):
                img.save(output_path, 'PNG', optimize=True)
            else:
                img.save(output_path, quality=quality, optimize=True)
            
            # Obtener tamaños de archivo
            original_size = os.path.getsize(input_path)
            new_size = os.path.getsize(output_path)
            reduction = ((original_size - new_size) / original_size) * 100
            
            return {
                'success': True,
                'original_size': original_size,
                'new_size': new_size,
                'reduction': reduction,
                'original_dimensions': (original_width, original_height),
                'new_dimensions': img.size
            }
    except Exception as e:
        return {'success': False, 'error': str(e)}

def main():
    # Directorio actual
    current_dir = Path(__file__).parent
    
    # Obtener todas las imágenes
    image_extensions = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG']
    images = []
    for ext in image_extensions:
        images.extend(list(current_dir.glob(f'*{ext}')))
    
    # Filtrar el script y el backup
    images = [img for img in images if img.name != 'optimize_images.py' and not img.name.startswith('_')]
    
    if not images:
        print("No se encontraron imágenes para optimizar.")
        return
    
    print(f"Encontradas {len(images)} imágenes para optimizar.")
    print(f"Tamaño máximo: {MAX_SIZE}px, Calidad JPEG: {QUALITY}")
    print("-" * 60)
    
    # Crear backup si no existe
    backup_path = current_dir / BACKUP_DIR
    if not backup_path.exists():
        backup_path.mkdir()
        print(f"Creada carpeta de backup: {BACKUP_DIR}")
    
    total_original_size = 0
    total_new_size = 0
    successful = 0
    failed = 0
    
    for img_path in images:
        print(f"Procesando: {img_path.name}...", end=' ')
        
        # Hacer backup si no existe
        backup_file = backup_path / img_path.name
        if not backup_file.exists():
            shutil.copy2(img_path, backup_file)
        
        # Optimizar
        result = optimize_image(img_path, img_path, MAX_SIZE, QUALITY)
        
        if result['success']:
            successful += 1
            total_original_size += result['original_size']
            total_new_size += result['new_size']
            reduction_mb = (result['original_size'] - result['new_size']) / (1024 * 1024)
            print(f"OK - {reduction_mb:.2f}MB reducido "
                  f"({result['original_dimensions'][0]}x{result['original_dimensions'][1]} -> "
                  f"{result['new_dimensions'][0]}x{result['new_dimensions'][1]})")
        else:
            failed += 1
            print(f"ERROR: {result['error']}")
    
    print("-" * 60)
    print(f"Proceso completado:")
    print(f"  Exitosas: {successful}")
    print(f"  Fallidas: {failed}")
    if successful > 0:
        total_reduction = ((total_original_size - total_new_size) / total_original_size) * 100
        total_reduction_mb = (total_original_size - total_new_size) / (1024 * 1024)
        print(f"  Tamaño original: {total_original_size / (1024 * 1024):.2f} MB")
        print(f"  Tamaño optimizado: {total_new_size / (1024 * 1024):.2f} MB")
        print(f"  Reducción total: {total_reduction_mb:.2f} MB ({total_reduction:.1f}%)")
    print(f"\nBackups guardados en: {BACKUP_DIR}/")

if __name__ == '__main__':
    main()

