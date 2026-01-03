import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { Howl, Howler } from 'howler';
import './AudioContext.scss';

const AudioContextReact = createContext(null);

export const useAudio = () => {
  const context = useContext(AudioContextReact);
  if (!context) {
    throw new Error('useAudio must be used within AudioProvider');
  }
  return context;
};

// Singleton para el AudioContext global - SOLO UNO
let globalAudioContext = null;
let globalSourceNode = null;
let globalAnalyser = null;
let connectedAudioElement = null;

// Exponer el AudioContext global en window para acceso desde handlers de eventos del usuario
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__globalAudioContext', {
    get: () => globalAudioContext,
    configurable: true
  });
}

export const AudioProvider = ({ children, track = null, audioSrcs = [] }) => {
  // Si se pasa track, extraer audioSrcs de él
  const audioSrcsFromTrack = React.useMemo(() => {
    if (track) {
      return track.srcs || (track.src ? [track.src] : []);
    }
    return [];
  }, [track]);

  // Usar audioSrcs del track si está disponible, sino usar audioSrcs prop
  const finalAudioSrcs = audioSrcsFromTrack.length > 0 ? audioSrcsFromTrack : audioSrcs;

  // Validar y normalizar audioSrcs al inicio
  const validAudioSrcs = React.useMemo(() => {
    if (!finalAudioSrcs || !Array.isArray(finalAudioSrcs)) return [];
    
    return finalAudioSrcs
      .map(src => {
        // Convertir a string si es necesario
        if (typeof src === 'string') return src;
        if (src?.default) return src.default;
        if (src && typeof src === 'object') {
          // Intentar obtener la propiedad default o cualquier propiedad string
          const defaultVal = src.default;
          if (typeof defaultVal === 'string') return defaultVal;
        }
        return String(src);
      })
      .filter(src => {
        // Filtrar solo strings válidos con extensiones de audio
        return typeof src === 'string' && 
               src.length > 0 && 
               (src.includes('.mp3') || src.includes('.wav') || src.includes('.ogg') || src.includes('/static/media/'));
      });
  }, [finalAudioSrcs]);
  // Detectar si estamos en iOS/Android Safari (donde cambiar src causa problemas)
  const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isAndroid = typeof window !== 'undefined' && /Android/.test(navigator.userAgent);
  const isSafari = typeof window !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isChromeIOS = isIOS && /CriOS/.test(navigator.userAgent);
  const isSafariIOS = isIOS && !isChromeIOS;
  const isMobileSafari = isIOS || (isAndroid && isSafari);
  
  // SIMPLIFICACIÓN: Para un solo audio, usar la misma lógica simple que Timeline
  // NO usar Tone.js ni complejidad innecesaria
  // Solo usar múltiples elementos en Safari iOS con múltiples audios
  const useMultipleElements = isSafariIOS && validAudioSrcs.length > 1;
  const useSimpleAudio = validAudioSrcs.length === 1; // Usar lógica simple como Timeline para un solo audio
  
  // Dos elementos audio: uno actual y uno siguiente para transiciones suaves
  // O array de elementos Audio si estamos en iOS/Android Safari con múltiples audios
  // O array de instancias Howl si usamos Howler.js
  const currentAudioRef = useRef(null);
  const nextAudioRef = useRef(null);
  const audioElementsRef = useRef([]); // Array de elementos Audio (solo para iOS/Android Safari con múltiples audios)
  const howlInstancesRef = useRef([]); // Array de instancias Howl (para iOS/Android con múltiples audios)
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [audioDurations, setAudioDurations] = useState([]);
  const [preloadedAudios, setPreloadedAudios] = useState(false); // Estado para audios pre-cargados (todos los SO)
  const [preloadProgress, setPreloadProgress] = useState(0); // Progreso de pre-carga (0-100)
  
  // Refs que se compartirán con los componentes
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const timeDataArrayRef = useRef(null);
  const volumeTweenRef = useRef(null);
  const fadeOutTweenRef = useRef(null);
  const fadeInTweenRef = useRef(null);
  const transitionTimeoutRef = useRef(null);
  const handleEndedRef = useRef(null); // Ref estable para handleEnded
  const audioSrcsRef = useRef(validAudioSrcs); // Ref para audioSrcs
  const currentIndexRef = useRef(currentIndex); // Ref para currentIndex
  const isChangingFromEndedRef = useRef(false); // Flag para evitar interferencia del useEffect principal
  const iosPreloadAudioElementsRef = useRef([]); // Refs para elementos Audio de pre-carga en iOS
  const seekToAudioRef = useRef(null); // Ref para seekToAudio para que handleEnded pueda usarlo

  // El audioRef que se expone es siempre el actual
  const audioRef = currentAudioRef;

  // Función para pre-cargar todos los audios cuando hay múltiples (funciona en todos los SO)
  const preloadAllAudios = async (srcs) => {
    if (srcs.length <= 1) {
      setPreloadedAudios(true);
      setPreloadProgress(100);
      return;
    }
    
    // Limpiar audios anteriores si existen
    iosPreloadAudioElementsRef.current.forEach(audio => {
      if (audio) {
        audio.pause();
        audio.src = '';
        audio.load();
      }
    });
    iosPreloadAudioElementsRef.current = [];
    
    // También limpiar audioElementsRef si se está usando
    audioElementsRef.current.forEach(audio => {
      if (audio) {
        audio.pause();
        audio.src = '';
        audio.load();
      }
    });
    audioElementsRef.current = [];
    
    setPreloadProgress(0);
    
    // Crear y pre-cargar cada audio de forma secuencial
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isChromeIOSLocal = isIOS && /CriOS/.test(navigator.userAgent);
    
    for (let i = 0; i < srcs.length; i++) {
      const audioSrc = srcs[i];
      // Los imports estáticos de webpack ya vienen como strings con URLs válidas
      let audioSrcString = typeof audioSrc === 'string' ? audioSrc : (audioSrc?.default || audioSrc);
      
      // Asegurar que sea string (webpack siempre devuelve strings para imports estáticos)
      if (typeof audioSrcString !== 'string') {
        audioSrcString = String(audioSrcString);
      }
      
      // Verificar que la URL sea válida antes de crear el elemento de audio
      if (!audioSrcString || audioSrcString === '' || (!audioSrcString.includes('.mp3') && !audioSrcString.includes('.wav') && !audioSrcString.includes('.ogg'))) {
        continue;
      }
      
      // Asegurar que la URL sea absoluta si es relativa (para producción)
      if (!audioSrcString.startsWith('http') && !audioSrcString.startsWith('data:')) {
        // Si es una URL relativa, asegurarse de que empiece con /
        if (!audioSrcString.startsWith('/')) {
          audioSrcString = '/' + audioSrcString;
        }
      }
      
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = audioSrcString;
      
      // Esperar a que el audio esté suficientemente cargado usando eventos, no timeouts
      await new Promise((resolve) => {
        let resolved = false;
        
        const cleanup = () => {
          audio.removeEventListener('canplay', handleCanPlay);
          audio.removeEventListener('canplaythrough', handleCanPlayThrough);
          audio.removeEventListener('loadeddata', handleLoadedData);
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
          audio.removeEventListener('error', handleError);
        };
        
        const handleCanPlay = () => {
          if (!resolved && audio.readyState >= 2) {
            resolved = true;
            cleanup();
            resolve();
          }
        };
        
        const handleCanPlayThrough = () => {
          if (!resolved && audio.readyState >= 3) {
            resolved = true;
            cleanup();
            console.log(`[AudioContext] Audio ${i} pre-cargado (canplaythrough, readyState: ${audio.readyState})`);
            resolve();
          }
        };
        
        const handleLoadedData = () => {
          if (!resolved && audio.readyState >= 2) {
            resolved = true;
            cleanup();
            console.log(`[AudioContext] Audio ${i} pre-cargado (loadeddata, readyState: ${audio.readyState})`);
            resolve();
          }
        };
        
        const handleLoadedMetadata = () => {
          // Si tenemos metadata y duration, considerar listo
          if (!resolved && audio.readyState >= 1 && audio.duration && isFinite(audio.duration) && audio.duration > 0) {
            resolved = true;
            cleanup();
            console.log(`[AudioContext] Audio ${i} pre-cargado (loadedmetadata, readyState: ${audio.readyState})`);
            resolve();
          }
        };
        
        const handleError = () => {
          if (!resolved) {
            resolved = true;
            cleanup();
            // Log simple del error, sin reintentos
            if (audio.error) {
              console.warn(`[AudioContext] Error pre-cargando audio ${i}:`, audio.error.message);
            }
            resolve();
          }
        };
        
        audio.addEventListener('canplay', handleCanPlay);
        audio.addEventListener('canplaythrough', handleCanPlayThrough);
        audio.addEventListener('loadeddata', handleLoadedData);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('error', handleError);
        
        // Intentar cargar
        try {
          audio.load();
        } catch (error) {
          console.warn(`[AudioContext] Error al llamar load() en audio ${i}:`, error);
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve();
          }
        }
      });
      
      // Guardar referencia al audio pre-cargado
      iosPreloadAudioElementsRef.current.push(audio);
      
      // IMPORTANTE: También guardar en audioElementsRef para Chrome iOS y otros casos
      // donde necesitamos renderizar múltiples elementos audio
      // Chrome iOS siempre necesita múltiples elementos cuando hay múltiples audios
      if (isChromeIOSLocal && srcs.length > 1) {
        audioElementsRef.current.push(audio);
        console.log(`[AudioContext] Chrome iOS: Audio ${i} guardado en audioElementsRef`);
      } else if (isIOS && srcs.length > 1 && !isChromeIOSLocal) {
        // Safari iOS también puede necesitarlo
        audioElementsRef.current.push(audio);
      }
      
      // Actualizar progreso
      const progress = Math.round(((i + 1) / srcs.length) * 100);
      setPreloadProgress(progress);
      
      // En Safari iOS, si el audio tiene metadata (readyState >= 1), considerarlo listo
      // Esto ayuda a que el loading no se quede atascado
      if (isIOS && audio.readyState >= 1 && i === srcs.length - 1) {
        // Si es el último audio y tiene metadata, marcar como cargado
        console.log('[AudioContext] Último audio pre-cargado con metadata, marcando como cargado');
        setPreloadedAudios(true);
        setPreloadProgress(100);
        setIsLoaded(true);
      }
    }
    
    console.log('[AudioContext] Todos los audios pre-cargados');
    setPreloadedAudios(true);
    setPreloadProgress(100);
    
    // IMPORTANTE: En Safari iOS, asegurar que isLoaded esté marcado
    // incluso si algunos audios no tienen readyState completo
    if (isIOS) {
      // Verificar si al menos el primer audio tiene metadata
      const firstAudio = iosPreloadAudioElementsRef.current[0];
      if (firstAudio && firstAudio.readyState >= 1) {
        console.log('[AudioContext] Safari iOS: Primer audio tiene metadata, marcando como cargado');
        setIsLoaded(true);
      } else if (srcs.length === 1) {
        // Si solo hay un audio y no tiene metadata aún, darle un poco más de tiempo
        // pero marcar como cargado de todas formas (Safari puede cargar bajo demanda)
        console.log('[AudioContext] Safari iOS: Un solo audio, marcando como cargado (carga bajo demanda)');
        setIsLoaded(true);
      }
    }
  };

  // Listener global para resumir AudioContext en móviles - añadido temprano
  useEffect(() => {
    const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = typeof window !== 'undefined' && /Android/.test(navigator.userAgent);
    const isMobile = isIOS || isAndroid;
    
    if (!isMobile) return;
    
    let hasResumed = false;
    
    const resumeOnUserInteraction = async () => {
      // Solo intentar una vez para evitar múltiples intentos
      if (hasResumed) return;
      
      const audioContext = audioContextRef?.current || globalAudioContext || window.__globalAudioContext;
      
      if (audioContext && audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
          hasResumed = true;
          console.log('[AudioContext] AudioContext resumido desde interacción global del usuario (móvil)');
        } catch (err) {
          console.warn('[AudioContext] Error resumiendo AudioContext desde interacción global:', err);
        }
      } else if (audioContext && audioContext.state === 'running') {
        hasResumed = true;
      }
    };
    
    // Añadir listeners con capture para capturar antes que otros
    document.addEventListener('touchstart', resumeOnUserInteraction, { capture: true, passive: true });
    document.addEventListener('click', resumeOnUserInteraction, { capture: true, passive: true });
    document.addEventListener('mousedown', resumeOnUserInteraction, { capture: true, passive: true });
    
    return () => {
      document.removeEventListener('touchstart', resumeOnUserInteraction, { capture: true });
      document.removeEventListener('click', resumeOnUserInteraction, { capture: true });
      document.removeEventListener('mousedown', resumeOnUserInteraction, { capture: true });
    };
  }, []); // Solo ejecutar una vez al montar

  // Cargar duraciones de todos los audios
  useEffect(() => {
    // Resetear estado de pre-carga cuando cambian los audios
    setPreloadedAudios(false);
    setPreloadProgress(0);
    
    if (!validAudioSrcs || validAudioSrcs.length === 0) {
      setAudioDurations([]);
      setPreloadedAudios(true); // Si no hay audios, marcar como listo
      setPreloadProgress(100);
      return;
    }

    const loadDurations = async () => {
      const durations = [];
      
      // Cargar duraciones usando eventos, no timeouts
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      
      for (let i = 0; i < validAudioSrcs.length; i++) {
        const audioSrc = validAudioSrcs[i];
        // En iOS, asegurar que las rutas se conviertan correctamente
        let audioSrcString = typeof audioSrc === 'string' ? audioSrc : (audioSrc?.default || audioSrc);
        
        // Asegurar que la URL sea absoluta si es relativa (para producción)
        if (!audioSrcString.startsWith('http') && !audioSrcString.startsWith('data:')) {
          // Si es una URL relativa, asegurarse de que empiece con /
          if (!audioSrcString.startsWith('/')) {
            audioSrcString = '/' + audioSrcString;
          }
        }
        
        const audio = new Audio(audioSrcString);
        
        try {
          await new Promise((resolve) => {
            let resolved = false;
            
            const cleanup = () => {
              audio.removeEventListener('loadedmetadata', handleLoaded);
              audio.removeEventListener('error', handleError);
              audio.removeEventListener('canplay', handleCanPlay);
            };

            const handleLoaded = () => {
              if (!resolved) {
                cleanup();
                resolved = true;
                if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
                  durations[i] = audio.duration;
                  console.log(`[AudioContext] Duration loaded for audio ${i}: ${audio.duration.toFixed(2)}s`);
                } else {
                  durations[i] = 0;
                }
                resolve();
              }
            };

            const handleError = () => {
              if (!resolved) {
                cleanup();
                resolved = true;
                durations[i] = 0;
                resolve();
              }
            };
            
            // Escuchar 'canplay' como fallback
            const handleCanPlay = () => {
              if (!resolved && audio.duration && isFinite(audio.duration) && audio.duration > 0) {
                handleLoaded();
              }
            };

            audio.addEventListener('loadedmetadata', handleLoaded);
            audio.addEventListener('error', handleError);
            audio.addEventListener('canplay', handleCanPlay);
            audio.load();
          });
        } catch (error) {
          console.warn(`[AudioContext] Error loading duration for audio ${i}:`, error);
          durations[i] = 0;
        }
      }

      setAudioDurations(durations);
      
      // Si tenemos duraciones cargadas, considerar el audio como listo para reproducir
      // (especialmente para un solo audio)
      if (durations.length > 0 && durations[0] > 0) {
        console.log('[AudioContext] Duración cargada, marcando audio como listo para reproducir');
        setIsLoaded(true);
        setLoadingProgress(100);
      }
      
      // Pre-cargar todos los audios cuando hay múltiples
      if (validAudioSrcs.length > 1) {
        console.log('[AudioContext] Múltiples audios detectados: iniciando pre-carga...');
        
        // Para múltiples audios, usar elementos audio nativos (sin Tone.js)
        console.log('[AudioContext] Usando elementos audio nativos para múltiples audios...');
        preloadAllAudios(validAudioSrcs);
    } else {
      setPreloadedAudios(true); // Si solo hay un audio, marcar como listo
      setPreloadProgress(100);
    }
    };

    loadDurations();
  }, [validAudioSrcs]);

  // Sincronizar refs cuando cambian desde fuera (seekToAudio, etc.)
  useEffect(() => {
    // Solo actualizar si no estamos en medio de un cambio desde handleEnded
    if (!isChangingFromEndedRef.current) {
      audioSrcsRef.current = validAudioSrcs;
      // Actualizar currentIndexRef solo si realmente cambió (para evitar sobrescribir cambios de seekToAudio que ya lo actualizaron)
      if (currentIndexRef.current !== currentIndex) {
        console.log(`[AudioContext] Sincronizando currentIndexRef: ${currentIndexRef.current} -> ${currentIndex}`);
        currentIndexRef.current = currentIndex;
      }
    }
  }, [validAudioSrcs, currentIndex]);

  // Precargar el siguiente audio
  useEffect(() => {
    if (!validAudioSrcs || validAudioSrcs.length === 0) return;
    
    const nextIndex = (currentIndex + 1) % validAudioSrcs.length;
    const nextSrc = validAudioSrcs[nextIndex];
    
    if (nextAudioRef.current && nextSrc && validAudioSrcs.length > 1) {
      nextAudioRef.current.src = nextSrc;
      nextAudioRef.current.load();
    }
  }, [validAudioSrcs, currentIndex]);

  // Listener estable para el evento 'ended' - separado del useEffect principal
  useEffect(() => {
    const audio = currentAudioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      console.log('[AudioContext] Audio ended event fired');
      const currentAudio = currentAudioRef.current;
      if (!currentAudio) return;
      
      // Si ya estamos haciendo fade out (fade automático), ignorar el evento ended
      if (fadeOutTweenRef.current && fadeOutTweenRef.current.isActive()) {
        console.log('[AudioContext] Ignorando ended porque ya hay fade out en curso');
        return;
      }
      
      setIsPlaying(false);
      
      // Usar refs para obtener valores actuales sin depender de closures
      const srcs = validAudioSrcs;
      const idx = currentIndexRef.current;
      
      if (!srcs || srcs.length <= 1) {
        console.log('[AudioContext] Solo hay un audio, no cambiar');
        // Disparar evento para que el componente padre maneje la salida
        window.dispatchEvent(new CustomEvent('audioSegmentEnded', { 
          detail: { 
            currentIndex: idx, 
            isLastAudio: true,
            wasPlaying: true
          } 
        }));
        return;
      }
      
      // Verificar si es el último audio
      const isLastAudio = idx === srcs.length - 1;
      
      if (isLastAudio) {
        console.log('[AudioContext] Es el último audio, no cambiar automáticamente');
        // Disparar evento para que el componente padre maneje la salida
        window.dispatchEvent(new CustomEvent('audioSegmentEnded', { 
          detail: { 
            currentIndex: idx, 
            isLastAudio: true,
            wasPlaying: true
          } 
        }));
        return;
      }
      
      // No es el último audio, cambiar al siguiente usando seekToAudio
      const nextIndex = idx + 1;
      
      console.log(`[AudioContext] Audio ${idx} terminó. Cambiando a índice ${nextIndex} usando seekToAudio`);
      
      // Disparar evento antes de cambiar para que los componentes puedan actualizar guiones, etc.
      window.dispatchEvent(new CustomEvent('audioSegmentEnded', { 
        detail: { 
          currentIndex: idx, 
          nextIndex: nextIndex,
          isLastAudio: false,
          wasPlaying: true
        } 
      }));
      
      // Usar seekToAudio directamente - ya maneja el fade out/in correctamente
            if (seekToAudioRef.current) {
        console.log(`[AudioContext] handleEnded: Llamando a seekToAudio(${nextIndex}, 0) para cambio con fade`);
        // seekToAudio ya maneja el fade out del actual y fade in del siguiente
        seekToAudioRef.current(nextIndex, 0);
            } else {
        console.warn('[AudioContext] handleEnded: seekToAudioRef.current no está disponible');
            }
    };

    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, []); // Sin dependencias - el listener se mantiene estable y usa refs para valores actuales

  // Monitorear el tiempo del audio para hacer fade automático antes del final
  const validAudioSrcsLengthRef = React.useRef(validAudioSrcs.length);
  React.useEffect(() => {
    validAudioSrcsLengthRef.current = validAudioSrcs.length;
  }, [validAudioSrcs.length]);

  const audioDurationsRef = React.useRef(audioDurations);
  React.useEffect(() => {
    audioDurationsRef.current = audioDurations;
  }, [audioDurations]);

  useEffect(() => {
    if (!isPlaying || !currentAudioRef.current || validAudioSrcsLengthRef.current <= 1) return;
    
    const audio = currentAudioRef.current;
    const currentIdx = currentIndexRef.current;
    const duration = audioDurationsRef.current[currentIdx];
    
    if (!duration || duration === 0) return;
    
    // Hacer fade out 3 segundos antes del final y cambiar al siguiente
    const fadeOutTime = duration - 3; // 3 segundos antes del final
    if (fadeOutTime <= 0) return; // Si el audio es muy corto, no hacer fade
    
    let timeUpdateInterval = null;
    let fadeOutStarted = false;
    
    const checkTime = () => {
      if (!audio || audio.paused) {
        if (timeUpdateInterval) {
          clearInterval(timeUpdateInterval);
          timeUpdateInterval = null;
        }
        return;
      }
      
      const currentTime = audio.currentTime || 0;
      
      // Si llegamos al tiempo de fade out y aún no hemos empezado
      if (currentTime >= fadeOutTime && !fadeOutStarted) {
        fadeOutStarted = true;
        
        // Verificar si hay siguiente audio
        const nextIndex = currentIdx + 1;
        if (nextIndex < validAudioSrcsLengthRef.current) {
          console.log(`[AudioContext] Iniciando fade automático antes del final (${fadeOutTime.toFixed(2)}s de ${duration.toFixed(2)}s)`);
          
          // Hacer fade out del actual
          if (fadeOutTweenRef.current) {
            fadeOutTweenRef.current.kill();
          }
          
          fadeOutTweenRef.current = gsap.to(audio, {
            volume: 0,
            duration: 2.5, // Fade out de 2.5 segundos
            ease: 'power2.in',
            onComplete: () => {
              // Cambiar al siguiente audio usando seekToAudio (marcar que viene de fade automático)
              if (seekToAudioRef.current) {
                console.log(`[AudioContext] Fade automático completado, cambiando a audio ${nextIndex}`);
                seekToAudioRef.current(nextIndex, 0, true);
              }
              fadeOutTweenRef.current = null;
            }
          });
        }
      }
      
      // Si el audio terminó o pasó el tiempo de fade, limpiar
      if (currentTime >= duration || fadeOutStarted) {
        if (timeUpdateInterval) {
          clearInterval(timeUpdateInterval);
          timeUpdateInterval = null;
        }
      }
    };
    
    // Verificar cada 100ms
    timeUpdateInterval = setInterval(checkTime, 100);
    
    return () => {
      if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
      }
      fadeOutStarted = false;
    };
  }, [isPlaying, currentIndex]);

  // Configurar el audio actual
  useEffect(() => {
    if (!validAudioSrcs || validAudioSrcs.length === 0) return;

    const currentSrc = validAudioSrcs[currentIndex];
    if (!currentSrc) return;
    
    // Si estamos cambiando desde handleEnded, no hacer nada aquí para evitar interferencia
    if (isChangingFromEndedRef.current) {
      console.log('[AudioContext] Ignorando useEffect principal porque el cambio viene de handleEnded');
      return;
    }
    
    // Declarar variables que se usarán en el cleanup
    let progressIntervalId = null;
    let audioCleanup = null;
    
    // SIMPLIFICACIÓN: Para un solo audio, inicializar pero seguir el flujo normal
    if (useSimpleAudio && !currentAudioRef.current) {
      // Crear elemento Audio directamente como Timeline si no existe
      const audioSrcString = typeof currentSrc === 'string' ? currentSrc : (currentSrc?.default || currentSrc);
      console.log(`[AudioContext] Creando Audio simple como Timeline: ${audioSrcString}`);
      currentAudioRef.current = new Audio();
      currentAudioRef.current.preload = 'auto';
      // El src se configurará en el flujo normal más abajo
    }
    
    
    // En iOS/Android Safari con múltiples audios, usar elementos diferentes
    // También en Chrome iOS con múltiples audios
    const isChromeIOS = isIOS && /CriOS/.test(navigator.userAgent);
    const shouldUseMultipleElements = (useMultipleElements || (isChromeIOS && validAudioSrcs.length > 1)) && audioElementsRef.current.length > 0;
    
    if (shouldUseMultipleElements) {
      const audio = audioElementsRef.current[currentIndex];
      if (!audio) {
        console.warn(`[AudioContext] No hay elemento Audio para índice ${currentIndex}`);
        return;
      }
      
      // Si ya es el elemento actual, no hacer nada
      if (currentAudioRef.current === audio) {
        return;
      }
      
      // Pausar el elemento anterior
      if (currentAudioRef.current && currentAudioRef.current !== audio) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      }
      
      // Establecer el nuevo elemento como actual
      currentAudioRef.current = audio;
      console.log(`[AudioContext] Cambiado a elemento Audio ${currentIndex}/${audioElementsRef.current.length} (${isChromeIOS ? 'Chrome iOS' : 'Safari iOS'})`);
      // Continuar con la configuración normal del audio (setupAudioContext, etc.)
    } else {
      // Lógica normal: cambiar src del mismo elemento
      const audio = currentAudioRef.current;
      if (!audio) return;
      
      // Verificar si el src ya está configurado correctamente (para evitar resetear cuando handleEnded cambia el src)
      // Los imports estáticos de webpack ya vienen como URLs válidas (como Timeline)
      // NO normalizar - webpack ya procesa las URLs correctamente
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      let currentSrcString = typeof currentSrc === 'string' ? currentSrc : (currentSrc?.default || currentSrc);
      
      // Asegurar que sea string (webpack siempre devuelve strings para imports estáticos)
      if (typeof currentSrcString !== 'string') {
        console.warn('[AudioContext] Audio src no es string:', currentSrcString);
        currentSrcString = String(currentSrcString);
      }
      
      const currentAudioSrc = audio.src || '';
      // Comparar URLs directamente (webpack ya las procesa correctamente)
      // NO normalizar - las URLs de webpack ya son correctas
      const hasMultipleAudios = validAudioSrcs.length > 1;
      
      if (currentAudioSrc === currentSrcString && audio.readyState >= 1) {
        // En iOS con múltiples audios, verificar que realmente esté listo (readyState 2 y duration válida)
        if (isIOS && hasMultipleAudios) {
          if (audio.readyState < 2 || !audio.duration || !isFinite(audio.duration) || audio.duration <= 0) {
            // Forzar recarga si no está suficientemente cargado
            console.log('[AudioContext] iOS múltiples audios: readyState o duration insuficiente, forzando recarga');
            // No hacer return, continuar con la configuración
          } else {
            // El src ya está configurado y está realmente listo
            return;
          }
        } else {
          // El src ya está configurado y tiene metadata, no hacer nada
          return;
      }
      }

      // Detección mejorada de navegadores y dispositivos (isIOS ya está definido arriba)
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
      const isChromeIOS = isIOS && /CriOS/.test(navigator.userAgent);
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      audio.volume = 0;
      audio.muted = false;
    // Usar 'auto' para mejor compatibilidad, pero manejar la carga manualmente
    audio.preload = 'auto';
    audio.loop = false; // No loop, manejamos la playlist manualmente
    // Asegurar atributos de compatibilidad
    audio.crossOrigin = 'anonymous';
    audio.playsInline = true;

    const updateProgress = () => {
      if (!audio) return;
      
      // Ajustar minReadyState según el navegador para mejor compatibilidad
      let minReadyState = 2; // Por defecto, esperar metadata y datos
      if (isIOS || isSafari) {
        minReadyState = 1; // iOS/Safari puede funcionar con menos datos
      } else if (isChrome && isMobile) {
        minReadyState = 2; // Chrome mobile necesita más datos
      }
      
      if (audio.readyState >= minReadyState) {
        if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
          if (audio.buffered.length > 0) {
            const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
            const progress = Math.min((bufferedEnd / audio.duration) * 100, 100);
            setLoadingProgress(progress);
            
            // Para iOS/Safari, ser más permisivo - no esperar tanto buffer
            // iOS puede cargar bajo demanda mientras reproduce
            const isLargeFile = audio.duration > 300; // 5 minutos
            const loadThreshold = (isIOS || isSafari) 
              ? (isLargeFile ? 0.5 : 0.3)  // En iOS/Safari, aceptar con menos buffer
              : 0.95;
            
            // En iOS, no requerir buffer mínimo absoluto - puede cargar bajo demanda
            const minBufferSeconds = 0; // No requerir buffer mínimo en iOS
            const hasMinBuffer = true; // Siempre true en iOS
            
            if ((progress >= (loadThreshold * 100) || bufferedEnd >= audio.duration * loadThreshold) && hasMinBuffer) {
              if (!isLoaded) {
                setIsLoaded(true);
                setLoadingProgress(100);
                console.log(`[AudioContext] Audio marked as loaded. Progress: ${progress.toFixed(1)}%, Buffer: ${bufferedEnd.toFixed(1)}s/${audio.duration.toFixed(1)}s`);
              }
            }
          } else if (audio.readyState >= 2) {
            // En iOS/Safari, si tenemos readyState 2, considerar cargado incluso sin buffer
            if ((isIOS || isSafari) && !isLoaded) {
              setIsLoaded(true);
              setLoadingProgress(100);
              console.log(`[AudioContext] Audio marked as loaded (iOS/Safari, readyState: ${audio.readyState})`);
            } else if (audio.readyState >= 3 && !isLoaded) {
              // Otros navegadores necesitan readyState 3
              setIsLoaded(true);
              setLoadingProgress(100);
            }
          }
        } else if (audio.readyState >= 2 && (isIOS || isSafari) && !isLoaded) {
          // En iOS/Safari, si tenemos readyState 2, considerar cargado incluso sin duration
          setIsLoaded(true);
          setLoadingProgress(100);
          console.log(`[AudioContext] Audio marked as loaded (iOS/Safari, readyState: ${audio.readyState}, sin duration aún)`);
        } else if (audio.readyState >= 3 && !isLoaded) {
          // Si tenemos suficiente readyState pero no duration, aún considerar cargado
          setIsLoaded(true);
          setLoadingProgress(100);
        }
      } else {
        // Calcular progreso basado en readyState
        const progress = Math.min((audio.readyState / 4) * 100, (isIOS || isSafari) ? 50 : 95);
        setLoadingProgress(progress);
      }
    };

    const setupAudioContext = async () => {
      try {
        // En iOS con múltiples audios, siempre reconectar si el elemento cambió
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const hasMultipleAudios = validAudioSrcs.length > 1;
        
        if (connectedAudioElement === audio && globalAudioContext && globalAnalyser && !(isIOS && hasMultipleAudios)) {
          console.log('[AudioContext] Reusing existing connection');
          audioContextRef.current = globalAudioContext;
          analyserRef.current = globalAnalyser;
          const bufferLength = globalAnalyser.frequencyBinCount;
          dataArrayRef.current = new Uint8Array(bufferLength);
          timeDataArrayRef.current = new Uint8Array(bufferLength);
          setIsInitialized(true);
          return;
        }

        if (globalAudioContext && connectedAudioElement && connectedAudioElement !== audio) {
          console.log('[AudioContext] Disconnecting previous audio');
          try {
            if (globalSourceNode) {
              globalSourceNode.disconnect();
            }
          } catch (e) {
            console.warn('[AudioContext] Error disconnecting:', e);
          }
          globalSourceNode = null;
          connectedAudioElement = null;
        }

        if (!globalAudioContext || globalAudioContext.state === 'closed') {
          try {
            globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('[AudioContext] Created AudioContext | state:', globalAudioContext.state);
            // Actualizar la referencia en window
            if (typeof window !== 'undefined') {
              Object.defineProperty(window, '__globalAudioContext', {
                get: () => globalAudioContext,
                configurable: true
              });
            }
          } catch (error) {
            console.error('[AudioContext] Error creating AudioContext:', error);
            globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            // Actualizar la referencia en window incluso si hay error
            if (typeof window !== 'undefined') {
              Object.defineProperty(window, '__globalAudioContext', {
                get: () => globalAudioContext,
                configurable: true
              });
            }
          }
        }

        if (!globalAnalyser) {
          globalAnalyser = globalAudioContext.createAnalyser();
          globalAnalyser.fftSize = 2048;
          globalAnalyser.smoothingTimeConstant = 0.3;
          console.log('[AudioContext] Created AnalyserNode');
        }

        try {
          globalSourceNode = globalAudioContext.createMediaElementSource(audio);
          connectedAudioElement = audio;

          globalSourceNode.connect(globalAnalyser);
          globalAnalyser.connect(globalAudioContext.destination);

          // En móviles, el AudioContext puede estar suspendido y necesita ser resumido por interacción del usuario
          // Intentar resumir, pero si falla, los listeners de eventos del usuario lo harán
          if (globalAudioContext.state === 'suspended') {
            try {
              await globalAudioContext.resume();
              console.log('[AudioContext] AudioContext resumido en setupAudioContext, estado:', globalAudioContext.state);
              // En Safari iOS con múltiples audios, puede necesitar múltiples intentos
              if ((isSafari || isIOS) && hasMultipleAudios && globalAudioContext.state === 'suspended') {
                // Intentar múltiples veces con delays crecientes
                for (let i = 0; i < 3; i++) {
                  await new Promise(resolve => setTimeout(resolve, 150 * (i + 1)));
                  try {
                    await globalAudioContext.resume();
                    if (globalAudioContext.state !== 'suspended') {
                      console.log(`[AudioContext] AudioContext resumido en Safari iOS (intento ${i + 1})`);
                      break;
                    }
                  } catch (e) {
                    console.warn(`[AudioContext] Error resuming AudioContext (intento ${i + 1}):`, e);
                  }
                }
              }
            } catch (resumeError) {
              // En móviles, es normal que falle aquí - los listeners de eventos del usuario lo resumirán
              console.log('[AudioContext] AudioContext suspendido (normal en móviles), será resumido por interacción del usuario');
            }
          }
          
          // Añadir listener global para resumir AudioContext en cualquier interacción del usuario (móviles)
          if (typeof window !== 'undefined' && (isIOS || isAndroid)) {
            const resumeOnUserInteraction = async () => {
              if (globalAudioContext && globalAudioContext.state === 'suspended') {
                try {
                  await globalAudioContext.resume();
                  console.log('[AudioContext] AudioContext resumido desde interacción del usuario');
                  // Remover el listener después de resumir exitosamente
                  document.removeEventListener('touchstart', resumeOnUserInteraction, { capture: true });
                  document.removeEventListener('click', resumeOnUserInteraction, { capture: true });
                } catch (err) {
                  console.warn('[AudioContext] Error resumiendo AudioContext desde interacción:', err);
                }
              }
            };
            
            // Añadir listeners con capture para capturar antes que otros
            document.addEventListener('touchstart', resumeOnUserInteraction, { capture: true, passive: true, once: true });
            document.addEventListener('click', resumeOnUserInteraction, { capture: true, passive: true, once: true });
          }

          audioContextRef.current = globalAudioContext;
          analyserRef.current = globalAnalyser;
          const bufferLength = globalAnalyser.frequencyBinCount;
          dataArrayRef.current = new Uint8Array(bufferLength);
          timeDataArrayRef.current = new Uint8Array(bufferLength);

          setIsInitialized(true);
          console.log('[AudioContext] Setup successful');

        } catch (connectError) {
          if (connectError.name === 'InvalidStateError') {
            console.error('[AudioContext] Audio already connected');
            setIsInitialized(true);
          } else {
            throw connectError;
          }
        }

      } catch (error) {
        console.error('[AudioContext] Error setting up AudioContext:', error);
        setIsInitialized(true);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    
    const handleCanPlay = async () => {
      updateProgress();
      await setupAudioContext();
      // Marcar como cargado si tenemos suficiente readyState
      // En iOS/Safari, ser más permisivo
      if (audio.readyState >= 1) {
        // En iOS/Safari, readyState 1 es suficiente
        if (isIOS || isSafari) {
          if (!isLoaded) {
            setIsLoaded(true);
            setLoadingProgress(100);
            console.log(`[AudioContext] Audio ${currentIndex} marcado como cargado en handleCanPlay (iOS/Safari, readyState: ${audio.readyState})`);
          }
        } else if (audio.readyState >= 2) {
          // Otros navegadores necesitan readyState 2
          if (!isLoaded) {
            setIsLoaded(true);
            setLoadingProgress(100);
          }
        }
      }
    };

    const handleProgress = () => updateProgress();
    const handleLoadedData = () => {
      updateProgress();
      // Para iOS/Safari, marcar como cargado con readyState 1
      // Para otros navegadores, esperar readyState 2
      const minReadyForLoaded = (isIOS || isSafari) ? 1 : 2;
      if (audio.readyState >= minReadyForLoaded) {
        if (!isLoaded) {
          setIsLoaded(true);
          setLoadingProgress(100);
          console.log(`[AudioContext] Audio marcado como cargado en handleLoadedData (readyState: ${audio.readyState})`);
        }
      }
    };

    const handleCanPlayThrough = () => {
      updateProgress();
      setIsLoaded(true);
      setLoadingProgress(100);
    };
    
    // Handler adicional para loadedmetadata (importante para Safari/iOS)
    const handleLoadedMetadata = () => {
      updateProgress();
      // Si tenemos duración, considerar cargado (funciona en todos los navegadores)
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        if (!isLoaded) {
          setIsLoaded(true);
          setLoadingProgress(100);
          console.log(`[AudioContext] Audio marcado como cargado en handleLoadedMetadata (duración: ${audio.duration.toFixed(2)}s, readyState: ${audio.readyState})`);
        }
      } else if ((isIOS || isSafari) && audio.readyState >= 1) {
        // En iOS/Safari, loadedmetadata es suficiente para considerar cargado incluso sin duración
        if (!isLoaded) {
          setIsLoaded(true);
          setLoadingProgress(100);
          console.log(`[AudioContext] Audio marcado como cargado en handleLoadedMetadata (iOS/Safari, readyState: ${audio.readyState})`);
        }
      }
    };
    
    const handleError = () => {
      // Log simple del error, sin reintentos ni lógica compleja
      if (audio.error) {
        console.warn('[AudioContext] Audio error:', audio.error.message, '| src:', audio.src);
      }
    };

    // El handleEnded ahora está en un useEffect separado para evitar problemas de closure

    // Configurar el src del audio actual solo si ha cambiado
    if (audio.src !== currentSrcString) {
      console.log(`[AudioContext] Cambiando src de ${audio.src || ''} a ${currentSrcString}`);
      console.log(`[AudioContext] Índice actual: ${currentIndex}, Total audios: ${validAudioSrcs.length}`);
      
      // Asegurar que la URL sea absoluta si es relativa (para producción)
      let finalSrc = currentSrcString;
      if (!finalSrc.startsWith('http') && !finalSrc.startsWith('data:')) {
        // Si es una URL relativa, asegurarse de que empiece con /
        if (!finalSrc.startsWith('/')) {
          finalSrc = '/' + finalSrc;
        }
      }
      
      // Los imports estáticos de webpack ya vienen como URLs válidas
      // NO hacer tests adicionales - confiar en webpack como Timeline
      audio.src = finalSrc;
      audio.load();
    }

    // Event listeners (ended está en un useEffect separado)
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('canplaythrough', handleCanPlayThrough);
    audio.addEventListener('progress', handleProgress);
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleError);

    audioCleanup = () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      // ended se maneja en un useEffect separado
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('canplaythrough', handleCanPlayThrough);
      audio.removeEventListener('progress', handleProgress);
      audio.removeEventListener('loadeddata', handleLoadedData);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleError);
    };

    // En iOS con múltiples audios, siempre forzar load() y dar más tiempo
    if (audio.readyState === 0 || isIOS || (isIOS && hasMultipleAudios)) {
      try {
        console.log(`[AudioContext] Llamando load() para audio ${currentIndex} (iOS: ${isIOS}, múltiples: ${hasMultipleAudios}, readyState: ${audio.readyState})`);
        audio.load();
        
      } catch (loadError) {
        console.warn('[AudioContext] Error calling load():', loadError);
      }
    }

    // Ajustar minReadyState y intervalo según navegador
    // En iOS con múltiples audios, ser más conservador (necesita readyState 2)
    const minReadyState = (isIOS || isSafari) 
      ? (hasMultipleAudios ? 2 : 1)  // Con múltiples audios, esperar más datos
      : 2;
    const progressInterval = (isIOS || isSafari) ? 200 : 100;
    
    progressIntervalId = setInterval(() => {
      if (isLoaded) {
        if (progressIntervalId) {
          clearInterval(progressIntervalId);
          progressIntervalId = null;
        }
        return;
      }
      
      updateProgress();
      
      // Para iOS/Safari, ser más permisivo - readyState 1 es suficiente
      // Para otros navegadores, ser más estricto
      const readyThreshold = (isIOS || isSafari) 
        ? 1  // iOS/Safari puede funcionar con readyState 1
        : (isChrome && !isMobile) ? 3 : minReadyState;
      
      if (audio.readyState >= readyThreshold && !isLoaded) {
        // En iOS/Safari, no requerir duration - puede cargar bajo demanda
        if (isIOS || isSafari) {
          setIsLoaded(true);
          setLoadingProgress(100);
          console.log(`[AudioContext] Audio ${currentIndex} marcado como cargado (iOS/Safari, readyState: ${audio.readyState})`);
          if (progressIntervalId) {
            clearInterval(progressIntervalId);
            progressIntervalId = null;
          }
        } else {
          // Otros navegadores pueden necesitar más validación
          setIsLoaded(true);
          setLoadingProgress(100);
          if (progressIntervalId) {
            clearInterval(progressIntervalId);
            progressIntervalId = null;
          }
        }
      }
      }, progressInterval);
    }

    return () => {
      if (progressIntervalId) {
        clearInterval(progressIntervalId);
      }
      if (audioCleanup) {
        audioCleanup();
      }
      if (fadeOutTweenRef.current) {
        fadeOutTweenRef.current.kill();
      }
      if (fadeInTweenRef.current) {
        fadeInTweenRef.current.kill();
      }
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, [validAudioSrcs, currentIndex]);

  // useEffect separado para configurar AudioContext cuando el audio simple esté listo
  useEffect(() => {
    if (useSimpleAudio && isLoaded && currentAudioRef.current && !isInitialized) {
      const audio = currentAudioRef.current;
      
      const setupAudioContext = async () => {
        try {
          if (connectedAudioElement === audio && globalAudioContext && globalAnalyser) {
            console.log('[AudioContext] Reusing existing connection (simple audio)');
            audioContextRef.current = globalAudioContext;
            analyserRef.current = globalAnalyser;
            const bufferLength = globalAnalyser.frequencyBinCount;
            dataArrayRef.current = new Uint8Array(bufferLength);
            timeDataArrayRef.current = new Uint8Array(bufferLength);
            setIsInitialized(true);
            return;
          }

          if (globalAudioContext && connectedAudioElement && connectedAudioElement !== audio) {
            console.log('[AudioContext] Disconnecting previous audio (simple audio)');
            try {
              if (globalSourceNode) {
                globalSourceNode.disconnect();
              }
            } catch (e) {
              console.warn('[AudioContext] Error disconnecting:', e);
            }
            globalSourceNode = null;
            connectedAudioElement = null;
          }

          if (!globalAudioContext || globalAudioContext.state === 'closed') {
            try {
              globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
              console.log('[AudioContext] Created AudioContext (simple audio) | state:', globalAudioContext.state);
              if (typeof window !== 'undefined') {
                Object.defineProperty(window, '__globalAudioContext', {
                  get: () => globalAudioContext,
                  configurable: true
                });
              }
            } catch (error) {
              console.error('[AudioContext] Error creating AudioContext:', error);
              globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
              if (typeof window !== 'undefined') {
                Object.defineProperty(window, '__globalAudioContext', {
                  get: () => globalAudioContext,
                  configurable: true
                });
              }
            }
          }

          if (!globalAnalyser) {
            globalAnalyser = globalAudioContext.createAnalyser();
            globalAnalyser.fftSize = 2048;
            globalAnalyser.smoothingTimeConstant = 0.3;
            console.log('[AudioContext] Created AnalyserNode (simple audio)');
          }

          try {
            globalSourceNode = globalAudioContext.createMediaElementSource(audio);
            connectedAudioElement = audio;

            globalSourceNode.connect(globalAnalyser);
            globalAnalyser.connect(globalAudioContext.destination);

            if (globalAudioContext.state === 'suspended') {
              try {
                await globalAudioContext.resume();
                console.log('[AudioContext] AudioContext resumido (simple audio), estado:', globalAudioContext.state);
              } catch (resumeError) {
                console.warn('[AudioContext] Error resuming AudioContext:', resumeError);
              }
            }

            audioContextRef.current = globalAudioContext;
            analyserRef.current = globalAnalyser;
            const bufferLength = globalAnalyser.frequencyBinCount;
            dataArrayRef.current = new Uint8Array(bufferLength);
            timeDataArrayRef.current = new Uint8Array(bufferLength);

            setIsInitialized(true);
            console.log('[AudioContext] Setup successful (simple audio)');

          } catch (connectError) {
            if (connectError.name === 'InvalidStateError') {
              console.error('[AudioContext] Audio already connected (simple audio)');
              setIsInitialized(true);
            } else {
              throw connectError;
            }
          }

        } catch (error) {
          console.error('[AudioContext] Error setting up AudioContext (simple audio):', error);
          setIsInitialized(true);
        }
      };

      setupAudioContext();
    }
  }, [useSimpleAudio, isLoaded, isInitialized]);

  const play = async () => {
    return new Promise(async (resolve) => {
      // SIMPLIFICACIÓN: Para un solo audio, usar play() simple como Timeline pero con volumen y AudioContext
      if (useSimpleAudio && currentAudioRef.current) {
        try {
          const audio = currentAudioRef.current;
          
          // Configurar AudioContext si no está inicializado
          if (!isInitialized) {
            console.log('[AudioContext] Configurando AudioContext para audio simple antes de reproducir...');
            try {
              // Crear AudioContext si no existe
              if (!globalAudioContext || globalAudioContext.state === 'closed') {
                globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log('[AudioContext] Created AudioContext (simple audio in play)');
              }
              
              // Crear Analyser si no existe
              if (!globalAnalyser) {
                globalAnalyser = globalAudioContext.createAnalyser();
                globalAnalyser.fftSize = 2048;
                globalAnalyser.smoothingTimeConstant = 0.3;
                console.log('[AudioContext] Created AnalyserNode (simple audio in play)');
              }
              
              // Conectar el audio al AudioContext
              if (connectedAudioElement !== audio) {
                if (globalSourceNode) {
                  try {
                    globalSourceNode.disconnect();
                  } catch (e) {
                    console.warn('[AudioContext] Error disconnecting previous source:', e);
                  }
                }
                
                try {
                  globalSourceNode = globalAudioContext.createMediaElementSource(audio);
                  connectedAudioElement = audio;
                  globalSourceNode.connect(globalAnalyser);
                  globalAnalyser.connect(globalAudioContext.destination);
                  console.log('[AudioContext] Audio conectado al AudioContext (simple audio in play)');
                } catch (connectError) {
                  if (connectError.name === 'InvalidStateError') {
                    console.warn('[AudioContext] Audio already connected (simple audio in play)');
                  } else {
                    throw connectError;
                  }
                }
              }
              
              // Resumir AudioContext si está suspendido
              if (globalAudioContext.state === 'suspended') {
                await globalAudioContext.resume();
                console.log('[AudioContext] AudioContext resumido (simple audio in play)');
              }
              
              // Configurar refs
              audioContextRef.current = globalAudioContext;
              analyserRef.current = globalAnalyser;
              const bufferLength = globalAnalyser.frequencyBinCount;
              dataArrayRef.current = new Uint8Array(bufferLength);
              timeDataArrayRef.current = new Uint8Array(bufferLength);
              
              setIsInitialized(true);
              console.log('[AudioContext] AudioContext configurado correctamente (simple audio in play)');
            } catch (error) {
              console.error('[AudioContext] Error configurando AudioContext (simple audio in play):', error);
            }
          } else if (globalAudioContext && globalAudioContext.state === 'suspended') {
            await globalAudioContext.resume();
            console.log('[AudioContext] AudioContext resumido antes de reproducir audio simple');
          }
          
          // Configurar volumen y hacer fade in como en el flujo normal
          audio.volume = 0;
          console.log('[AudioContext] Reproduciendo audio simple como Timeline');
          await audio.play();
          setIsPlaying(true);
          
          // Fade in con GSAP
          if (volumeTweenRef.current) {
            volumeTweenRef.current.kill();
          }
          volumeTweenRef.current = gsap.to(audio, {
            volume: 1,
            duration: 2.5,
            ease: 'sine.out',
            onComplete: () => {
              volumeTweenRef.current = null;
              resolve();
            }
          });
        } catch (error) {
          console.error('[AudioContext] Error reproduciendo audio simple:', error);
          resolve();
        }
        return;
      }
      
      // PRIORIDAD 1: Fallback a Howler.js en iOS/Android
      if (useMultipleElements && howlInstancesRef.current.length > 0) {
        const howl = howlInstancesRef.current[currentIndex];
        if (!howl) {
          console.warn('[AudioContext] No hay instancia Howl para reproducir');
          resolve();
          return;
        }
        
        try {
          // Detener otras instancias
          howlInstancesRef.current.forEach((h, i) => {
            if (i !== currentIndex && h.playing()) {
              h.stop();
            }
          });
          
          // Reproducir con Howler.js
          const soundId = howl.play();
          howl.volume(0, soundId);
          
          // Fade in con Howler.js
          howl.fade(0, 1, 2500, soundId);
          
          setIsPlaying(true);
          console.log('[AudioContext] Reproduciendo con Howler.js');
          
          // Manejar cuando termine
          howl.once('end', () => {
            setIsPlaying(false);
            // Cambiar al siguiente audio
            const nextIndex = (currentIndex + 1) % howlInstancesRef.current.length;
            if (nextIndex !== currentIndex) {
              currentIndexRef.current = nextIndex;
              setCurrentIndex(nextIndex);
            }
          });
          
          resolve();
        } catch (error) {
          console.error('[AudioContext] Error reproduciendo con Howler.js:', error);
          resolve();
        }
        return;
      }
      
      
      // Chrome iOS con múltiples audios: usar audioElementsRef en lugar de currentAudioRef
      const isChromeIOS = isIOS && /CriOS/.test(navigator.userAgent);
      if (isChromeIOS && audioElementsRef.current.length > 0 && audioElementsRef.current[currentIndex]) {
        const audio = audioElementsRef.current[currentIndex];
        if (audio && audio.paused) {
          try {
            // Asegurar que el AudioContext esté resumido
            if (globalAudioContext && globalAudioContext.state === 'suspended') {
              await globalAudioContext.resume();
            }
            
            // En Chrome iOS, ser más permisivo con readyState
            if (audio.readyState >= 1) {
              audio.volume = 0;
              await audio.play();
              console.log('[AudioContext] Chrome iOS: Audio reproducido desde audioElementsRef');
              
              // Fade in
              volumeTweenRef.current = gsap.to(audio, {
                volume: 1,
                duration: 2.5,
                ease: 'sine.out',
                onComplete: () => {
                  volumeTweenRef.current = null;
                  resolve();
                }
              });
            } else {
              // Esperar a que tenga metadata
              await new Promise((resolveWait) => {
                const handleCanPlay = () => {
                  audio.removeEventListener('canplay', handleCanPlay);
                  resolveWait();
                };
                audio.addEventListener('canplay', handleCanPlay);
                if (audio.readyState >= 1) resolveWait();
              });
              
              audio.volume = 0;
              await audio.play();
              volumeTweenRef.current = gsap.to(audio, {
                volume: 1,
                duration: 2.5,
                ease: 'sine.out',
                onComplete: () => {
                  volumeTweenRef.current = null;
                  resolve();
                }
              });
            }
          } catch (error) {
            console.error('[AudioContext] Error en Chrome iOS con múltiples audios:', error);
            resolve();
          }
          return;
        }
      }
      
      if (currentAudioRef.current && currentAudioRef.current.paused) {
        try {
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
          const isAndroid = /Android/.test(navigator.userAgent);
          const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
          const isChromeIOS = isIOS && /CriOS/.test(navigator.userAgent);
          const isMobileSafari = (isIOS || (isAndroid && isSafari));
          const hasMultipleAudios = audioSrcsRef.current.length > 1;
          
          // En iOS/Android Safari, NO bloquear por pre-carga - pueden cargar audios bajo demanda
          // Solo esperar pre-carga en otros navegadores y solo un tiempo limitado
          if (hasMultipleAudios && !preloadedAudios && !isMobileSafari) {
            console.log('[AudioContext] Múltiples audios: esperando a que todos estén pre-cargados...');
            const maxWaitTime = 3000; // Solo 3 segundos máximo
            const startTime = Date.now();
            
            // Esperar usando un efecto que observe el estado preloadedAudios
            await new Promise((resolveWait) => {
              const checkInterval = setInterval(() => {
                if (preloadedAudios) {
                  clearInterval(checkInterval);
                  console.log('[AudioContext] Todos los audios pre-cargados, continuando con play()');
                  resolveWait();
                } else if (Date.now() - startTime > maxWaitTime) {
                  clearInterval(checkInterval);
                  console.warn('[AudioContext] Timeout esperando pre-carga, continuando de todas formas...');
                  resolveWait();
                }
              }, 100);
            });
          } else if (hasMultipleAudios && !preloadedAudios && isMobileSafari) {
            // En iOS/Android Safari, no esperar - continuar inmediatamente
            console.log('[AudioContext] iOS/Android Safari: No esperando pre-carga completa, continuando inmediatamente...');
          }
          
          if (volumeTweenRef.current) {
            volumeTweenRef.current.kill();
            volumeTweenRef.current = null;
          }
          
          if (globalAudioContext) {
            if (globalAudioContext.state === 'suspended') {
              try {
                await globalAudioContext.resume();
                console.log('[AudioContext] AudioContext resumido, estado:', globalAudioContext.state);
                // En Chrome iOS, puede necesitar múltiples intentos
                if ((isIOS || isChromeIOS) && globalAudioContext.state === 'suspended') {
                  // Intentar múltiples veces con delays crecientes
                  for (let i = 0; i < 3; i++) {
                    await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
                    try {
                      await globalAudioContext.resume();
                      if (globalAudioContext.state !== 'suspended') {
                        console.log(`[AudioContext] AudioContext resumido en intento ${i + 1}`);
                        break;
                      }
                    } catch (e) {
                      console.warn(`[AudioContext] Error resuming AudioContext (intento ${i + 1}):`, e);
                    }
                  }
                }
              } catch (resumeError) {
                console.warn('[AudioContext] Error resuming AudioContext in play:', resumeError);
              }
            }
          }
          
          // Esperar a que el audio esté listo usando eventos, no timeouts
          // En iOS/Android Safari con múltiples audios, ser más permisivo con readyState
          const minReadyState = (isMobileSafari && hasMultipleAudios) ? 1 : 2;
          if (currentAudioRef.current.readyState < minReadyState) {
            await new Promise((resolveWait) => {
              const audio = currentAudioRef.current;
              let resolved = false;
              
              const cleanup = () => {
                audio.removeEventListener('canplay', handleCanPlay);
                audio.removeEventListener('loadeddata', handleLoadedData);
                audio.removeEventListener('error', handleError);
              };
              
              const handleCanPlay = () => {
                if (!resolved && audio.readyState >= minReadyState) {
                  resolved = true;
                  cleanup();
                  console.log(`[AudioContext] Audio listo (canplay, readyState: ${audio.readyState})`);
                  resolveWait();
                }
              };
              
              const handleLoadedData = () => {
                if (!resolved && audio.readyState >= minReadyState) {
                  resolved = true;
                  cleanup();
                  console.log(`[AudioContext] Audio listo (loadeddata, readyState: ${audio.readyState})`);
                  resolveWait();
                }
              };
              
              const handleError = () => {
                if (!resolved) {
                  resolved = true;
                  cleanup();
                  console.warn('[AudioContext] Error esperando audio listo, continuando...');
                  resolveWait();
                }
              };
              
              // Si ya está listo, resolver inmediatamente
              if (audio.readyState >= minReadyState) {
                resolveWait();
                return;
              }
              
              audio.addEventListener('canplay', handleCanPlay);
              audio.addEventListener('loadeddata', handleLoadedData);
              audio.addEventListener('error', handleError);
              
              // Verificar periódicamente el estado (solo como fallback, los eventos deberían dispararse)
              const checkInterval = setInterval(() => {
                if (audio.readyState >= 2 && !resolved) {
                  resolved = true;
                  clearInterval(checkInterval);
                  cleanup();
                  console.log(`[AudioContext] Audio listo (verificación periódica, readyState: ${audio.readyState})`);
                  resolveWait();
                }
              }, 100);
            });
          }
          
          currentAudioRef.current.volume = 0;
          
          // Intentar reproducir una sola vez, como Timeline
          try {
            // En Chrome iOS, asegurar que el AudioContext esté resumido
            if (isChromeIOS && globalAudioContext && globalAudioContext.state === 'suspended') {
              try {
                await globalAudioContext.resume();
              } catch (resumeErr) {
                // Ignorar error de resume
              }
            }
            
            await currentAudioRef.current.play();
            console.log('[AudioContext] Audio reproducido exitosamente');
          } catch (playError) {
            console.warn('[AudioContext] Error en play():', playError);
            resolve();
            return;
          }
                    
          await new Promise(resolve => setTimeout(resolve, isIOS ? 100 : 50));
          
          volumeTweenRef.current = gsap.to(currentAudioRef.current, {
            volume: 1,
            duration: 2.5,
            ease: 'sine.out',
            onComplete: () => {
              volumeTweenRef.current = null;
              resolve();
            }
          });
        } catch (error) {
          console.error('[AudioContext] Error playing:', error);
          resolve();
        }
      } else {
        resolve();
      }
    });
  };

  const pause = () => {
    return new Promise((resolve) => {
      // SIMPLIFICACIÓN: Para un solo audio, usar pause() simple como Timeline
      if (useSimpleAudio && currentAudioRef.current) {
        try {
          console.log('[AudioContext] Pausando audio simple como Timeline');
          currentAudioRef.current.pause();
          setIsPlaying(false);
          resolve();
        } catch (error) {
          console.error('[AudioContext] Error pausando audio simple:', error);
          resolve();
        }
        return;
      }
      
      
      // PRIORIDAD 2: Usar elementos <audio> reales en iOS/Android (fallback)
      if (useMultipleElements && audioElementsRef.current.length > 0) {
        const audio = audioElementsRef.current[currentIndex];
        if (audio && !audio.paused) {
          if (volumeTweenRef.current) {
            volumeTweenRef.current.kill();
            volumeTweenRef.current = null;
          }
          
          volumeTweenRef.current = gsap.to(audio, {
            volume: 0,
            duration: 0.6,
            ease: 'power2.in',
            onComplete: () => {
              audio.pause();
              audio.volume = 0;
              volumeTweenRef.current = null;
              setIsPlaying(false);
              resolve();
            }
          });
          return;
        } else {
          resolve();
          return;
        }
      }
      
      // Fallback: Si estamos usando Howler.js en iOS/Android
      if (useMultipleElements && howlInstancesRef.current.length > 0) {
        const howl = howlInstancesRef.current[currentIndex];
        if (howl && howl.playing()) {
          // Fade out y pausar
          const soundId = howl.playing() ? howl._sounds[0]._id : null;
          if (soundId !== null) {
            howl.fade(howl.volume(soundId), 0, 600, soundId);
            setTimeout(() => {
              howl.pause(soundId);
              setIsPlaying(false);
              resolve();
            }, 600);
          } else {
            howl.stop();
            setIsPlaying(false);
            resolve();
          }
        } else {
          resolve();
        }
        return;
      }
      
      if (currentAudioRef.current && !currentAudioRef.current.paused) {
        console.log('[AudioContext] pause() llamado, iniciando fade out del volumen');
        if (volumeTweenRef.current) {
          volumeTweenRef.current.kill();
          volumeTweenRef.current = null;
        }
        
        const currentVolume = currentAudioRef.current.volume;
        console.log('[AudioContext] Volumen actual:', currentVolume);
        
        volumeTweenRef.current = gsap.to(currentAudioRef.current, {
          volume: 0,
          duration: 0.6,
          ease: 'power2.in',
          onComplete: () => {
            console.log('[AudioContext] Fade out del volumen completado');
            if (currentAudioRef.current) {
              currentAudioRef.current.pause();
              currentAudioRef.current.volume = 0;
            }
            volumeTweenRef.current = null;
            resolve();
          }
        });
      } else {
        console.log('[AudioContext] pause() llamado pero el audio ya está pausado o no existe');
        resolve();
      }
    });
  };

  const togglePlayPause = async () => {
    if (isPlaying) {
      await pause();
    } else {
      await play();
    }
  };

  // Función para cambiar a un audio específico de la playlist
  const seekToAudio = async (index, targetTime = 0, fromAutoFade = false) => {
    if (index < 0 || index >= validAudioSrcs.length) return;
    if (index === currentIndex && targetTime === 0 && !fromAutoFade) return; // Si es el mismo y no hay tiempo específico, no hacer nada
    
    // SIMPLIFICACIÓN: Para un solo audio, usar currentTime simple como Timeline
    if (useSimpleAudio && currentAudioRef.current) {
      try {
        console.log(`[AudioContext] Seek en audio simple: ${targetTime}s`);
        currentAudioRef.current.currentTime = targetTime;
      } catch (error) {
        console.error('[AudioContext] Error en seek de audio simple:', error);
      }
      return;
    }
    
    // PRIORIDAD 1: Fallback a Howler.js
    if (useMultipleElements && howlInstancesRef.current.length > 0) {
      const wasPlaying = isPlaying;
      const currentHowl = howlInstancesRef.current[currentIndex];
      
      // Detener el actual
      if (currentHowl && currentHowl.playing()) {
        currentHowl.stop();
      }
      
      // Cambiar al nuevo
      currentIndexRef.current = index;
      setCurrentIndex(index);
      
      const newHowl = howlInstancesRef.current[index];
      if (newHowl && wasPlaying) {
        const soundId = newHowl.play();
        if (targetTime > 0) {
          newHowl.seek(targetTime, soundId);
        }
        newHowl.volume(0, soundId);
        newHowl.fade(0, 1, 400, soundId);
        setIsPlaying(true);
      }
      return;
    }
    
    const audio = currentAudioRef.current;
    if (!audio) return;
    
    const wasPlaying = isPlaying && !audio.paused;
    
    if (index === currentIndex) {
      // Mismo audio, solo cambiar el tiempo
      if (audio.readyState >= 2) {
        audio.currentTime = targetTime;
      } else {
        // Esperar a que esté listo
        const setTimeWhenReady = () => {
          if (audio.readyState >= 2) {
            audio.currentTime = targetTime;
            audio.removeEventListener('canplay', setTimeWhenReady);
            audio.removeEventListener('loadedmetadata', setTimeWhenReady);
          }
        };
        audio.addEventListener('canplay', setTimeWhenReady);
        audio.addEventListener('loadedmetadata', setTimeWhenReady);
      }
      return;
    }
    
    // Cambiar de audio
    if (!audio.paused) {
      // Fade out breve del actual
      if (fadeOutTweenRef.current) {
        fadeOutTweenRef.current.kill();
      }
      
      fadeOutTweenRef.current = gsap.to(audio, {
        volume: 0,
        duration: 0.3, // Fade out breve
        ease: 'power2.in',
        onComplete: () => {
          audio.pause();
          audio.currentTime = 0;
          // Actualizar el ref ANTES de setCurrentIndex para que handleEnded use el valor correcto
          currentIndexRef.current = index;
          setCurrentIndex(index);
          fadeOutTweenRef.current = null;
          
          // Esperar a que el nuevo audio esté listo
          const waitAndPlay = () => {
            const newAudio = currentAudioRef.current;
            if (newAudio && newAudio.readyState >= 2) {
              if (targetTime > 0) {
                newAudio.currentTime = targetTime;
              }
              if (wasPlaying) {
                newAudio.play().then(() => {
                  newAudio.volume = 0;
                  fadeInTweenRef.current = gsap.to(newAudio, {
                    volume: 1,
                    duration: 0.4,
                    ease: 'power2.out',
                    onComplete: () => {
                      fadeInTweenRef.current = null;
                    }
                  });
                }).catch(err => console.warn('[AudioContext] Error playing after seek:', err));
              }
            } else {
              setTimeout(waitAndPlay, 50);
            }
          };
          
          setTimeout(waitAndPlay, 50);
        }
      });
    } else {
      // Si está pausado, cambiar directamente
      // Actualizar el ref ANTES de setCurrentIndex para que handleEnded use el valor correcto
      currentIndexRef.current = index;
      setCurrentIndex(index);
      if (targetTime > 0) {
        setTimeout(() => {
          const newAudio = currentAudioRef.current;
          if (newAudio && newAudio.readyState >= 2) {
            newAudio.currentTime = targetTime;
          }
        }, 100);
      }
    }
  };

  // Función para obtener el tiempo total de la playlist - usar useCallback para evitar recreaciones
  const getTotalDuration = React.useCallback(() => {
    // SIMPLIFICACIÓN: Para un solo audio, usar duration simple como Timeline
    if (useSimpleAudio && currentAudioRef.current) {
      const duration = currentAudioRef.current.duration || 0;
      return duration;
    }
    const total = audioDurations.reduce((sum, dur) => sum + dur, 0);
    return total;
  }, [audioDurations, useSimpleAudio]);

  // Función para obtener el tiempo transcurrido total - usar useCallback para evitar recreaciones
  const getTotalElapsed = React.useCallback(() => {
    // SIMPLIFICACIÓN: Para un solo audio, usar currentTime simple como Timeline
    if (useSimpleAudio && currentAudioRef.current) {
      const elapsed = currentAudioRef.current.currentTime || 0;
      return elapsed;
    }
    
    // PRIORIDAD 1: Fallback a Howler.js
    if (useMultipleElements && howlInstancesRef.current.length > 0) {
      const howl = howlInstancesRef.current[currentIndex];
      if (!howl || audioDurations.length === 0) return 0;
      
      const previousTime = audioDurations
        .slice(0, currentIndex)
        .reduce((sum, dur) => sum + dur, 0);
      
      return previousTime + (howl.seek() || 0);
    }
    
    // PRIORIDAD 3: Desktop - elementos audio normales
    if (!currentAudioRef.current || audioDurations.length === 0) return 0;
    
    const previousTime = audioDurations
      .slice(0, currentIndex)
      .reduce((sum, dur) => sum + dur, 0);
    
    const currentTime = currentAudioRef.current.currentTime || 0;
    const total = previousTime + currentTime;
    return total;
  }, [audioDurations, currentIndex, useSimpleAudio, useMultipleElements]);

  // Controles de teclado para audio
  useEffect(() => {
    if (!validAudioSrcs || validAudioSrcs.length === 0) return;

    const handleKeyDown = (e) => {
      // Ignorar si el usuario está escribiendo en un input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      const audio = currentAudioRef.current;
      if (!audio) return;

      switch (e.key) {
        case 'ArrowLeft': {
          e.preventDefault();
          // Retroceder 5 segundos
          if (audio.readyState >= 2 && audio.duration) {
            audio.currentTime = Math.max(0, audio.currentTime - 5);
          }
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          // Avanzar 5 segundos
          if (audio.readyState >= 2 && audio.duration) {
            audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          // Aumentar volumen (con suavidad usando GSAP)
          if (volumeTweenRef.current) {
            volumeTweenRef.current.kill();
          }
          const newVolume = Math.min(1, audio.volume + 0.1);
          volumeTweenRef.current = gsap.to(audio, {
            volume: newVolume,
            duration: 0.2,
            ease: 'power2.out',
            onComplete: () => {
              volumeTweenRef.current = null;
            }
          });
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          // Disminuir volumen (con suavidad usando GSAP)
          if (volumeTweenRef.current) {
            volumeTweenRef.current.kill();
          }
          const newVolume = Math.max(0, audio.volume - 0.1);
          volumeTweenRef.current = gsap.to(audio, {
            volume: newVolume,
            duration: 0.2,
            ease: 'power2.out',
            onComplete: () => {
              volumeTweenRef.current = null;
            }
          });
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [validAudioSrcs]);

  // Extraer propiedades del track
  const audios = validAudioSrcs;
  const guiones = track?.guionesBySubfolder || {};
  const guion = track?.guion || null;

  const value = {
    audioRef,
    audioContextRef,
    analyserRef,
    dataArrayRef,
    timeDataArrayRef,
    isPlaying,
    isInitialized,
    loadingProgress,
    isLoaded,
    play,
    pause,
    togglePlayPause,
    currentIndex,
    audioSrcs: validAudioSrcs,
    audios,
    guiones,
    guion,
    audioDurations,
    seekToAudio,
    getTotalDuration,
    getTotalElapsed
  };

  // Actualizar el ref de seekToAudio para que handleEnded pueda usarlo
  useEffect(() => {
    seekToAudioRef.current = seekToAudio;
  }, [seekToAudio]);

  // Determinar si debemos renderizar múltiples elementos audio
  // Chrome iOS también necesita múltiples elementos cuando hay múltiples audios
  const shouldRenderMultipleAudios = (isSafariIOS && validAudioSrcs.length > 1) || (isChromeIOS && validAudioSrcs.length > 1);
  
  return (
    <AudioContextReact.Provider value={value}>
      {children}
      {/* Renderizar elementos <audio> reales para móviles con múltiples audios */}
      {shouldRenderMultipleAudios && audioElementsRef.current.length > 0 ? (
        audioElementsRef.current.map((audio, index) => {
          // Asignar ref solo al elemento actual
          const audioRef = index === currentIndex ? currentAudioRef : null;
          return (
            <audio
              key={`audio-mobile-${index}`}
              ref={audioRef}
              crossOrigin="anonymous"
              playsInline
              className="audio-context"
              style={{ display: 'none' }}
            />
          );
        })
      ) : (
        <>
          {/* Desktop: elementos audio normales */}
          <audio
            ref={currentAudioRef}
            crossOrigin="anonymous"
            playsInline
            className="audio-context"
          />
          <audio
            ref={nextAudioRef}
            crossOrigin="anonymous"
            playsInline
            className="audio-context"
            style={{ display: 'none' }}
          />
        </>
      )}
    </AudioContextReact.Provider>
  );
};

