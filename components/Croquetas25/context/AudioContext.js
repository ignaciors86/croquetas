import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import './AudioContext.scss';

const AudioContextReact = createContext(null);

export const useAudio = () => {
  const context = useContext(AudioContextReact);
  if (!context) {
    throw new Error('useAudio must be used within AudioProvider');
  }
  return context;
};

const FADE_DURATION = 0.4;

// AudioContext global único
let globalAudioContext = null;
let globalSourceNode = null;
let globalAnalyser = null;
let connectedAudioElement = null;

export const AudioProvider = ({ children, track = null, audioSrcs = [] }) => {
  // Extraer audioSrcs del track si está disponible
  const audioSrcsFromTrack = React.useMemo(() => {
    if (track) {
      return track.srcs || (track.src ? [track.src] : []);
    }
    return [];
  }, [track]);

  const finalAudioSrcs = audioSrcsFromTrack.length > 0 ? audioSrcsFromTrack : audioSrcs;

  // Normalizar audioSrcs
  const validAudioSrcs = React.useMemo(() => {
    if (!finalAudioSrcs || !Array.isArray(finalAudioSrcs)) return [];
    
    return finalAudioSrcs
      .map(src => {
        if (typeof src === 'string') return src;
        if (src?.default) return src.default;
        return String(src);
      })
      .filter(src => typeof src === 'string' && src.length > 0 && 
               (src.includes('.mp3') || src.includes('.wav') || src.includes('.ogg')));
  }, [finalAudioSrcs]);

  // Estados
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [audioDurations, setAudioDurations] = useState([]);
  const [preloadedAudios, setPreloadedAudios] = useState(false);
  
  // Refs
  const audioElementsRef = useRef([]); // Array de elementos Audio (siempre usado, 1 o más)
  const currentAudioRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const timeDataArrayRef = useRef(null);
  const volumeTweenRef = useRef(null);
  const fadeOutTweenRef = useRef(null);
  const fadeInTweenRef = useRef(null);
  const preloadInProgressRef = useRef(false);

  const audioRef = currentAudioRef;

  // Función para configurar AudioContext (reconecta cuando cambia el audio)
  const setupAudioContext = async (audio) => {
    if (!audio) return;

    // Si ya está conectado, solo resumir si es necesario
    if (connectedAudioElement === audio && globalAudioContext && globalAnalyser) {
      if (globalAudioContext.state === 'suspended') {
        try {
          await globalAudioContext.resume();
        } catch (e) {}
      }
      audioContextRef.current = globalAudioContext;
      analyserRef.current = globalAnalyser;
      const bufferLength = globalAnalyser.frequencyBinCount;
      if (!dataArrayRef.current) dataArrayRef.current = new Uint8Array(bufferLength);
      if (!timeDataArrayRef.current) timeDataArrayRef.current = new Uint8Array(bufferLength);
      setIsInitialized(true);
      return;
    }

    // Desconectar audio anterior si es diferente
    if (globalAudioContext && connectedAudioElement && connectedAudioElement !== audio) {
      if (globalSourceNode) {
        try {
          globalSourceNode.disconnect();
        } catch (e) {}
      }
      globalSourceNode = null;
      connectedAudioElement = null;
    }

    // Crear AudioContext si no existe
    if (!globalAudioContext || globalAudioContext.state === 'closed') {
      globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Crear Analyser si no existe
    if (!globalAnalyser) {
      globalAnalyser = globalAudioContext.createAnalyser();
      globalAnalyser.fftSize = 2048;
      globalAnalyser.smoothingTimeConstant = 0.3;
    }

    // Conectar el audio al AudioContext
    if (connectedAudioElement !== audio) {
      try {
        globalSourceNode = globalAudioContext.createMediaElementSource(audio);
        connectedAudioElement = audio;
        globalSourceNode.connect(globalAnalyser);
        globalAnalyser.connect(globalAudioContext.destination);
      } catch (connectError) {
        if (connectError.name !== 'InvalidStateError') {
          throw connectError;
        }
      }
    }

    // Resumir AudioContext si está suspendido
    if (globalAudioContext.state === 'suspended') {
      try {
        await globalAudioContext.resume();
      } catch (e) {}
    }

    // Configurar refs
    audioContextRef.current = globalAudioContext;
    analyserRef.current = globalAnalyser;
    const bufferLength = globalAnalyser.frequencyBinCount;
    dataArrayRef.current = new Uint8Array(bufferLength);
    timeDataArrayRef.current = new Uint8Array(bufferLength);

    setIsInitialized(true);
  };

  // Inicializar todos los audios (uno o más, misma lógica)
  const initializeAllAudios = async (srcs) => {
    if (!srcs || srcs.length === 0) {
      setPreloadedAudios(true);
      setPreloadProgress(100);
      preloadInProgressRef.current = false;
      return;
    }
    
    if (preloadInProgressRef.current) return;
    if (audioElementsRef.current.length === srcs.length) return;

    // Limpiar audios anteriores
    audioElementsRef.current.forEach(audio => {
      if (audio) {
        audio.pause();
        audio.src = '';
        audio.load();
      }
    });
    audioElementsRef.current = [];
    
    setPreloadProgress(0);
    preloadInProgressRef.current = true;
    
    const durations = [];
    
    // Función para cargar un audio
    const loadAudio = async (i, audioSrc) => {
      let audioSrcString = typeof audioSrc === 'string' ? audioSrc : (audioSrc?.default || audioSrc);
      if (typeof audioSrcString !== 'string') audioSrcString = String(audioSrcString);

      if (!audioSrcString || !audioSrcString.includes('.')) return null;

      if (!audioSrcString.startsWith('http') && !audioSrcString.startsWith('data:')) {
        if (!audioSrcString.startsWith('/')) audioSrcString = '/' + audioSrcString;
      }
      
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = audioSrcString;
      audio.volume = 0;
      audio.pause();
      
      await new Promise((resolve) => {
        let resolved = false;
        const cleanup = () => {
          audio.removeEventListener('canplay', handleCanPlay);
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
        
        const handleLoadedData = () => {
          if (!resolved && audio.readyState >= 2) {
            resolved = true;
            cleanup();
            resolve();
          }
        };
        
        const handleLoadedMetadata = () => {
          if (!resolved && audio.readyState >= 1 && audio.duration && isFinite(audio.duration) && audio.duration > 0) {
            resolved = true;
            cleanup();
            durations[i] = audio.duration;
            resolve();
          }
        };
        
        const handleError = () => {
          if (!resolved) {
            resolved = true;
            cleanup();
            durations[i] = 0;
            resolve();
          }
        };
        
        audio.addEventListener('canplay', handleCanPlay);
        audio.addEventListener('loadeddata', handleLoadedData);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('error', handleError);
        
        try {
          audio.load();
        } catch (error) {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve();
          }
        }
      });
      
      return audio;
    };

    // Cargar todos los audios
    const loadPromises = [];
    for (let i = 0; i < srcs.length; i++) {
      loadPromises.push(
        loadAudio(i, srcs[i]).then(audio => {
          if (audio) {
            audioElementsRef.current[i] = audio;
            if (i === 0) {
              currentAudioRef.current = audio;
              if (durations[0] && durations[0] > 0) {
        setIsLoaded(true);
                setLoadingProgress(100);
              }
            }
            setPreloadProgress(Math.round(((i + 1) / srcs.length) * 100));
          }
        })
      );
    }

    await Promise.all(loadPromises);
    setAudioDurations(durations);
    setPreloadedAudios(true);
    preloadInProgressRef.current = false;
  };

  // Cargar duraciones e inicializar audios
  useEffect(() => {
    if (!validAudioSrcs || validAudioSrcs.length === 0) return;

    const loadDurations = async () => {
      const durations = [];
      for (let i = 0; i < validAudioSrcs.length; i++) {
        const src = validAudioSrcs[i];
        const srcString = typeof src === 'string' ? src : (src?.default || src);
        const audio = new Audio(srcString);
        try {
          await new Promise((resolve) => {
            const handleLoaded = () => {
              audio.removeEventListener('loadedmetadata', handleLoaded);
              durations[i] = audio.duration || 0;
                resolve();
            };
            audio.addEventListener('loadedmetadata', handleLoaded);
            audio.load();
          });
        } catch (error) {
          durations[i] = 0;
        }
      }
      setAudioDurations(durations);
    };

    loadDurations();

    // Inicializar todos los audios
    if (!preloadInProgressRef.current && audioElementsRef.current.length === 0) {
      initializeAllAudios(validAudioSrcs);
    }
  }, [validAudioSrcs]);

  // Actualizar currentAudioRef cuando cambia el índice
  useEffect(() => {
    if (audioElementsRef.current.length > 0 && audioElementsRef.current[currentIndex]) {
      currentAudioRef.current = audioElementsRef.current[currentIndex];
    }
  }, [currentIndex]);

  // Manejar evento ended
  useEffect(() => {
    const audio = currentAudioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      const audio = currentAudioRef.current;
      if (!audio || !audio.duration || audio.duration === 0 || isNaN(audio.duration)) return;
      if (audio.currentTime < audio.duration - 1) return;
      if (fadeOutTweenRef.current?.isActive()) return;
      
      setIsPlaying(false);
      const srcs = validAudioSrcs;
      const idx = currentIndex;
      const cycleCompleted = window.__imageCycleCompleted?.[idx] || false;
      
      if (!cycleCompleted && srcs?.length > 1) {
        window.dispatchEvent(new CustomEvent('audioSegmentEnded', { 
          detail: { currentIndex: idx, isLastAudio: idx === srcs.length - 1, wasPlaying: true, waitingForImageCycle: true } 
        }));
        return;
      }
      
      if (!srcs || srcs.length <= 1 || idx === srcs.length - 1) {
        window.dispatchEvent(new CustomEvent('audioSegmentEnded', { 
          detail: { currentIndex: idx, isLastAudio: true, wasPlaying: true } 
        }));
        return;
      }
      
      const nextIndex = idx + 1;
      window.dispatchEvent(new CustomEvent('audioSegmentEnded', { 
        detail: { currentIndex: idx, nextIndex, isLastAudio: false, wasPlaying: true } 
      }));

      seekToAudio(nextIndex, 0);
    };

    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [currentIndex, validAudioSrcs.length]);

  // play() - UNIFICADO para uno o múltiples audios
  const play = async () => {
    const audio = audioElementsRef.current[currentIndex] || audioElementsRef.current[0];
    if (!audio) return;

      currentAudioRef.current = audio;

    try {
      await setupAudioContext(audio);
          } catch (error) {
        return;
      }
      
    try {
          audio.volume = 0;
          await audio.play();
          setIsPlaying(true);
          
          if (volumeTweenRef.current) {
            volumeTweenRef.current.kill();
          }

          volumeTweenRef.current = gsap.to(audio, {
            volume: 1,
        duration: FADE_DURATION,
        ease: 'power2.out',
            onComplete: () => {
              volumeTweenRef.current = null;
            }
          });
        } catch (error) {
            setIsPlaying(false);
    }
  };

  // pause() - UNIFICADO
  const pause = () => {
    const audio = currentAudioRef.current;
    if (!audio || audio.paused) {
      return Promise.resolve();
    }

    if (volumeTweenRef.current) {
      volumeTweenRef.current.kill();
    }
    
    return new Promise((resolve) => {
      fadeOutTweenRef.current = gsap.to(audio, {
        volume: 0,
        duration: FADE_DURATION,
        ease: 'power2.in',
        onComplete: () => {
          audio.pause();
          fadeOutTweenRef.current = null;
          setIsPlaying(false);
          resolve();
        }
      });
    });
  };

  // seekToAudio() - UNIFICADO
  const seekToAudio = async (index, targetTime = 0) => {
    if (index < 0 || index >= validAudioSrcs.length) return;
    if (index === currentIndex && targetTime === 0) return;

    const wasPlaying = isPlaying || (currentAudioRef.current && !currentAudioRef.current.paused);
    const currentAudio = currentAudioRef.current;

    // Si es el mismo audio, solo cambiar tiempo
    if (index === currentIndex && currentAudio) {
      if (currentAudio.readyState >= 2) {
        currentAudio.currentTime = targetTime;
        }
        return;
      }
      
    // Cambiar a nuevo audio
    const newAudio = audioElementsRef.current[index];
    if (!newAudio) return;

    // Fade out del audio actual si estaba reproduciendo
    if (wasPlaying && currentAudio && !currentAudio.paused) {
      if (fadeOutTweenRef.current) {
        fadeOutTweenRef.current.kill();
      }

      await new Promise((resolve) => {
        fadeOutTweenRef.current = gsap.to(currentAudio, {
          volume: 0,
          duration: FADE_DURATION,
          ease: 'power2.in',
          onComplete: () => {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            fadeOutTweenRef.current = null;
            resolve();
          }
        });
      });
    } else if (currentAudio) {
      currentAudio.pause();
    }

    // Cambiar al nuevo audio
    currentAudioRef.current = newAudio;
      setCurrentIndex(index);
      
    // Esperar a que el nuevo audio esté listo
    if (newAudio.readyState < 2) {
      await new Promise((resolve) => {
        const handleReady = () => {
          newAudio.removeEventListener('canplay', handleReady);
          newAudio.removeEventListener('loadeddata', handleReady);
          resolve();
        };
        newAudio.addEventListener('canplay', handleReady);
        newAudio.addEventListener('loadeddata', handleReady);
        if (newAudio.readyState >= 2) resolve();
      });
    }

    // Configurar AudioContext para el nuevo audio
    try {
      await setupAudioContext(newAudio);
    } catch (err) {}

    // Establecer tiempo si es necesario
              if (targetTime > 0) {
                newAudio.currentTime = targetTime;
              }

    // Reproducir si estaba reproduciendo
              if (wasPlaying) {
      try {
                  newAudio.volume = 0;
        await newAudio.play();
        setIsPlaying(true);

        if (fadeInTweenRef.current) {
          fadeInTweenRef.current.kill();
        }

                  fadeInTweenRef.current = gsap.to(newAudio, {
                    volume: 1,
          duration: FADE_DURATION,
                    ease: 'power2.out',
                    onComplete: () => {
                      fadeInTweenRef.current = null;
                    }
                  });
      } catch (err) {
        setIsPlaying(false);
      }
    }
  };

  // Funciones auxiliares
  const getTotalDuration = () => {
    return audioDurations.reduce((sum, dur) => sum + dur, 0);
  };

  const getTotalElapsed = () => {
      const audio = currentAudioRef.current;
    if (!audio) return 0;
    let total = 0;
    for (let i = 0; i < currentIndex; i++) {
      total += audioDurations[i] || 0;
    }
    return total + (audio.currentTime || 0);
  };

  const value = {
    audioRef,
    analyserRef,
    dataArrayRef,
    timeDataArrayRef,
    isPlaying,
    isLoaded,
    loadingProgress,
    currentIndex,
    audioDurations,
    preloadedAudios,
    play,
    pause,
    seekToAudio,
    getTotalDuration,
    getTotalElapsed,
    setIsInitialized,
    isInitialized
  };
  
  return (
    <AudioContextReact.Provider value={value}>
      {children}
    </AudioContextReact.Provider>
  );
};

