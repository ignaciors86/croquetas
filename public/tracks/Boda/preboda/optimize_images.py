#!/usr/bin/env python3
"""
Script para optimizar imágenes, videos y GIFs
- Optimiza imágenes reduciendo tamaño manteniendo alta calidad
- Convierte videos a GIFs optimizados (2 segundos de la parte central, máximo 300KB)
- Optimiza GIFs existentes para que no ocupen más de 300KB
"""

import os
import subprocess
import sys
from PIL import Image
import shutil
from pathlib import Path

# Configuración
MAX_HEIGHT = 600  # Altura máxima en píxeles (solo para imágenes que midan más)
QUALITY = 92  # Calidad JPEG (85-95 es un buen rango, 92 es alta calidad)
BACKUP_DIR = "_backup_original"
MAX_GIF_SIZE_KB = 300  # Tamaño máximo para GIFs en KB
GIF_DURATION = 2  # Duración del GIF en segundos (tomado de la parte central del video)

def optimize_image(input_path, output_path, max_height=MAX_HEIGHT, quality=QUALITY):
    """Optimiza una imagen reduciendo su tamaño manteniendo alta calidad"""
    try:
        with Image.open(input_path) as img:
            # Obtener dimensiones originales
            original_width, original_height = img.size
            
            # Calcular nuevas dimensiones manteniendo proporción
            # Solo redimensionar si la altura es mayor que max_height
            if original_height > max_height:
                # Calcular ancho proporcional basado en la altura máxima
                new_height = max_height
                new_width = int((original_width / original_height) * max_height)
                
                # Redimensionar con alta calidad (LANCZOS es el mejor algoritmo)
                img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Guardar optimizado
            input_path_str = str(input_path).lower()
            if img.format == 'JPEG' or input_path_str.endswith('.jpg') or input_path_str.endswith('.jpeg'):
                img.save(output_path, 'JPEG', quality=quality, optimize=True)
            elif img.format == 'PNG' or input_path_str.endswith('.png'):
                img.save(output_path, 'PNG', optimize=True)
            elif img.format == 'WEBP' or input_path_str.endswith('.webp'):
                img.save(output_path, 'WEBP', quality=quality, optimize=True)
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

