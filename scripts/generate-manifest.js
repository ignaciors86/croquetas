#!/usr/bin/env node

/**
 * Script para generar tracks-manifest.json automáticamente
 * Escanea el directorio public/tracks y genera el manifest con todos los archivos
 */

const fs = require('fs');
const path = require('path');

const TRACKS_DIR = path.join(__dirname, '../public/tracks');
const MANIFEST_PATH = path.join(TRACKS_DIR, 'tracks-manifest.json');

// Extensiones de archivos por tipo
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
const GUION_EXTENSIONS = ['.js'];

// Carpetas a ignorar
const IGNORED_FOLDERS = ['backups', 'node_modules', '.git', '_backup_original'];

/**
 * Verifica si un archivo es de un tipo específico
 */
function isFileType(filePath, extensions) {
  const ext = path.extname(filePath).toLowerCase();
  return extensions.includes(ext);
}

/**
 * Obtiene todos los archivos de un directorio recursivamente
 */
function getAllFiles(dirPath, basePath = '', arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    const relativePath = path.join(basePath, file).replace(/\\/g, '/');
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Ignorar carpetas específicas
      if (!IGNORED_FOLDERS.includes(file)) {
        arrayOfFiles = getAllFiles(filePath, relativePath, arrayOfFiles);
      }
    } else {
      arrayOfFiles.push({
        path: relativePath,
        fullPath: filePath,
        name: file
      });
    }
  });

  return arrayOfFiles;
}

/**
 * Genera el manifest
 */
function generateManifest() {
  console.log('Escaneando directorio tracks...');
  
  if (!fs.existsSync(TRACKS_DIR)) {
    console.error(`Error: El directorio ${TRACKS_DIR} no existe`);
    process.exit(1);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    tracks: {}
  };

  // Obtener todas las carpetas principales (tracks)
  const trackFolders = fs.readdirSync(TRACKS_DIR)
    .filter(item => {
      const itemPath = path.join(TRACKS_DIR, item);
      return fs.statSync(itemPath).isDirectory() && !IGNORED_FOLDERS.includes(item);
    });

  trackFolders.forEach(trackName => {
    const trackPath = path.join(TRACKS_DIR, trackName);
    const trackData = {};

    // Obtener todas las subcarpetas (incluyendo __root__)
    const subfolders = ['__root__'];
    const items = fs.readdirSync(trackPath);
    
    items.forEach(item => {
      const itemPath = path.join(trackPath, item);
      if (fs.statSync(itemPath).isDirectory() && !IGNORED_FOLDERS.includes(item)) {
        subfolders.push(item);
      }
    });

    // Procesar cada subcarpeta
    subfolders.forEach(subfolder => {
      let folderPath;
      if (subfolder === '__root__') {
        folderPath = trackPath;
      } else {
        folderPath = path.join(trackPath, subfolder);
      }

      if (!fs.existsSync(folderPath)) {
        return;
      }

      // Obtener todos los archivos de esta carpeta
      const allFiles = getAllFiles(folderPath, subfolder === '__root__' ? trackName : `${trackName}/${subfolder}`);

      const audio = [];
      const images = [];
      const guiones = [];

      allFiles.forEach(file => {
        const relativePath = file.path;
        const url = `/tracks/${relativePath}`;

        if (isFileType(file.fullPath, AUDIO_EXTENSIONS)) {
          audio.push({
            path: relativePath,
            url: url,
            name: file.name
          });
        } else if (isFileType(file.fullPath, IMAGE_EXTENSIONS)) {
          images.push({
            path: relativePath,
            url: url,
            name: file.name
          });
        } else if (isFileType(file.fullPath, GUION_EXTENSIONS) && file.name === 'guion.js') {
          guiones.push({
            path: relativePath,
            url: url,
            name: file.name
          });
        }
      });

      // Ordenar arrays alfabéticamente por nombre
      audio.sort((a, b) => a.name.localeCompare(b.name));
      images.sort((a, b) => a.name.localeCompare(b.name));
      guiones.sort((a, b) => a.name.localeCompare(b.name));

      // Solo agregar la subcarpeta si tiene contenido
      if (audio.length > 0 || images.length > 0 || guiones.length > 0) {
        trackData[subfolder] = {
          audio,
          images,
          guiones
        };
      }
    });

    // Solo agregar el track si tiene al menos una subcarpeta con contenido
    if (Object.keys(trackData).length > 0) {
      manifest.tracks[trackName] = trackData;
    }
  });

  // Escribir el manifest
  fs.writeFileSync(
    MANIFEST_PATH,
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  console.log(`✓ Manifest generado exitosamente en ${MANIFEST_PATH}`);
  console.log(`✓ Tracks procesados: ${Object.keys(manifest.tracks).length}`);
  
  // Mostrar estadísticas
  let totalAudio = 0;
  let totalImages = 0;
  let totalGuiones = 0;
  
  Object.values(manifest.tracks).forEach(track => {
    Object.values(track).forEach(subfolder => {
      totalAudio += subfolder.audio.length;
      totalImages += subfolder.images.length;
      totalGuiones += subfolder.guiones.length;
    });
  });
  
  console.log(`✓ Total archivos: ${totalAudio} audios, ${totalImages} imágenes, ${totalGuiones} guiones`);
}

// Ejecutar
try {
  generateManifest();
} catch (error) {
  console.error('Error generando manifest:', error);
  process.exit(1);
}

