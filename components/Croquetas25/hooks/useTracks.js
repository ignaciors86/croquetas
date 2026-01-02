import { useState, useEffect } from 'react';

const normalizeName = (name) => name?.toLowerCase().replace(/\s+/g, '-') || '';

/**
 * Hook para cargar tracks desde el manifest JSON
 * - Tracks normales: imágenes secuenciales por subcarpeta, asociadas a audios por subcarpeta
 * - Croquetas25: imágenes mezcladas de todas las carpetas
 */
export const useTracks = () => {
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadTracks = async () => {
      try {
        // Cargar manifest desde la API route
        const response = await fetch('/api/tracks');
        if (!response.ok) {
          throw new Error(`Failed to load tracks manifest: ${response.status}`);
        }
        const manifest = await response.json();
        const { tracks: tracksData } = manifest;
        const tracksMap = new Map();

        // Procesar cada track del manifest
        Object.keys(tracksData).forEach(trackName => {
          if (!isValidTrackName(trackName)) return;
          
          const trackKey = normalizeName(trackName);
          const trackData = tracksData[trackName];
          
          // Crear estructura del track
          const track = {
            id: trackKey,
            name: trackName,
            imagesBySubfolder: new Map(),
            guionesBySubfolder: new Map(),
            audioBySubfolder: new Map()
          };
          
          // Procesar subcarpetas
          Object.keys(trackData).forEach(subfolder => {
            const subfolderData = trackData[subfolder];
            
            // Procesar imágenes
            if (subfolderData.images && subfolderData.images.length > 0) {
              track.imagesBySubfolder.set(subfolder, subfolderData.images.map(img => ({
                path: img.url,
                originalPath: img.path,
                subfolder: subfolder,
                trackName: trackName
              })));
            }
            
            // Procesar audios - usar URLs directas desde public (igual que el proyecto nuevo)
            if (subfolderData.audio && subfolderData.audio.length > 0) {
              // Usar URLs del manifest que apuntan a /tracks/ (public/tracks/)
              track.audioBySubfolder.set(subfolder, subfolderData.audio.map(audio => audio.url));
            }
            
            // Procesar guiones
            if (subfolderData.guiones && subfolderData.guiones.length > 0) {
              track.guionesBySubfolder.set(subfolder, subfolderData.guiones.map(guion => ({
                path: guion.url,
                originalPath: guion.path
              })));
            }
          });
          
          tracksMap.set(trackKey, track);
        });

        // Convertir a array de tracks finales
        const finalTracks = [];
        
        tracksMap.forEach((track, trackKey) => {
          // Detectar si es Croquetas25
          const isCroquetas25 = track.name && (
            track.name.toLowerCase().includes('croquetas25') ||
            normalizeName(track.name) === 'croquetas25'
          );

          let imagesArray = [];
          let subfolderOrder = [];

          if (isCroquetas25) {
            // SOLO PARA CROQUETAS25: Intercalar imágenes de TODOS los otros tracks (colecciones)
            const otherTracks = Array.from(tracksMap.values())
              .filter(t => t.id !== track.id && t.imagesBySubfolder.size > 0)
              .sort((a, b) => a.name.localeCompare(b.name));

            const tracksImagesArrays = otherTracks.map(t => {
              const flatImages = [];
              const subfolders = Array.from(t.imagesBySubfolder.keys()).sort((a, b) => {
                if (a === '__root__') return -1;
                if (b === '__root__') return 1;
                return a.localeCompare(b);
              });
              subfolders.forEach(subfolder => {
                flatImages.push(...t.imagesBySubfolder.get(subfolder));
              });
              return flatImages;
            }).filter(arr => arr.length > 0);

            // Intercalar
            const trackIndices = new Map();
            tracksImagesArrays.forEach((_, idx) => trackIndices.set(idx, 0));

            while (true) {
              let addedAny = false;
              tracksImagesArrays.forEach((images, trackIdx) => {
                const currentIdx = trackIndices.get(trackIdx) || 0;
                if (currentIdx < images.length) {
                  imagesArray.push(images[currentIdx]);
                  trackIndices.set(trackIdx, currentIdx + 1);
                  addedAny = true;
                }
              });
              if (!addedAny) break;
            }

            // SubfolderOrder para Croquetas25: todas las subcarpetas de todos los tracks
            const allSubfolders = new Set();
            tracksMap.forEach((otherTrack) => {
              otherTrack.imagesBySubfolder.forEach((_, subfolder) => {
                allSubfolders.add(subfolder);
              });
            });
            subfolderOrder = Array.from(allSubfolders).sort((a, b) => {
              if (a === '__root__') return -1;
              if (b === '__root__') return 1;
              return a.localeCompare(b);
            });
          } else {
            // TRACKS NORMALES: Secuencial por subcarpeta
            subfolderOrder = Array.from(track.imagesBySubfolder.keys()).sort((a, b) => {
              if (a === '__root__') return -1;
              if (b === '__root__') return 1;
              return a.localeCompare(b);
            });
            subfolderOrder.forEach(subfolder => {
              imagesArray.push(...track.imagesBySubfolder.get(subfolder));
            });
          }

          // Procesar audios
          const audioSubfolders = Array.from(track.audioBySubfolder.keys()).sort((a, b) => {
            if (a === '__root__') return -1;
            if (b === '__root__') return 1;
            return a.localeCompare(b);
          });
          
          const audioSrcs = [];
          const subfolderToAudioIndex = {};
          let audioIndex = 0;
          let lastAudioIndex = -1;

          // Primero, mapear audios existentes
          audioSubfolders.forEach(subfolder => {
            const audios = track.audioBySubfolder.get(subfolder);
            if (audios && audios.length > 0) {
              // Las URLs del manifest ya son strings como /tracks/...
              let audioSrc = audios[0];
              // Verificar que sea un string válido antes de agregarlo
              if (typeof audioSrc === 'string' && audioSrc.length > 0) {
                subfolderToAudioIndex[subfolder] = audioIndex;
                audioSrcs.push(audioSrc);
                lastAudioIndex = audioIndex;
                audioIndex++;
              }
            }
          });

          // Luego, asociar subcarpetas de imágenes sin audio al audio anterior
          subfolderOrder.forEach(subfolder => {
            if (!subfolderToAudioIndex.hasOwnProperty(subfolder)) {
              if (lastAudioIndex >= 0) {
                subfolderToAudioIndex[subfolder] = lastAudioIndex;
              } else if (audioSrcs.length > 0) {
                subfolderToAudioIndex[subfolder] = 0;
              } else {
                lastAudioIndex = subfolderToAudioIndex[subfolder];
              }
            } else {
              lastAudioIndex = subfolderToAudioIndex[subfolder];
            }
          });

          // Asegurar que todos los audioSrcs sean strings válidos
          const validAudioSrcs = audioSrcs.filter(src => {
            if (typeof src === 'string' && src.length > 0) {
              return true;
            }
            return false;
          });

          // Procesar guiones
          const guionesBySubfolder = {};
          track.guionesBySubfolder.forEach((guiones, subfolder) => {
            guionesBySubfolder[subfolder] = guiones.map(g => g.path);
          });

          // Construir objeto final del track
          const finalTrack = {
            id: track.id,
            name: track.name,
            src: validAudioSrcs[0] || null,
            srcs: validAudioSrcs,
            images: imagesArray,
            subfolderOrder: subfolderOrder,
            imagesBySubfolder: Object.fromEntries(track.imagesBySubfolder),
            subfolderToAudioIndex: subfolderToAudioIndex,
            guionesBySubfolder: guionesBySubfolder,
            guion: track.guionesBySubfolder.get('__root__')?.[0]?.path || null,
            isCroquetas25: isCroquetas25
          };

          finalTracks.push(finalTrack);
        });

        setTracks(finalTracks);
        setIsLoading(false);
      } catch (error) {
        console.error('[useTracks] Error cargando tracks:', error);
        setIsLoading(false);
      }
    };

    loadTracks();
  }, []);

  return { tracks, isLoading };
};

const isValidTrackName = (trackName) => {
  if (!trackName) return false;
  const IGNORED_FOLDERS = ['components', 'backups', 'node_modules', '.git', 'generateAudioImports.js', 'audioImports.js', 'tracks-manifest.json'];
  if (IGNORED_FOLDERS.includes(trackName.toLowerCase())) return false;
  if (trackName.startsWith('.')) return false;
  return true;
};
