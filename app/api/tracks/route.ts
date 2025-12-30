import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const TRACKS_DIR = path.join(process.cwd(), 'public', 'tracks');
const IGNORED_FOLDERS = ['backups', 'node_modules', '.git', '_backup_original'];

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
const GUION_EXTENSIONS = ['.js'];

function isFileType(filePath: string, extensions: string[]): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return extensions.includes(ext);
}

function getAllFiles(dirPath: string, basePath: string = '', arrayOfFiles: Array<{path: string, fullPath: string, name: string}> = []): Array<{path: string, fullPath: string, name: string}> {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, basePath, arrayOfFiles);
    } else {
      arrayOfFiles.push({
        path: path.join(basePath, file).replace(/\\/g, '/'),
        fullPath: filePath,
        name: file
      });
    }
  });

  return arrayOfFiles;
}

export async function GET() {
  try {
    if (!fs.existsSync(TRACKS_DIR)) {
      return NextResponse.json({ error: 'Tracks directory not found' }, { status: 404 });
    }

    const tracks: Record<string, any> = {};
    const trackFolders = fs.readdirSync(TRACKS_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && !IGNORED_FOLDERS.includes(dirent.name))
      .map(dirent => dirent.name);

    trackFolders.forEach(trackName => {
      const trackPath = path.join(TRACKS_DIR, trackName);
      const trackData: Record<string, any> = {};

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
        let folderPath: string;
        if (subfolder === '__root__') {
          folderPath = trackPath;
        } else {
          folderPath = path.join(trackPath, subfolder);
        }

        if (!fs.existsSync(folderPath)) {
          return;
        }

        const audio: Array<{path: string, url: string, name: string}> = [];
        const images: Array<{path: string, url: string, name: string}> = [];
        const guiones: Array<{path: string, url: string, name: string}> = [];

        let filesToProcess: Array<{path: string, fullPath: string, name: string}> = [];
        
        if (subfolder === '__root__') {
          // Para __root__, obtener solo archivos directamente en la carpeta del track (no subcarpetas)
          const items = fs.readdirSync(folderPath);
          items.forEach(item => {
            const itemPath = path.join(folderPath, item);
            const stat = fs.statSync(itemPath);
            // Solo archivos, no directorios (las subcarpetas se procesan por separado)
            if (stat.isFile() && !IGNORED_FOLDERS.includes(item)) {
              filesToProcess.push({
                path: `${trackName}/${item}`,
                fullPath: itemPath,
                name: item
              });
            }
          });
        } else {
          // Para subcarpetas, obtener TODOS los archivos recursivamente dentro de esa subcarpeta
          filesToProcess = getAllFiles(folderPath, `${trackName}/${subfolder}`);
        }

        filesToProcess.forEach(file => {
          const relativePath = file.path;
          const url = `/tracks/${relativePath}`;

          const fileEntry = {
            path: relativePath,
            url: url,
            name: file.name
          };

          if (isFileType(file.fullPath, AUDIO_EXTENSIONS)) {
            audio.push(fileEntry);
          } else if (isFileType(file.fullPath, IMAGE_EXTENSIONS)) {
            images.push(fileEntry);
          } else if (isFileType(file.fullPath, GUION_EXTENSIONS) && file.name === 'guion.js') {
            guiones.push(fileEntry);
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
        tracks[trackName] = trackData;
      }
    });

    return NextResponse.json({ tracks, generatedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('Error scanning tracks directory:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

