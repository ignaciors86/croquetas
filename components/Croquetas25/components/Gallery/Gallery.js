import { useState, useEffect, useCallback, useRef } from 'react';

export const useGallery = (selectedTrack = null, onSubfolderComplete = null, onAllComplete = null, currentAudioIndex = null, audioStarted = true) => {
  const [allImages, setAllImages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [activeSegmentImages, setActiveSegmentImages] = useState([]); // Imágenes del segmento activo
  
  // Controlador de imágenes: ready, loading, used
  const imageStatesRef = useRef(new Map());
  const currentIndexRef = useRef(0);
  const preloadQueueRef = useRef([]);
  const preloadingRef = useRef(false);
  const backgroundLoadingRef = useRef(false);
  
  // Rastrear subcarpetas
  const imagesBySubfolderRef = useRef(new Map()); // Map<imagePath, subfolder>
  const subfolderCountsRef = useRef(new Map()); // Map<subfolder, {total, used}>
  const lastSubfolderRef = useRef(null);
  const completedSubfoldersRef = useRef(new Set());
  const subfoldersCompletedAtLeastOnceRef = useRef(new Set()); // Subcarpetas que han completado al menos un ciclo
  
  // Estructura plana: mapeo de subcarpeta a índices de imágenes en allImages
  const subfolderImageIndicesRef = useRef(new Map()); // Map<subfolder, number[]>
  // Índice actual por subcarpeta (evita problemas de reseteo)
  const subfolderCurrentIndexRef = useRef(new Map()); // Map<subfolder, number>
  const lastAudioIndexRef = useRef(null);
  const isLastImageRef = useRef(false); // Flag para indicar si la próxima imagen es la última
  
  // Detectar dispositivo móvil (especialmente iPhone)
  const isMobile = typeof window !== 'undefined' && typeof navigator !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth <= 768)
  );
  const isIOS = typeof window !== 'undefined' && typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  
  // Configuración de carga progresiva - optimizada para móviles
  const INITIAL_PRELOAD_COUNT = isMobile ? (isIOS ? 5 : 8) : 20; // Menos imágenes iniciales en móviles
  const MAX_PRELOAD = isMobile ? (isIOS ? 3 : 5) : 10; // Menos precarga durante reproducción en móviles
  const BATCH_SIZE = isMobile ? (isIOS ? 3 : 5) : 15; // Lotes más pequeños en móviles
  const BATCH_DELAY = isMobile ? (isIOS ? 1000 : 500) : 200; // Delays más largos en móviles
  const MAX_CONCURRENT_LOADS = isMobile ? (isIOS ? 2 : 3) : 10; // Límite de carga concurrente

  // Función para precargar una imagen individual
  const preloadImage = useCallback((imagePath) => {
    return new Promise((resolve) => {
      const img = new Image();
      const updateState = (state, imgElement = null) => {
        const current = imageStatesRef.current.get(imagePath);
        if (current) {
          imageStatesRef.current.set(imagePath, { 
            ...current, 
            state, 
            imgElement: imgElement || current.imgElement 
          });
        }
      };
      
      img.onload = () => {
        updateState('ready', img);
          resolve({ status: 'fulfilled', value: imagePath });
      };
      img.onerror = () => {
        updateState('error');
        // Silenciar completamente los errores de carga de imágenes (404, etc.)
        // Solo actualizar el estado sin mostrar warnings en consola
        resolve({ status: 'rejected', reason: `Failed to load ${imagePath}` });
      };
      
      updateState('loading');
      // Asegurar que la ruta esté correctamente formateada
      // Si la ruta ya está codificada (tiene %20), usarla tal cual
      // Si no, codificarla correctamente
      let finalPath = imagePath;
      if (imagePath && !imagePath.includes('%')) {
        // Si no tiene codificación, asegurar que los espacios se codifiquen correctamente
        // Pero no codificar toda la URL, solo las partes que necesitan codificación
        finalPath = imagePath;
      }
      img.src = finalPath;
    });
  }, []);

  // Cargar imágenes en lotes en background con límite de concurrencia
  const loadImagesInBatches = useCallback((imagesList, startIndex, onProgress) => {
    if (backgroundLoadingRef.current) return;
    backgroundLoadingRef.current = true;
    
    // Track del progreso máximo alcanzado para evitar retrocesos
    let maxProgressReached = 0;
    let currentIndex = startIndex;
    let activeLoads = 0;
    const pendingImages = [];

    const loadWithConcurrencyLimit = () => {
      // Cargar hasta el límite de concurrencia
      while (activeLoads < MAX_CONCURRENT_LOADS && currentIndex < imagesList.length) {
        const imagePath = imagesList[currentIndex];
        currentIndex++;
        
        const state = imageStatesRef.current.get(imagePath);
        if (state && state.state === 'pending') {
          activeLoads++;
          preloadImage(imagePath).then(() => {
            activeLoads--;
            
            // Actualizar progreso
        const loadedCount = Array.from(imageStatesRef.current.values())
          .filter(s => s.state === 'ready' || s.state === 'error').length;
        const progress = Math.min(100, (loadedCount / imagesList.length) * 100);
        
        maxProgressReached = Math.max(maxProgressReached, progress);
        if (onProgress) {
          onProgress(maxProgressReached);
        }

            // Continuar cargando
            if (currentIndex < imagesList.length || activeLoads > 0) {
              setTimeout(() => loadWithConcurrencyLimit(), 50);
        } else {
          backgroundLoadingRef.current = false;
          if (onProgress) {
            onProgress(100);
          }
        }
      });
        } else {
          // Si ya está cargada o no está pendiente, continuar
          const loadedCount = Array.from(imageStatesRef.current.values())
            .filter(s => s.state === 'ready' || s.state === 'error').length;
          const progress = Math.min(100, (loadedCount / imagesList.length) * 100);
          maxProgressReached = Math.max(maxProgressReached, progress);
          if (onProgress) {
            onProgress(maxProgressReached);
          }
          
          if (currentIndex < imagesList.length) {
            setTimeout(() => loadWithConcurrencyLimit(), 10);
          } else if (activeLoads === 0) {
            backgroundLoadingRef.current = false;
            if (onProgress) {
              onProgress(100);
            }
          }
        }
      }
      
      // Si hay imágenes pendientes pero ya alcanzamos el límite, esperar
      if (activeLoads >= MAX_CONCURRENT_LOADS && currentIndex < imagesList.length) {
        setTimeout(() => loadWithConcurrencyLimit(), BATCH_DELAY);
      }
    };

    loadWithConcurrencyLimit();
  }, [preloadImage]); // BATCH_SIZE, BATCH_DELAY, MAX_CONCURRENT_LOADS son constantes

  useEffect(() => {
    // Cargar imágenes siempre que haya un track seleccionado
    // Las imágenes se cargan en paralelo con el audio, no dependen de que el audio haya empezado
    if (!selectedTrack) {
      return;
    }
    
    // Ya no bloqueamos la carga de imágenes basándonos en audioStarted
    // Las imágenes se cargan desde el principio para que estén listas cuando se necesiten

    const loadImages = async () => {
      try {
        // Las imágenes ahora vienen del manifest en useTracks
        let imagesList = selectedTrack?.images || [];

        if (imagesList.length === 0) {
          setIsLoading(false);
          setPreloadProgress(100);
          setAllImages([]);
          return;
        }

        // Resetear estados
        imageStatesRef.current.clear();
        currentIndexRef.current = 0;
        preloadQueueRef.current = [];
        preloadingRef.current = false;
        backgroundLoadingRef.current = false;

        // Inicializar todas las imágenes como 'pending' y rastrear subcarpetas
        imagesBySubfolderRef.current.clear();
        subfolderCountsRef.current.clear();
        subfolderImageIndicesRef.current.clear();
        subfolderCurrentIndexRef.current.clear();
        lastSubfolderRef.current = null;
        completedSubfoldersRef.current.clear();
        subfoldersCompletedAtLeastOnceRef.current.clear();
        lastAudioIndexRef.current = null; // Resetear para que el efecto se ejecute en la primera carga
        isLastImageRef.current = false; // Resetear flag de última imagen
        
        // Detectar si es Nachitos de Nochevieja (usa flag del track)
        const isCroquetas25 = selectedTrack?.isCroquetas25 === true;
        
        // Construir estructura: para Nachitos de Nochevieja todas las imágenes, para tracks normales por subcarpeta
        imagesList.forEach((img, index) => {
          const imageObj = typeof img === 'object' ? img : { path: img, originalPath: img, subfolder: null };
          const imagePath = imageObj.path || img;
          const subfolder = imageObj.subfolder || null;
          const normalizedSubfolder = subfolder === null ? '__root__' : subfolder;
          
          // Inicializar estado de imagen
          imageStatesRef.current.set(imagePath, { state: 'pending', imgElement: null });
          imagesBySubfolderRef.current.set(imagePath, subfolder);
          
          // Para tracks normales: organizar por subcarpeta
          // Para Nachitos de Nochevieja: todas las imágenes en un solo índice
          if (isCroquetas25) {
            // Nachitos de Nochevieja: todas las imágenes mezcladas
            if (!subfolderImageIndicesRef.current.has('__all__')) {
              subfolderImageIndicesRef.current.set('__all__', []);
            }
            subfolderImageIndicesRef.current.get('__all__').push(index);
          } else {
            // Track normal: organizar por subcarpeta
            if (!subfolderImageIndicesRef.current.has(normalizedSubfolder)) {
              subfolderImageIndicesRef.current.set(normalizedSubfolder, []);
            }
            subfolderImageIndicesRef.current.get(normalizedSubfolder).push(index);
          }
          
          // Contadores por subcarpeta
          if (!subfolderCountsRef.current.has(subfolder)) {
            subfolderCountsRef.current.set(subfolder, { total: 0, used: 0 });
          }
          const counts = subfolderCountsRef.current.get(subfolder);
          counts.total++;
        });

        // Para tracks normales, construir '__all__' respetando el orden de subcarpetas
        // El orden debe ser el mismo que en imagesList (que ya viene ordenado desde useTracks)
        if (!isCroquetas25) {
          if (!subfolderImageIndicesRef.current.has('__all__')) {
            subfolderImageIndicesRef.current.set('__all__', []);
          }
          
          // Construir __all__ en el orden correcto: primero todas las subcarpetas ordenadas,
          // luego agregar los índices de cada subcarpeta en ese orden
          // Esto asegura que el orden sea: __root__ primero, luego subcarpetas alfabéticamente
          const allSubfolders = Array.from(subfolderImageIndicesRef.current.keys())
            .filter(sf => sf !== '__all__')
            .sort((a, b) => {
              if (a === '__root__') return -1;
              if (b === '__root__') return 1;
              return a.localeCompare(b);
            });
          
          // Agregar índices en el orden correcto de subcarpetas
          allSubfolders.forEach(subfolder => {
            const indices = subfolderImageIndicesRef.current.get(subfolder) || [];
            // Los índices dentro de cada subcarpeta ya están en orden (ordenados alfabéticamente en useTracks)
            subfolderImageIndicesRef.current.get('__all__').push(...indices);
          });
        }
        
        setAllImages(imagesList);
        setPreloadProgress(0);

        // Calcular cuántas imágenes precargar inicialmente
        // Para tracks con múltiples subcarpetas, precargar de todas las subcarpetas
        let initialImages = [];
        if (isCroquetas25) {
          // Para Nachitos de Nochevieja: precargar las primeras imágenes de toda la lista
          const allIndices = subfolderImageIndicesRef.current.get('__all__') || 
            Array.from({ length: imagesList.length }, (_, i) => i);
          const initialIndices = allIndices.slice(0, Math.min(INITIAL_PRELOAD_COUNT, allIndices.length));
          initialImages = initialIndices.map(idx => {
            const img = imagesList[idx];
          return typeof img === 'object' ? (img.path || img) : img;
        });
        } else {
          // Para tracks normales: precargar de todas las subcarpetas (no solo la primera)
          const subfolders = Array.from(subfolderImageIndicesRef.current.keys()).filter(sf => sf !== '__all__');
          const imagesPerSubfolder = Math.ceil(INITIAL_PRELOAD_COUNT / Math.max(1, subfolders.length));
          
          subfolders.forEach(subfolder => {
            const indices = subfolderImageIndicesRef.current.get(subfolder) || [];
            const subfolderInitialIndices = indices.slice(0, Math.min(imagesPerSubfolder, indices.length));
            subfolderInitialIndices.forEach(idx => {
              const img = imagesList[idx];
              const imgPath = typeof img === 'object' ? (img.path || img) : img;
              if (!initialImages.includes(imgPath)) {
                initialImages.push(imgPath);
              }
            });
          });
          
          // Si no hay suficientes, añadir más de la primera subcarpeta
          if (initialImages.length < INITIAL_PRELOAD_COUNT && subfolders.length > 0) {
            const firstSubfolder = subfolders[0];
            const firstIndices = subfolderImageIndicesRef.current.get(firstSubfolder) || [];
            const additionalNeeded = INITIAL_PRELOAD_COUNT - initialImages.length;
            const additionalIndices = firstIndices.slice(imagesPerSubfolder, imagesPerSubfolder + additionalNeeded);
            additionalIndices.forEach(idx => {
              const img = imagesList[idx];
              const imgPath = typeof img === 'object' ? (img.path || img) : img;
              if (!initialImages.includes(imgPath)) {
                initialImages.push(imgPath);
              }
            });
          }
        }

        // Precargar imágenes iniciales con límite de concurrencia
        const initialCount = initialImages.length;
        let loadedInitialCount = 0;
        let activeInitialLoads = 0;
        let initialIndex = 0;
        let initialLoadingComplete = false;
        
        const loadInitialWithLimit = () => {
          // Cargar hasta el límite de concurrencia
          while (activeInitialLoads < MAX_CONCURRENT_LOADS && initialIndex < initialImages.length) {
            const imagePath = initialImages[initialIndex]; // Ya es un path (string)
            initialIndex++;
            
            activeInitialLoads++;
            preloadImage(imagePath).then(() => {
              activeInitialLoads--;
              loadedInitialCount++;
              
          const loadedCount = Array.from(imageStatesRef.current.values())
            .filter(s => s.state === 'ready' || s.state === 'error').length;
          const progress = (loadedCount / imagesList.length) * 100;
          
          setPreloadProgress(progress);
              
              // Si hemos cargado suficientes imágenes iniciales, marcar como listo
              if (loadedInitialCount >= Math.min(3, initialCount) && !initialLoadingComplete) {
                initialLoadingComplete = true;
                setIsLoading(false);
              }
              
              // Continuar cargando
              if (initialIndex < initialImages.length || activeInitialLoads > 0) {
                setTimeout(() => loadInitialWithLimit(), 50);
              } else {
                // Todas las iniciales cargadas
                const finalLoadedCount = Array.from(imageStatesRef.current.values())
                  .filter(s => s.state === 'ready' || s.state === 'error').length;
                const finalProgress = (finalLoadedCount / imagesList.length) * 100;
                
                setIsLoading(false);
                setPreloadProgress(finalProgress);
          
          // Continuar cargando el resto en background
          // Encontrar el índice donde empezar (después de las imágenes iniciales)
          const startIndex = imagesList.findIndex(img => {
            const imgPath = typeof img === 'object' ? (img.path || img) : img;
            return !initialImages.includes(imgPath);
          });
          if (startIndex >= 0 && startIndex < imagesList.length) {
            loadImagesInBatches(imagesList, startIndex, (newProgress) => {
              setPreloadProgress(prev => {
                // Asegurar que el progreso nunca retrocede
                return Math.max(prev, newProgress);
              });
            });
          } else {
            // Si todas las imágenes ya están cargadas, marcar progreso como 100
            setPreloadProgress(100);
                }
              }
            });
          }
          
          // Si hay imágenes pendientes pero ya alcanzamos el límite, esperar
          if (activeInitialLoads >= MAX_CONCURRENT_LOADS && initialIndex < initialImages.length) {
            setTimeout(() => loadInitialWithLimit(), 100);
          }
        };
        
        // Empezar a cargar las iniciales
        loadInitialWithLimit();
        
        // Marcar como listo después de un tiempo mínimo o cuando tengamos suficientes imágenes
        setTimeout(() => {
          if (loadedInitialCount >= Math.min(3, initialCount) && !initialLoadingComplete) {
            initialLoadingComplete = true;
            setIsLoading(false);
          }
        }, isMobile ? 1000 : 500);
      } catch (error) {
        setAllImages([]);
        setIsLoading(false);
        setPreloadProgress(100);
      }
    };

    loadImages();
  }, [selectedTrack]); // preloadImage y loadImagesInBatches son useCallback estables, audioStarted no se usa

  // Determinar la subcarpeta actual basándose en el audio
  // Para Nachitos de Nochevieja siempre retorna null (usa todas las imágenes)
  // Para tracks normales retorna la subcarpeta del audio actual
  const getCurrentSubfolder = useCallback(() => {
    // Nachitos de Nochevieja: no filtrar por subcarpeta
    if (selectedTrack?.isCroquetas25 === true) {
      return null;
    }
    
    // NUEVA LÓGICA: Usar la estructura de segments
    // Cada segmento tiene un audioIndex y subfolders asociados
    if (selectedTrack?.segments && selectedTrack.segments.length > 0) {
      const audioIndex = currentAudioIndex !== null && currentAudioIndex !== undefined ? currentAudioIndex : 0;
      
      // Buscar el segmento correspondiente al audio actual
      const currentSegment = selectedTrack.segments.find(s => s.audioIndex === audioIndex);
      
      if (currentSegment && currentSegment.subfolders && currentSegment.subfolders.length > 0) {
        // Usar la primera subcarpeta del segmento
        const firstSubfolder = currentSegment.subfolders[0];
        return firstSubfolder === '__root__' ? null : firstSubfolder;
      }
    }
    
    // Fallback: usar la lógica antigua si no hay segments
    if (!selectedTrack || !selectedTrack.subfolderToAudioIndex) {
      if (selectedTrack?.subfolderOrder && selectedTrack.subfolderOrder.length > 0) {
      const firstSubfolder = selectedTrack.subfolderOrder[0];
      return firstSubfolder === '__root__' ? null : firstSubfolder;
      }
      return null;
    }
    
    const audioIndex = currentAudioIndex !== null && currentAudioIndex !== undefined ? currentAudioIndex : 0;
    
    // Buscar en subfolderToAudioIndex como fallback
    for (const [subfolder, mappedAudioIndex] of Object.entries(selectedTrack.subfolderToAudioIndex)) {
      if (mappedAudioIndex === audioIndex) {
        return subfolder === '__root__' ? null : subfolder;
      }
    }
    
    return null;
  }, [selectedTrack, currentAudioIndex]);
  
  // Inicializar índice cuando cambia el audio (solo la primera vez para cada subcarpeta)
  useEffect(() => {
    if (allImages.length === 0) return;
    
    // Detectar si es Nachitos de Nochevieja
    const isCroquetas25 = selectedTrack?.isCroquetas25 === true;
    
    // Solo procesar si realmente cambió el índice de audio
    if (lastAudioIndexRef.current === currentAudioIndex) {
      return;
    }
    
    console.log('[Gallery] Cambio de audio detectado:', {
      from: lastAudioIndexRef.current,
      to: currentAudioIndex,
      isCroquetas25
    });
    
    // Para Nachitos de Nochevieja, usar todas las imágenes sin filtrar por subcarpeta
    if (isCroquetas25) {
      const allIndices = subfolderImageIndicesRef.current.get('__all__') || 
        Array.from({ length: allImages.length }, (_, i) => i);
      
      // Actualizar estado con todas las imágenes
      const allImagesArray = allIndices.map(idx => allImages[idx]);
      setActiveSegmentImages(allImagesArray);
      
      // Resetear todas las imágenes a "ready"
      allIndices.forEach(idx => {
        const imgObj = allImages[idx];
        const imgPath = typeof imgObj === 'object' ? (imgObj.path || imgObj) : imgObj;
        const state = imageStatesRef.current.get(imgPath);
        if (state && state.state === 'used') {
          imageStatesRef.current.set(imgPath, { ...state, state: 'ready' });
        }
      });
      
      // Resetear índice a 0
      subfolderCurrentIndexRef.current.set('__all__', 0);
      currentIndexRef.current = allIndices[0] || 0;
    } else {
      // LÓGICA MEJORADA: Usar la estructura de segments para colecciones con múltiples tramos
      if (selectedTrack?.segments && selectedTrack.segments.length > 0) {
        const audioIndex = currentAudioIndex !== null && currentAudioIndex !== undefined ? currentAudioIndex : 0;
        const currentSegment = selectedTrack.segments.find(s => s.audioIndex === audioIndex);
        
        console.log('[Gallery] Buscando segmento para audioIndex:', audioIndex, 'Segmentos disponibles:', selectedTrack.segments.map(s => s.audioIndex));
        
        if (currentSegment) {
          console.log('[Gallery] Segmento encontrado:', currentSegment);
          console.log('[Gallery] Subcarpetas del segmento:', currentSegment.subfolders);
          console.log('[Gallery] Imágenes del segmento (raw):', currentSegment.images.length, currentSegment.images);
          
          // Obtener todas las imágenes del segmento (de todas sus subcarpetas)
          const segmentImagePaths = currentSegment.images.map(img => 
            typeof img === 'object' ? (img.path || img) : img
          );
          
          console.log('[Gallery] Imágenes del segmento (paths):', segmentImagePaths.length, segmentImagePaths.slice(0, 5));
          console.log('[Gallery] Total imágenes en allImages:', allImages.length);
          
          // Buscar los índices de estas imágenes en allImages
          const segmentIndices = [];
          segmentImagePaths.forEach((imgPath, idx) => {
            const index = allImages.findIndex(img => {
              const imgPathToCompare = typeof img === 'object' ? (img.path || img) : img;
              return imgPathToCompare === imgPath;
            });
            if (index >= 0) {
              segmentIndices.push(index);
            } else {
              console.warn('[Gallery] No se encontró imagen en allImages:', imgPath, 'índice en segmentImagePaths:', idx);
            }
          });
          
          console.log('[Gallery] Cambio a segmento', audioIndex, 'con', segmentIndices.length, 'imágenes encontradas de', segmentImagePaths.length, 'esperadas');
          
          if (segmentIndices.length > 0) {
            // Resetear todas las imágenes del segmento a "ready"
            segmentIndices.forEach(idx => {
              const imgObj = allImages[idx];
              const imgPath = typeof imgObj === 'object' ? (imgObj.path || imgObj) : imgObj;
              const state = imageStatesRef.current.get(imgPath);
              if (state && state.state === 'used') {
                imageStatesRef.current.set(imgPath, { ...state, state: 'ready' });
              }
            });
            
            // Usar un identificador único por segmento (audioIndex) para el índice
            // Esto asegura que cada segmento tenga su propio índice independiente
            const segmentKey = `segment_${audioIndex}`;
            
            // Actualizar estado con las imágenes del segmento activo
            const segmentImages = segmentIndices.map(idx => allImages[idx]);
            setActiveSegmentImages(segmentImages);
            
            // Resetear índice a 0 para empezar desde el principio del nuevo segmento
            // Usar segmentKey en lugar de normalizedSubfolder para evitar conflictos
            subfolderCurrentIndexRef.current.set(segmentKey, 0);
            currentIndexRef.current = segmentIndices[0] || 0;
            
            // Guardar el segmentKey en un ref para que getNextImage lo use
            lastSubfolderRef.current = segmentKey;
            
            console.log('[Gallery] Segmento', audioIndex, '- Resetear índice a 0,', segmentIndices.length, 'imágenes disponibles');
            
            console.log('[Gallery] Galería actualizada para segmento', audioIndex, '-', segmentIndices.length, 'imágenes listas');
          } else {
            console.warn('[Gallery] No se encontraron imágenes para el segmento', audioIndex);
          }
        } else {
          console.warn('[Gallery] No se encontró segmento para audioIndex:', audioIndex);
        }
      } else {
        // Fallback: lógica original: filtrar por subcarpeta
      const currentSubfolder = getCurrentSubfolder();
      const normalizedSubfolder = currentSubfolder === null ? '__root__' : currentSubfolder;
        
        console.log('[Gallery] Subcarpeta actual para audio', currentAudioIndex, ':', normalizedSubfolder);
      
      // Resetear imágenes y índice cuando se vuelve a una subcarpeta (para poder volver a verlas)
      if (subfolderImageIndicesRef.current.has(normalizedSubfolder)) {
        const indices = subfolderImageIndicesRef.current.get(normalizedSubfolder);
        if (indices.length > 0) {
          // Resetear todas las imágenes de esta subcarpeta a "ready" para poder volver a mostrarlas
          indices.forEach(idx => {
            const imgObj = allImages[idx];
            const imgPath = typeof imgObj === 'object' ? (imgObj.path || imgObj) : imgObj;
            const state = imageStatesRef.current.get(imgPath);
            if (state && state.state === 'used') {
              imageStatesRef.current.set(imgPath, { ...state, state: 'ready' });
            }
          });
          
          // Resetear contador de usadas para esta subcarpeta
          const imageSubfolder = currentSubfolder;
          if (imageSubfolder !== null && subfolderCountsRef.current.has(imageSubfolder)) {
            subfolderCountsRef.current.get(imageSubfolder).used = 0;
          }
          
          // Resetear índice a 0 para empezar desde el principio
          subfolderCurrentIndexRef.current.set(normalizedSubfolder, 0);
          currentIndexRef.current = indices[0];
            
            // Actualizar estado con las imágenes de esta subcarpeta
            const subfolderImages = indices.map(idx => allImages[idx]);
            setActiveSegmentImages(subfolderImages);
        }
      } else if (currentSubfolder === null) {
        // Si no hay subcarpeta específica, resetear todas las imágenes
          setActiveSegmentImages(allImages); // Usar todas las imágenes
        allImages.forEach((imgObj, idx) => {
          const imgPath = typeof imgObj === 'object' ? (imgObj.path || imgObj) : imgObj;
          const state = imageStatesRef.current.get(imgPath);
          if (state && state.state === 'used') {
            imageStatesRef.current.set(imgPath, { ...state, state: 'ready' });
          }
        });
        subfolderCurrentIndexRef.current.set('__root__', 0);
        currentIndexRef.current = 0;
        }
      }
    }
    
    lastAudioIndexRef.current = currentAudioIndex;
  }, [currentAudioIndex, allImages.length, selectedTrack]);
  
  // Precargar imágenes del segmento activo cuando cambia
  useEffect(() => {
    if (activeSegmentImages.length === 0) return;
    
    // Precargar las primeras imágenes del segmento activo
    const imagesToPreload = activeSegmentImages.slice(0, Math.min(10, activeSegmentImages.length));
    console.log('[Gallery] Precargando', imagesToPreload.length, 'imágenes del segmento activo');
    
    imagesToPreload.forEach((imgObj, idx) => {
      const imgPath = typeof imgObj === 'object' ? (imgObj.path || imgObj) : imgObj;
      const state = imageStatesRef.current.get(imgPath);
      
      if (state) {
        if (state.state === 'pending') {
          console.log('[Gallery] Precargando imagen', idx + 1, 'de', imagesToPreload.length, ':', imgPath.substring(imgPath.lastIndexOf('/') + 1));
          preloadImage(imgPath);
        } else if (state.state === 'used') {
          // Resetear a 'ready' para poder reutilizarla
          imageStatesRef.current.set(imgPath, { ...state, state: 'ready' });
          console.log('[Gallery] Reseteando imagen usada a ready:', imgPath.substring(imgPath.lastIndexOf('/') + 1));
        }
      } else {
        // Inicializar y precargar
        imageStatesRef.current.set(imgPath, { state: 'pending', imgElement: null });
        console.log('[Gallery] Inicializando y precargando imagen:', imgPath.substring(imgPath.lastIndexOf('/') + 1));
        preloadImage(imgPath);
      }
    });
  }, [activeSegmentImages, preloadImage]);

  // Función para obtener la siguiente imagen disponible
  // IMPORTANTE: Usar activeSegmentImages directamente en lugar de recalcular
  const getNextImage = useCallback(() => {
    if (allImages.length === 0) {
      console.log('[Gallery] getNextImage: No hay imágenes cargadas');
      return null;
    }

    // Detectar si es Nachitos de Nochevieja
    const isCroquetas25 = selectedTrack?.isCroquetas25 === true;
    
    let imageIndices;
    let normalizedSubfolder;
    
    if (isCroquetas25) {
      // Nachitos de Nochevieja: usar todas las imágenes mezcladas
      imageIndices = subfolderImageIndicesRef.current.get('__all__') || 
        Array.from({ length: allImages.length }, (_, i) => i);
      normalizedSubfolder = '__all__';
    } else {
      // Track normal: usar activeSegmentImages directamente
      if (activeSegmentImages.length > 0) {
        // Usar activeSegmentImages - mapear a índices en allImages
        imageIndices = [];
        activeSegmentImages.forEach(imgObj => {
          const imgPath = typeof imgObj === 'object' ? (imgObj.path || imgObj) : imgObj;
          const index = allImages.findIndex(img => {
            const imgPathToCompare = typeof img === 'object' ? (img.path || img) : img;
            return imgPathToCompare === imgPath;
          });
          if (index >= 0) {
            imageIndices.push(index);
          }
        });
        
        // Usar el segmentKey basado en el audioIndex actual (más confiable que lastSubfolderRef)
        // Esto asegura que siempre usemos el segmentKey correcto para el segmento activo
        if (currentAudioIndex !== null && currentAudioIndex !== undefined) {
          normalizedSubfolder = `segment_${currentAudioIndex}`;
        } else if (lastSubfolderRef.current && lastSubfolderRef.current.startsWith('segment_')) {
          normalizedSubfolder = lastSubfolderRef.current;
        } else {
          normalizedSubfolder = '__root__';
        }
        
        console.log('[Gallery] getNextImage - Usando', imageIndices.length, 'imágenes de activeSegmentImages, segmentKey:', normalizedSubfolder, 'para audioIndex:', currentAudioIndex);
      } else {
        // Fallback: usar la lógica antigua si activeSegmentImages está vacío
      const currentSubfolder = getCurrentSubfolder();
      normalizedSubfolder = currentSubfolder === null ? '__root__' : currentSubfolder;
      
      if (subfolderImageIndicesRef.current.has(normalizedSubfolder)) {
        imageIndices = subfolderImageIndicesRef.current.get(normalizedSubfolder);
      } else {
          imageIndices = subfolderImageIndicesRef.current.get('__all__') || Array.from({ length: allImages.length }, (_, i) => i);
        normalizedSubfolder = '__all__';
        }
      }
      
      // Fallback final: si no hay índices, usar todas las imágenes
      if (!imageIndices || imageIndices.length === 0) {
        console.warn(`[Gallery] No se encontraron índices, usando todas las imágenes`);
        imageIndices = Array.from({ length: allImages.length }, (_, i) => i);
        normalizedSubfolder = '__all__';
      }
    }
    
    // Obtener índice actual de esta subcarpeta (inicializar si no existe)
    if (!subfolderCurrentIndexRef.current.has(normalizedSubfolder)) {
      subfolderCurrentIndexRef.current.set(normalizedSubfolder, 0);
      console.log('[Gallery] getNextImage - Inicializando índice 0 para segmentKey:', normalizedSubfolder);
    }
    let subfolderIndex = subfolderCurrentIndexRef.current.get(normalizedSubfolder);
    
    console.log('[Gallery] getNextImage - Índice actual:', subfolderIndex, 'de', imageIndices.length, 'para segmentKey:', normalizedSubfolder);
    
    // Asegurarse de que el índice no exceda el número de imágenes disponibles
    if (subfolderIndex >= imageIndices.length) {
      console.log('[Gallery] getNextImage - Índice', subfolderIndex, 'excede', imageIndices.length, ', reseteando a 0');
      subfolderIndex = 0;
      subfolderCurrentIndexRef.current.set(normalizedSubfolder, 0);
    }
    
    // Si no hay imágenes en este segmento, retornar null
    if (imageIndices.length === 0) {
      console.warn('[Gallery] getNextImage - No hay imágenes disponibles para el segmento', normalizedSubfolder);
      return null;
    }
    
    const targetImageIndex = imageIndices[subfolderIndex];
    const targetImageObj = allImages[targetImageIndex];
    const targetImagePath = typeof targetImageObj === 'object' ? (targetImageObj.path || targetImageObj) : targetImageObj;
    const targetImageState = imageStatesRef.current.get(targetImagePath);
    
    // Buscar la siguiente imagen lista en esta subcarpeta
    // IMPORTANTE: Usar el índice actual directamente si la imagen está lista
    // Solo buscar circularmente si la imagen en el índice actual no está lista
    let attempts = 0;
    const startIndex = subfolderIndex;
    let foundReady = false;
    let foundUsed = false;
    let readyImagePath = null;
    let usedImagePath = null;
    let readyImageIndex = -1;
    let usedImageIndex = -1;
    
    // Primero verificar la imagen en el índice actual
    const currentImageIndex = imageIndices[subfolderIndex];
    if (currentImageIndex !== undefined && currentImageIndex >= 0 && currentImageIndex < allImages.length) {
      const currentImageObj = allImages[currentImageIndex];
      const currentImagePath = typeof currentImageObj === 'object' ? (currentImageObj.path || currentImageObj) : currentImageObj;
      const currentImageState = imageStatesRef.current.get(currentImagePath);
      
      console.log('[Gallery] getNextImage - Verificando imagen en índice', subfolderIndex, ':', currentImagePath.substring(currentImagePath.lastIndexOf('/') + 1), 'estado:', currentImageState?.state);
      
      // Si la imagen en el índice actual está 'ready', usarla directamente
      if (currentImageState && currentImageState.state === 'ready' && currentImageState.imgElement && currentImageState.imgElement.complete) {
        foundReady = true;
        readyImagePath = currentImagePath;
        readyImageIndex = subfolderIndex;
        console.log('[Gallery] getNextImage - Imagen en índice', subfolderIndex, 'está ready, usándola');
      } else if (currentImageState && currentImageState.state === 'used' && currentImageState.imgElement && currentImageState.imgElement.complete) {
        // Si está 'used', guardarla como fallback pero seguir buscando 'ready'
        foundUsed = true;
        usedImagePath = currentImagePath;
        usedImageIndex = subfolderIndex;
        console.log('[Gallery] getNextImage - Imagen en índice', subfolderIndex, 'está used, guardando como fallback');
      } else {
        console.log('[Gallery] getNextImage - Imagen en índice', subfolderIndex, 'no está lista (estado:', currentImageState?.state, ', complete:', currentImageState?.imgElement?.complete, ')');
      }
    } else {
      console.warn('[Gallery] getNextImage - Índice', subfolderIndex, 'inválido o fuera de rango');
    }
    
    // Si no encontramos 'ready' en el índice actual, buscar circularmente
    if (!foundReady) {
      let searchIndex = (subfolderIndex + 1) % imageIndices.length;
      while (attempts < imageIndices.length - 1 && searchIndex !== subfolderIndex) {
        const imageIndex = imageIndices[searchIndex];
        if (imageIndex !== undefined && imageIndex >= 0 && imageIndex < allImages.length) {
      const imageObj = allImages[imageIndex];
      const imagePath = typeof imageObj === 'object' ? (imageObj.path || imageObj) : imageObj;
      const imageState = imageStatesRef.current.get(imagePath);
      
          // Priorizar imágenes 'ready' completamente cargadas
          if (!foundReady && imageState && imageState.state === 'ready' && imageState.imgElement && imageState.imgElement.complete) {
            foundReady = true;
            readyImagePath = imagePath;
            readyImageIndex = searchIndex;
            break; // Encontrar la primera 'ready' y usarla
          }
          
          // Si no hay 'ready', buscar 'used' como fallback (permitir reutilización)
          if (!foundUsed && imageState && imageState.state === 'used' && imageState.imgElement && imageState.imgElement.complete) {
            foundUsed = true;
            usedImagePath = imagePath;
            usedImageIndex = searchIndex;
          }
        }
        
        searchIndex = (searchIndex + 1) % imageIndices.length;
        attempts++;
      }
    }
    
    // Usar imagen 'ready' si está disponible, sino usar 'used' (reutilizar)
    // IMPORTANTE: SIEMPRE usar la imagen en el índice actual si está disponible (ready o used)
    // Solo buscar circularmente si la imagen actual NO está disponible
    let imagePath = null;
    let imageState = null;
    let imageSubfolder = null;
    let actualUsedIndex = subfolderIndex; // Índice que realmente usamos (puede cambiar si la imagen actual no está lista)
    
    // Priorizar SIEMPRE la imagen en el índice actual si está disponible
    const currentIdx = imageIndices[subfolderIndex];
    if (currentIdx !== undefined && currentIdx >= 0 && currentIdx < allImages.length) {
      const currentImgObj = allImages[currentIdx];
      const currentImgPath = typeof currentImgObj === 'object' ? (currentImgObj.path || currentImgObj) : currentImgObj;
      const currentImgState = imageStatesRef.current.get(currentImgPath);
      
      if (currentImgState && currentImgState.state === 'ready' && currentImgState.imgElement && currentImgState.imgElement.complete) {
        // Usar la imagen en el índice actual directamente
        imagePath = currentImgPath;
        imageState = currentImgState;
        actualUsedIndex = subfolderIndex; // Mantener el índice actual
        console.log('[Gallery] getNextImage - Usando imagen en índice actual', subfolderIndex, 'de', imageIndices.length, ':', imagePath.substring(imagePath.lastIndexOf('/') + 1));
      } else if (currentImgState && currentImgState.state === 'used' && currentImgState.imgElement && currentImgState.imgElement.complete) {
        // Si está 'used', también usarla (reutilizar)
        imagePath = currentImgPath;
        imageState = currentImgState;
        actualUsedIndex = subfolderIndex; // Mantener el índice actual
        // Marcar como 'ready' para que pueda ser reutilizada
        imageStatesRef.current.set(imagePath, { ...imageState, state: 'ready' });
        console.log('[Gallery] getNextImage - Reutilizando imagen used en índice actual', subfolderIndex, 'de', imageIndices.length, ':', imagePath.substring(imagePath.lastIndexOf('/') + 1));
      } else if (foundReady) {
        // Si la imagen actual no está lista, usar la primera 'ready' encontrada en la búsqueda circular
        actualUsedIndex = readyImageIndex;
        subfolderIndex = readyImageIndex; // Actualizar subfolderIndex para avanzar desde aquí
        imagePath = readyImagePath;
        imageState = imageStatesRef.current.get(imagePath);
        console.log('[Gallery] getNextImage - Imagen actual no lista, usando ready en índice', subfolderIndex, 'de', imageIndices.length, ':', imagePath.substring(imagePath.lastIndexOf('/') + 1));
      } else if (foundUsed) {
        // Reutilizar imagen 'used' si no hay 'ready' disponibles
        actualUsedIndex = usedImageIndex;
        subfolderIndex = usedImageIndex; // Actualizar subfolderIndex para avanzar desde aquí
        imagePath = usedImagePath;
        imageState = imageStatesRef.current.get(imagePath);
        console.log('[Gallery] getNextImage - Reutilizando imagen used en índice', subfolderIndex, 'de', imageIndices.length, ':', imagePath.substring(imagePath.lastIndexOf('/') + 1));
        // Marcar como 'ready' para que pueda ser reutilizada
        if (imageState) {
          imageStatesRef.current.set(imagePath, { ...imageState, state: 'ready' });
        }
      }
    } else if (foundReady) {
      actualUsedIndex = readyImageIndex;
      subfolderIndex = readyImageIndex;
      imagePath = readyImagePath;
      imageState = imageStatesRef.current.get(imagePath);
      console.log('[Gallery] getNextImage - Usando imagen ready en índice', subfolderIndex, 'de', imageIndices.length, ':', imagePath.substring(imagePath.lastIndexOf('/') + 1));
    } else if (foundUsed) {
      // Reutilizar imagen 'used' si no hay 'ready' disponibles
      actualUsedIndex = usedImageIndex;
      subfolderIndex = usedImageIndex;
      imagePath = usedImagePath;
      imageState = imageStatesRef.current.get(imagePath);
      console.log('[Gallery] getNextImage - Reutilizando imagen used en índice', subfolderIndex, 'de', imageIndices.length, ':', imagePath.substring(imagePath.lastIndexOf('/') + 1));
      // Marcar como 'ready' para que pueda ser reutilizada
      if (imageState) {
        imageStatesRef.current.set(imagePath, { ...imageState, state: 'ready' });
      }
    } else {
      // Si no hay imágenes ready ni used, intentar precargar la primera disponible
      console.warn('[Gallery] getNextImage - No hay imágenes ready ni used para subcarpeta', normalizedSubfolder, ', intentando precargar');
      if (imageIndices.length > 0) {
        const firstIndex = imageIndices[0];
        const firstImgObj = allImages[firstIndex];
        const firstImgPath = typeof firstImgObj === 'object' ? (firstImgObj.path || firstImgObj) : firstImgObj;
        const firstState = imageStatesRef.current.get(firstImgPath);
        if (firstState && firstState.state === 'pending') {
          console.log('[Gallery] getNextImage - Precargando primera imagen pendiente');
          preloadImage(firstImgPath);
        }
      }
    }
    
    if (imagePath && imageState) {
      imageSubfolder = imagesBySubfolderRef.current.get(imagePath);
        const previousSubfolder = lastSubfolderRef.current;
        
      // NO marcar como 'used' - mantener como 'ready' para permitir reutilización continua
      // Esto permite que las imágenes se distribuyan mejor en el tiempo
        
      // Actualizar contador (solo para tracking, no para bloquear reutilización)
        if (imageSubfolder !== null && subfolderCountsRef.current.has(imageSubfolder)) {
          const counts = subfolderCountsRef.current.get(imageSubfolder);
          counts.used++;
        }
        
        // Identificar si esta imagen pertenece al último tramo
        const normalizedImageSubfolder = imageSubfolder === null ? '__root__' : imageSubfolder;
        let isLastSubfolder = false;
        if (selectedTrack && selectedTrack.subfolderOrder && selectedTrack.subfolderOrder.length > 0) {
          const lastSubfolderInOrder = selectedTrack.subfolderOrder[selectedTrack.subfolderOrder.length - 1];
          isLastSubfolder = normalizedImageSubfolder === lastSubfolderInOrder;
        } else if (selectedTrack && (!selectedTrack.subfolderOrder || selectedTrack.subfolderOrder.length === 0)) {
          // Si no hay subfolderOrder definido, asumir que es un solo tramo
          isLastSubfolder = true;
        }
        
        // Verificar si esta es la última imagen de esta subcarpeta (antes de incrementar el índice)
        const isLastImageInSubfolder = subfolderIndex === imageIndices.length - 1;
        
      // Verificar si se completó la subcarpeta anterior (solo si no estamos usando segmentKey)
      // Si estamos usando segmentKey, no necesitamos verificar subcarpetas individuales
      if (!normalizedSubfolder.startsWith('segment_') && 
          previousSubfolder !== null && 
            previousSubfolder !== imageSubfolder &&
            !completedSubfoldersRef.current.has(previousSubfolder)) {
          
          let actuallyUsedCount = 0;
          imagesBySubfolderRef.current.forEach((subfolder, path) => {
            if (subfolder === previousSubfolder) {
              const state = imageStatesRef.current.get(path);
              if (state && state.state === 'used') {
                actuallyUsedCount++;
              }
            }
          });
          
          const prevCounts = subfolderCountsRef.current.get(previousSubfolder);
          if (actuallyUsedCount >= prevCounts.total && prevCounts.total > 0) {
            completedSubfoldersRef.current.add(previousSubfolder);
            if (onSubfolderComplete) {
              onSubfolderComplete(previousSubfolder);
            }
          }
        }
        
      // NO actualizar lastSubfolderRef aquí cuando usamos segmentKey - se actualiza cuando cambia el segmento
      // Solo actualizar si no estamos usando segmentKey (para compatibilidad con lógica antigua)
      if (!normalizedSubfolder.startsWith('segment_')) {
        lastSubfolderRef.current = imageSubfolder;
      }
        
        // Guardar índice ANTES de avanzar (para poder retornar la imagen)
        // Usar actualUsedIndex para asegurar que avanzamos desde el índice correcto
        const currentImageIndex = actualUsedIndex;
        
      // Avanzar índice de esta subcarpeta para la próxima vez
        // Avanzar desde el índice que realmente usamos
        subfolderIndex = (actualUsedIndex + 1) % imageIndices.length; // Ciclo circular directo
        let subfolderCompletedCycle = false;
      
      console.log('[Gallery] getNextImage - Avanzando índice de', currentImageIndex, 'a', subfolderIndex, 'de', imageIndices.length, 'para segmentKey:', normalizedSubfolder);
      
      // Ya aplicamos el ciclo circular arriba con %, así que esto no debería ser necesario
      // Pero lo dejamos como seguridad
      if (subfolderIndex >= imageIndices.length) {
        subfolderIndex = subfolderIndex % imageIndices.length;
        console.log('[Gallery] getNextImage - Índice excede array, ciclando a', subfolderIndex);
      }
      
      // Guardar índice actualizado (ahora con ciclo circular)
      subfolderCurrentIndexRef.current.set(normalizedSubfolder, subfolderIndex);
      currentIndexRef.current = imageIndices[subfolderIndex] || imageIndices[0] || 0;
      console.log('[Gallery] getNextImage - Guardado índice', subfolderIndex, 'para segmentKey:', normalizedSubfolder, 'próxima imagen será índice', subfolderIndex, 'de', imageIndices.length);
      
      // Retornar la imagen (el ciclo circular permite reutilizar imágenes)
      return imagePath;
        
        // NO llamar a onAllComplete aquí - solo se debe llamar cuando se muestre la última imagen
        // La verificación de todas las subcarpetas completadas puede ocurrir antes de mostrar todas las imágenes
        // onAllComplete se llamará en el onComplete de la animación de la última imagen (cuando isLastImageRef.current es true)
        
        // Retornar la imagen (el flag isLastImageRef se mantiene hasta que se use)
        return imagePath;
      }

    // Si no se encontró ninguna imagen (ni 'ready' ni 'used'), devolver null
    subfolderCurrentIndexRef.current.set(normalizedSubfolder, subfolderIndex);
    return null;
  }, [allImages, onSubfolderComplete, onAllComplete, activeSegmentImages, selectedTrack, currentAudioIndex]);

  // Pre-cargar imágenes próximas de forma proactiva durante la reproducción
  const preloadNextImages = useCallback(() => {
    if (preloadingRef.current || allImages.length === 0) return;
    
    const currentSubfolder = getCurrentSubfolder();
    const normalizedSubfolder = currentSubfolder === null ? '__root__' : currentSubfolder;
    
    // Obtener índices de imágenes de la subcarpeta actual
    let imageIndices = subfolderImageIndicesRef.current.get(normalizedSubfolder);
    if (!imageIndices || imageIndices.length === 0) {
      imageIndices = Array.from({ length: allImages.length }, (_, i) => i);
    }
    
    // Obtener índice actual de esta subcarpeta
    let subfolderIndex = subfolderCurrentIndexRef.current.get(normalizedSubfolder) || 0;
    if (subfolderIndex >= imageIndices.length) {
      subfolderIndex = 0;
    }
    
    preloadingRef.current = true;
    const imagesToPreload = [];
    
    // Obtener las próximas imágenes que no estén listas (solo de la subcarpeta actual)
    for (let i = 0; i < imageIndices.length * 2 && imagesToPreload.length < MAX_PRELOAD; i++) {
      const idx = (subfolderIndex + i) % imageIndices.length;
      const imageIndex = imageIndices[idx];
      const imageObj = allImages[imageIndex];
        const imagePath = typeof imageObj === 'object' ? (imageObj.path || imageObj) : imageObj;
        const imageState = imageStatesRef.current.get(imagePath);
      
      // Solo precargar si está pendiente
      if (imageState && imageState.state === 'pending') {
        imagesToPreload.push(imagePath);
      }
    }

    // Pre-cargar las imágenes pendientes sin setTimeout - usar estado y efectos
    imagesToPreload.forEach((imagePath) => {
        const imageState = imageStatesRef.current.get(imagePath);
        if (imageState && imageState.state === 'pending') {
          preloadImage(imagePath);
        }
    });

    // Marcar como no precargando - esto se manejará automáticamente cuando las imágenes cambien de estado
      preloadingRef.current = false;
  }, [allImages, preloadImage, getCurrentSubfolder]);
  
  // Función para hacer seek a una posición de imagen usando tiempos auxiliares
  const seekToImagePosition = useCallback((targetTime, selectedTrack) => {
    if (!selectedTrack || !selectedTrack.seekTimeMap || selectedTrack.seekTimeMap.size === 0) {
      return;
    }
    
    if (allImages.length === 0) {
      return;
    }
    
    const seekTimeMap = selectedTrack.seekTimeMap;
    
    // Encontrar la imagen más cercana al tiempo objetivo
    let closestIndex = 0;
    let minTimeDiff = Infinity;
    
    seekTimeMap.forEach((time, index) => {
      if (index >= allImages.length) return;
      const timeDiff = Math.abs(time - targetTime);
      if (timeDiff < minTimeDiff) {
        minTimeDiff = timeDiff;
        closestIndex = index;
      }
    });
    
    // Determinar la subcarpeta de la imagen objetivo
    const targetImageObj = allImages[closestIndex];
    if (!targetImageObj) return;
    
    const targetImagePath = typeof targetImageObj === 'object' ? (targetImageObj.path || targetImageObj) : targetImageObj;
    const targetSubfolder = imagesBySubfolderRef.current.get(targetImagePath);
    const normalizedTargetSubfolder = targetSubfolder === null ? '__root__' : targetSubfolder;
    
    // Encontrar la posición de esta imagen en los índices de su subcarpeta
    const subfolderIndices = subfolderImageIndicesRef.current.get(normalizedTargetSubfolder);
    if (!subfolderIndices || subfolderIndices.length === 0) {
      // Si no hay índices para esta subcarpeta, usar todas las imágenes
      currentIndexRef.current = closestIndex;
      return;
    }
    
    const positionInSubfolder = subfolderIndices.indexOf(closestIndex);
    if (positionInSubfolder === -1) {
      // Si la imagen no está en los índices de su subcarpeta, buscar la más cercana
      let closestPosition = 0;
      let minDist = Infinity;
      subfolderIndices.forEach((idx, pos) => {
        const dist = Math.abs(idx - closestIndex);
        if (dist < minDist) {
          minDist = dist;
          closestPosition = pos;
        }
      });
      subfolderCurrentIndexRef.current.set(normalizedTargetSubfolder, closestPosition);
      currentIndexRef.current = subfolderIndices[closestPosition];
      return;
    }
    
    // Resetear estados de imágenes usadas desde la posición objetivo hacia adelante en esta subcarpeta
    // También resetear las anteriores si estamos rebobinando
    const currentPosition = subfolderCurrentIndexRef.current.get(normalizedTargetSubfolder) || 0;
    const isRewinding = positionInSubfolder < currentPosition;
    
    const startReset = isRewinding ? positionInSubfolder : currentPosition;
    const endReset = isRewinding ? currentPosition : positionInSubfolder;
    
    for (let i = startReset; i <= endReset; i++) {
      if (i >= subfolderIndices.length) break;
      const idx = subfolderIndices[i];
      const imgObj = allImages[idx];
      const imgPath = typeof imgObj === 'object' ? (imgObj.path || imgObj) : imgObj;
      const state = imageStatesRef.current.get(imgPath);
      
      if (state && state.state === 'used') {
        imageStatesRef.current.set(imgPath, { ...state, state: 'ready' });
        const imgSubfolder = imagesBySubfolderRef.current.get(imgPath);
        if (imgSubfolder !== null && subfolderCountsRef.current.has(imgSubfolder)) {
          const counts = subfolderCountsRef.current.get(imgSubfolder);
          if (counts.used > 0) counts.used--;
        }
      }
    }
    
    // Actualizar índice de la subcarpeta
    subfolderCurrentIndexRef.current.set(normalizedTargetSubfolder, positionInSubfolder);
    currentIndexRef.current = closestIndex;
  }, [allImages]);
  
  return { 
    allImages, 
    getNextImage, 
    isLoading, 
    preloadProgress,
    preloadNextImages,
    seekToImagePosition,
    isLastImageRef
  };
};

export default useGallery;