def get_video_duration(video_path):
    """Obtiene la duración del video en segundos usando ffprobe"""
    try:
        cmd = [
            'ffprobe', '-v', 'error', '-show_entries',
            'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1',
            str(video_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(result.stdout.strip())
    except (subprocess.CalledProcessError, ValueError, FileNotFoundError):
        return None

def convert_video_to_gif(video_path, output_path, duration=GIF_DURATION, max_size_kb=MAX_GIF_SIZE_KB):
    """Convierte un video a GIF optimizado (2 segundos de la parte central, máximo 300KB)"""
    try:
        # Obtener duración del video
        video_duration = get_video_duration(video_path)
        if video_duration is None:
            return {'success': False, 'error': 'No se pudo obtener la duración del video'}
        
        # Calcular punto de inicio (parte central del video)
        if video_duration <= duration:
            start_time = 0
            actual_duration = video_duration
        else:
            start_time = (video_duration - duration) / 2
            actual_duration = duration
        
        # Obtener dimensiones del video
        cmd_probe = [
            'ffprobe', '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0',
            str(video_path)
        ]
        result = subprocess.run(cmd_probe, capture_output=True, text=True, check=True)
        width, height = map(int, result.stdout.strip().split('x'))
        
        # Redimensionar si es necesario (máximo 800px de ancho para GIFs)
        max_gif_width = 800
        if width > max_gif_width:
            scale = f"scale={max_gif_width}:-1"
        else:
            scale = "scale=-1:-1"
        
        # Convertir a GIF usando ffmpeg con paleta optimizada
        palette_path = output_path.parent / f"{output_path.stem}_palette.png"
        
        # Generar paleta
        cmd_palette = [
            'ffmpeg', '-y', '-ss', str(start_time), '-t', str(actual_duration),
            '-i', str(video_path), '-vf', f'{scale},fps=15,palettegen',
            str(palette_path)
        ]
        subprocess.run(cmd_palette, capture_output=True, check=True)
        
        # Crear GIF con paleta
        cmd_gif = [
            'ffmpeg', '-y', '-ss', str(start_time), '-t', str(actual_duration),
            '-i', str(video_path), '-i', str(palette_path),
            '-lavfi', f'{scale},fps=15[x];[x][1:v]paletteuse',
            str(output_path)
        ]
        subprocess.run(cmd_gif, capture_output=True, check=True)
        
        # Limpiar paleta temporal
        if palette_path.exists():
            palette_path.unlink()
        
        # Optimizar GIF con gifsicle si está disponible
        gif_size_kb = os.path.getsize(output_path) / 1024
        if gif_size_kb > max_size_kb:
            # Intentar optimizar con gifsicle
            try:
                cmd_optimize = [
                    'gifsicle', '--optimize=3', '--colors', '256',
                    '--lossy=30', '-o', str(output_path), str(output_path)
                ]
                subprocess.run(cmd_optimize, capture_output=True, check=True)
                gif_size_kb = os.path.getsize(output_path) / 1024
            except (subprocess.CalledProcessError, FileNotFoundError):
                pass
        
        # Si aún es muy grande, reducir más la calidad
        if gif_size_kb > max_size_kb:
            # Redimensionar más agresivamente
            max_gif_width = 600
            if width > max_gif_width:
                scale = f"scale={max_gif_width}:-1"
                palette_path = output_path.parent / f"{output_path.stem}_palette2.png"
                
                cmd_palette = [
                    'ffmpeg', '-y', '-ss', str(start_time), '-t', str(actual_duration),
                    '-i', str(video_path), '-vf', f'{scale},fps=12,palettegen',
                    str(palette_path)
                ]
                subprocess.run(cmd_palette, capture_output=True, check=True)
                
                cmd_gif = [
                    'ffmpeg', '-y', '-ss', str(start_time), '-t', str(actual_duration),
                    '-i', str(video_path), '-i', str(palette_path),
                    '-lavfi', f'{scale},fps=12[x];[x][1:v]paletteuse',
                    str(output_path)
                ]
                subprocess.run(cmd_gif, capture_output=True, check=True)
                
                if palette_path.exists():
                    palette_path.unlink()
                
                gif_size_kb = os.path.getsize(output_path) / 1024
        
        original_size = os.path.getsize(video_path) if video_path.exists() else 0
        new_size = os.path.getsize(output_path)
        
        return {
            'success': True,
            'original_size': original_size,
            'new_size': new_size,
            'gif_size_kb': gif_size_kb,
            'duration': actual_duration,
            'start_time': start_time
        }
    except subprocess.CalledProcessError as e:
        return {'success': False, 'error': f'Error en ffmpeg: {str(e)}'}
    except FileNotFoundError:
        return {'success': False, 'error': 'ffmpeg no está instalado. Instala ffmpeg para convertir videos.'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def optimize_gif(gif_path, max_size_kb=MAX_GIF_SIZE_KB):
    """Optimiza un GIF existente para que no ocupe más de 300KB"""
    try:
        original_size = os.path.getsize(gif_path)
        original_size_kb = original_size / 1024
        
        if original_size_kb <= max_size_kb:
            return {
                'success': True,
                'original_size': original_size,
                'new_size': original_size,
                'gif_size_kb': original_size_kb,
                'optimized': False,
                'message': 'Ya está dentro del límite'
            }
        
        # Intentar optimizar con gifsicle
        try:
            cmd_optimize = [
                'gifsicle', '--optimize=3', '--colors', '256',
                '--lossy=30', '-o', str(gif_path), str(gif_path)
            ]
            subprocess.run(cmd_optimize, capture_output=True, check=True)
            
            new_size = os.path.getsize(gif_path)
            new_size_kb = new_size / 1024
            
            # Si aún es muy grande, reducir más agresivamente
            if new_size_kb > max_size_kb:
                cmd_optimize = [
                    'gifsicle', '--optimize=3', '--colors', '128',
                    '--lossy=50', '--resize-width', '600', '-o', str(gif_path), str(gif_path)
                ]
                subprocess.run(cmd_optimize, capture_output=True, check=True)
                new_size = os.path.getsize(gif_path)
                new_size_kb = new_size / 1024
            
            return {
                'success': True,
                'original_size': original_size,
                'new_size': new_size,
                'gif_size_kb': new_size_kb,
                'optimized': True
            }
        except (subprocess.CalledProcessError, FileNotFoundError):
            # Si gifsicle no está disponible, intentar con PIL (menos efectivo)
            with Image.open(gif_path) as img:
                # Redimensionar si es muy grande
                width, height = img.size
                if width > 600:
                    new_width = 600
                    new_height = int((height / width) * 600)
                    img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                
                # Guardar optimizado
                img.save(gif_path, 'GIF', optimize=True, save_all=True)
                new_size = os.path.getsize(gif_path)
                new_size_kb = new_size / 1024
                
                return {
                    'success': True,
                    'original_size': original_size,
                    'new_size': new_size,
                    'gif_size_kb': new_size_kb,
                    'optimized': True,
                    'method': 'PIL'
                }
    except Exception as e:
        return {'success': False, 'error': str(e)}

def main():
    # Directorio actual
    current_dir = Path(__file__).parent
    
    # Obtener todas las imágenes
    image_extensions = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG', '.webp', '.WEBP']
    images = []
    for ext in image_extensions:
        images.extend(list(current_dir.glob(f'*{ext}')))
    
    # Obtener todos los videos
    video_extensions = ['.mp4', '.mov', '.avi', '.MP4', '.MOV', '.AVI']
    videos = []
    for ext in video_extensions:
        videos.extend(list(current_dir.glob(f'*{ext}')))
    
    # Obtener todos los GIFs
    gifs = list(current_dir.glob('*.gif')) + list(current_dir.glob('*.GIF'))
    
    # Filtrar el script y el backup
    images = [img for img in images if img.name != 'optimize_images.py' and not img.name.startswith('_')]
    videos = [vid for vid in videos if not vid.name.startswith('_')]
    gifs = [gif for gif in gifs if not gif.name.startswith('_')]
    
    total_files = len(images) + len(videos) + len(gifs)
    if total_files == 0:
        print("No se encontraron archivos para optimizar.")
        return
    
    print(f"Encontrados:")
    print(f"  - {len(images)} imágenes")
    print(f"  - {len(videos)} videos")
    print(f"  - {len(gifs)} GIFs")
    print(f"Altura máxima imágenes: {MAX_HEIGHT}px (ancho proporcional), Calidad JPEG: {QUALITY}")
    print(f"GIFs: máximo {MAX_GIF_SIZE_KB}KB, duración: {GIF_DURATION}s (parte central)")
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
    
    # Procesar imágenes
    for img_path in images:
        print(f"Procesando imagen: {img_path.name}...", end=' ')
        
        # Hacer backup si no existe
        backup_file = backup_path / img_path.name
        if not backup_file.exists():
            shutil.copy2(img_path, backup_file)
        
        # Optimizar
        result = optimize_image(img_path, img_path, MAX_HEIGHT, QUALITY)
        
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
    
    # Procesar videos (convertir a GIF)
    for video_path in videos:
        print(f"Procesando video: {video_path.name}...", end=' ')
        
        # Hacer backup si no existe
        backup_file = backup_path / video_path.name
        if not backup_file.exists():
            shutil.copy2(video_path, backup_file)
        
        # Convertir a GIF
        gif_path = video_path.with_suffix('.gif')
        result = convert_video_to_gif(video_path, gif_path, GIF_DURATION, MAX_GIF_SIZE_KB)
        
        if result['success']:
            successful += 1
            total_original_size += result['original_size']
            total_new_size += result['new_size']
            print(f"OK - GIF creado: {result['gif_size_kb']:.1f}KB "
                  f"(duración: {result['duration']:.1f}s desde {result['start_time']:.1f}s)")
        else:
            failed += 1
            print(f"ERROR: {result['error']}")
    
    # Procesar GIFs existentes
    for gif_path in gifs:
        print(f"Procesando GIF: {gif_path.name}...", end=' ')
        
        # Hacer backup si no existe
        backup_file = backup_path / gif_path.name
        if not backup_file.exists():
            shutil.copy2(gif_path, backup_file)
        
        # Optimizar GIF
        result = optimize_gif(gif_path, MAX_GIF_SIZE_KB)
        
        if result['success']:
            if result.get('optimized', False):
                successful += 1
                total_original_size += result['original_size']
                total_new_size += result['new_size']
                reduction_kb = (result['original_size'] - result['new_size']) / 1024
                print(f"OK - {reduction_kb:.1f}KB reducido ({result['gif_size_kb']:.1f}KB final)")
            else:
                print(f"OK - {result.get('message', 'Ya optimizado')} ({result['gif_size_kb']:.1f}KB)")
        else:
            failed += 1
            print(f"ERROR: {result['error']}")
    
    print("-" * 60)
    print(f"Proceso completado:")
    print(f"  Exitosas: {successful}")
    print(f"  Fallidas: {failed}")
    if successful > 0:
        total_reduction = ((total_original_size - total_new_size) / total_original_size) * 100 if total_original_size > 0 else 0
        total_reduction_mb = (total_original_size - total_new_size) / (1024 * 1024)
        print(f"  Tamaño original: {total_original_size / (1024 * 1024):.2f} MB")
        print(f"  Tamaño optimizado: {total_new_size / (1024 * 1024):.2f} MB")
        print(f"  Reducción total: {total_reduction_mb:.2f} MB ({total_reduction:.1f}%)")
    print(f"\nBackups guardados en: {BACKUP_DIR}/")

if __name__ == '__main__':
    main()

