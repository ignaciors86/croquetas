import { useState, useEffect, useCallback, useRef } from 'react';

export const useGallery = (selectedTrack = null, onSubfolderComplete = null, onAllComplete = null, currentAudioIndex = null) => {
  const [allImages, setAllImages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [preloadProgress, setPreloadProgress] = useState(0);
  
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
  const isMobile = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth <= 768)
  );
  const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  
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
        resolve({ status: 'rejected', reason: `Failed to load ${imagePath}` });
      };
      
      updateState('loading');
      img.src = imagePath;
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
  }, [preloadImage, BATCH_SIZE, BATCH_DELAY, MAX_CONCURRENT_LOADS]);

  useEffect(() => {
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
        
        // Detectar si es Croquetas25 (usa flag del track)
        const isCroquetas25 = selectedTrack?.isCroquetas25 === true;
        
        // Construir estructura: para Croquetas25 todas las imágenes, para tracks normales por subcarpeta
        imagesList.forEach((img, index) => {
          const imageObj = typeof img === 'object' ? img : { path: img, originalPath: img, subfolder: null };
          const imagePath = imageObj.path || img;
          const subfolder = imageObj.subfolder || null;
          const normalizedSubfolder = subfolder === null ? '__root__' : subfolder;
          
          // Inicializar estado de imagen
          imageStatesRef.current.set(imagePath, { state: 'pending', imgElement: null });
          imagesBySubfolderRef.current.set(imagePath, subfolder);
          
          // Para tracks normales: organizar por subcarpeta
          // Para Croquetas25: todas las imágenes en un solo índice
          if (isCroquetas25) {
            // Croquetas25: todas las imágenes mezcladas
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

        setAllImages(imagesList);
        setPreloadProgress(0);

        // Calcular cuántas imágenes precargar inicialmente
        const initialCount = Math.min(INITIAL_PRELOAD_COUNT, imagesList.length);
        const initialImages = imagesList.slice(0, initialCount).map(img => {
          return typeof img === 'object' ? (img.path || img) : img;
        });

        // Precargar imágenes iniciales con límite de concurrencia
        let loadedInitialCount = 0;
        let activeInitialLoads = 0;
        let initialIndex = 0;
        let initialLoadingComplete = false;
        
        const loadInitialWithLimit = () => {
          // Cargar hasta el límite de concurrencia
          while (activeInitialLoads < MAX_CONCURRENT_LOADS && initialIndex < initialImages.length) {
            const img = initialImages[initialIndex];
            const imagePath = typeof img === 'object' ? (img.path || img) : img;
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
          if (initialCount < imagesList.length) {
            loadImagesInBatches(imagesList, initialCount, (newProgress) => {
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
  }, [selectedTrack, preloadImage, loadImagesInBatches]);

  // Determinar la subcarpeta actual basándose en el audio
  // Para Croquetas25 siempre retorna null (usa todas las imágenes)
  // Para tracks normales retorna la subcarpeta del audio actual
  const getCurrentSubfolder = useCallback(() => {
    // Croquetas25: no filtrar por subcarpeta
    if (selectedTrack?.isCroquetas25 === true) {
      return null;
    }
    
    if (currentAudioIndex === null || currentAudioIndex === undefined || !selectedTrack?.subfolderToAudioIndex) {
      return null;
    }
    
    // Buscar la subcarpeta que corresponde al audio actual
    for (const [subfolder, audioIndex] of Object.entries(selectedTrack.subfolderToAudioIndex)) {
      if (audioIndex === currentAudioIndex) {
        return subfolder === '__root__' ? null : subfolder;
      }
    }
    
    // Si no se encontró mapeo y el índice es 0, usar la primera subcarpeta
    if (currentAudioIndex === 0 && selectedTrack?.subfolderOrder && selectedTrack.subfolderOrder.length > 0) {
      const firstSubfolder = selectedTrack.subfolderOrder[0];
      return firstSubfolder === '__root__' ? null : firstSubfolder;
    }
    
    return null;
  }, [selectedTrack, currentAudioIndex]);
  
  // Inicializar índice cuando cambia el audio (solo la primera vez para cada subcarpeta)
  useEffect(() => {
    if (allImages.length === 0) return;
    
    // Detectar si es Croquetas25
    const isCroquetas25 = selectedTrack?.isCroquetas25 === true;
    
    // Solo procesar si realmente cambió el índice de audio
    if (lastAudioIndexRef.current === currentAudioIndex) {
      return;
    }
    
    // Para Croquetas25, usar todas las imágenes sin filtrar por subcarpeta
    if (isCroquetas25) {
      const allIndices = subfolderImageIndicesRef.current.get('__all__') || 
        Array.from({ length: allImages.length }, (_, i) => i);
      
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
      // Lógica original: filtrar por subcarpeta
      const currentSubfolder = getCurrentSubfolder();
      const normalizedSubfolder = currentSubfolder === null ? '__root__' : currentSubfolder;
      
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
        }
      } else if (currentSubfolder === null) {
        // Si no hay subcarpeta específica, resetear todas las imágenes
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
    
    lastAudioIndexRef.current = currentAudioIndex;
  }, [currentAudioIndex, allImages.length, getCurrentSubfolder, selectedTrack]);

  // Función para obtener la siguiente imagen disponible
  const getNextImage = useCallback(() => {
    if (allImages.length === 0) {
      return null;
    }

    // Detectar si es Croquetas25
    const isCroquetas25 = selectedTrack?.isCroquetas25 === true;
    
    let imageIndices;
    let normalizedSubfolder;
    
    if (isCroquetas25) {
      // Croquetas25: usar todas las imágenes mezcladas
      imageIndices = subfolderImageIndicesRef.current.get('__all__') || 
        Array.from({ length: allImages.length }, (_, i) => i);
      normalizedSubfolder = '__all__';
    } else {
      // Track normal: filtrar por subcarpeta según el audio actual
      const currentSubfolder = getCurrentSubfolder();
      normalizedSubfolder = currentSubfolder === null ? '__root__' : currentSubfolder;
      
      imageIndices = subfolderImageIndicesRef.current.get(normalizedSubfolder);
      
      // Fallback: si no hay índices para esta subcarpeta, usar todas
      if (!imageIndices || imageIndices.length === 0) {
        imageIndices = Array.from({ length: allImages.length }, (_, i) => i);
      }
    }
    
    // Obtener índice actual de esta subcarpeta (inicializar si no existe)
    if (!subfolderCurrentIndexRef.current.has(normalizedSubfolder)) {
      subfolderCurrentIndexRef.current.set(normalizedSubfolder, 0);
    }
    let subfolderIndex = subfolderCurrentIndexRef.current.get(normalizedSubfolder);
    if (subfolderIndex >= imageIndices.length) {
      subfolderIndex = 0;
      subfolderCurrentIndexRef.current.set(normalizedSubfolder, 0);
    }
    
    const targetImageIndex = imageIndices[subfolderIndex];
    const targetImageObj = allImages[targetImageIndex];
    const targetImagePath = typeof targetImageObj === 'object' ? (targetImageObj.path || targetImageObj) : targetImageObj;
    const targetImageState = imageStatesRef.current.get(targetImagePath);
    
    // Buscar la siguiente imagen lista en esta subcarpeta
    let attempts = 0;
    const startIndex = subfolderIndex;
    
    while (attempts < imageIndices.length) {
      const imageIndex = imageIndices[subfolderIndex];
      const imageObj = allImages[imageIndex];
      const imagePath = typeof imageObj === 'object' ? (imageObj.path || imageObj) : imageObj;
      const imageState = imageStatesRef.current.get(imagePath);
      
      // Solo usar imágenes que estén 'ready', no 'used' ni 'loading' ni 'pending'
      if (imageState && imageState.state === 'ready') {
        const imageSubfolder = imagesBySubfolderRef.current.get(imagePath);
        const previousSubfolder = lastSubfolderRef.current;
        
        // Marcar como usada
        imageStatesRef.current.set(imagePath, { ...imageState, state: 'used' });
        
        // Actualizar contador
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
        
        // Verificar si se completó la subcarpeta anterior
        if (previousSubfolder !== null && 
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
        
        lastSubfolderRef.current = imageSubfolder;
        
        // Avanzar índice de esta subcarpeta
        subfolderIndex++;
        let subfolderCompletedCycle = false;
        if (subfolderIndex >= imageIndices.length) {
          // Cuando se completa el ciclo (índice vuelve a 0), resetear todas las imágenes a "ready"
          // para permitir que se usen de nuevo (solo si NO es el último tramo)
          if (!isLastSubfolder) {
            subfolderImageIndicesRef.current.get(normalizedImageSubfolder)?.forEach(idx => {
              const imgObj = allImages[idx];
              const imgPath = typeof imgObj === 'object' ? (imgObj.path || imgObj) : imgObj;
              const state = imageStatesRef.current.get(imgPath);
              if (state && state.state === 'used') {
                imageStatesRef.current.set(imgPath, { ...state, state: 'ready' });
              }
            });
            if (imageSubfolder !== null && subfolderCountsRef.current.has(imageSubfolder)) {
              subfolderCountsRef.current.get(imageSubfolder).used = 0;
            }
            subfolderIndex = 0;
            subfolderCompletedCycle = true;
            
            // Marcar esta subcarpeta como completada al menos una vez
            subfoldersCompletedAtLeastOnceRef.current.add(normalizedImageSubfolder);
          } else {
            // Si es el último tramo y llegamos al final, marcar que la próxima imagen será la última
            subfolderIndex = imageIndices.length; // Mantener en el final para evitar más iteraciones
            // Guardar índice antes de salir
            subfolderCurrentIndexRef.current.set(normalizedSubfolder, subfolderIndex);
            currentIndexRef.current = imageIndices[0] || 0;
            // Marcar que la próxima imagen será la última
            isLastImageRef.current = true;
            // NO llamar a onAllComplete aquí, se llamará en el onComplete de la animación de la imagen
            return imagePath;
          }
        }
        
        // Guardar índice actualizado ANTES de verificar completitud
        subfolderCurrentIndexRef.current.set(normalizedSubfolder, subfolderIndex);
        currentIndexRef.current = imageIndices[subfolderIndex] || imageIndices[0] || 0;
        
        // Verificar si todas las subcarpetas han completado al menos un ciclo
        // Esto es más confiable que verificar imágenes "used" porque se resetean
        const allSubfoldersKeys = Array.from(subfolderCountsRef.current.keys()).map(sf => 
          sf === null ? '__root__' : sf
        );
        const allSubfoldersComplete = allSubfoldersKeys.length > 0 && 
          allSubfoldersKeys.every(subfolder => 
            subfoldersCompletedAtLeastOnceRef.current.has(subfolder)
          );
        
        if (allSubfoldersComplete && onAllComplete) {
          onAllComplete();
        }
        
        // Retornar la imagen (el flag isLastImageRef se mantiene hasta que se use)
        return imagePath;
      }

      // Si no está lista, avanzar en esta subcarpeta
      subfolderIndex++;
      if (subfolderIndex >= imageIndices.length) {
        subfolderIndex = 0;
      }
      attempts++;
    }
    
    // Guardar índice actualizado incluso si no encontramos imagen lista
    subfolderCurrentIndexRef.current.set(normalizedSubfolder, subfolderIndex);

    // Si ninguna está lista, devolver null
    return null;
  }, [allImages, onSubfolderComplete, onAllComplete, getCurrentSubfolder, selectedTrack]);

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

    // Pre-cargar las imágenes pendientes con delay escalonado
    imagesToPreload.forEach((imagePath, idx) => {
      setTimeout(() => {
        const imageState = imageStatesRef.current.get(imagePath);
        if (imageState && imageState.state === 'pending') {
          preloadImage(imagePath);
        }
      }, idx * 30);
    });

    setTimeout(() => {
      preloadingRef.current = false;
    }, imagesToPreload.length * 30 + 100);
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
