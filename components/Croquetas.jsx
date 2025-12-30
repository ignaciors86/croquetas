'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { gsap } from 'gsap';
import './Croquetas.scss';
import Background from './Croquetas25/components/Background/Background';
import AudioAnalyzer from './Croquetas25/components/AudioAnalyzer/AudioAnalyzer';
import Seek from './Croquetas25/components/Seek/Seek';
import Intro from './Croquetas25/components/Intro/Intro';
import { useGallery } from './Croquetas25/components/Gallery/Gallery';
import { useTracks } from './Croquetas25/hooks/useTracks';
import Prompt from './Croquetas25/components/Prompt/Prompt';
import Croqueta from './Croquetas25/components/Croqueta/Croqueta';
import BackButton from './Croquetas25/components/BackButton/BackButton';
import KITTLoader from './Croquetas25/components/KITTLoader/KITTLoader';

const LoadingProgressHandler = ({ onTriggerCallbackRef, audioStarted, audioRef }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    if (!audioRef?.current) return;
    
    const audio = audioRef.current;
    const updateProgress = () => {
      if (audio.readyState >= 2) {
        setLoadingProgress(100);
        setIsLoaded(true);
      } else {
        setLoadingProgress((audio.readyState / 4) * 100);
      }
    };
    
    audio.addEventListener('canplay', updateProgress);
    audio.addEventListener('loadeddata', updateProgress);
    updateProgress();
    
    return () => {
      audio.removeEventListener('canplay', updateProgress);
      audio.removeEventListener('loadeddata', updateProgress);
    };
  }, [audioRef]);

  useEffect(() => {
    if (!audioStarted || !isLoaded || !onTriggerCallbackRef?.current) return;
    
    // Solo generar cuadros después de que el audio haya empezado y esté cargado
    // Este handler ya no genera cuadros durante el loading
  }, [loadingProgress, isLoaded, onTriggerCallbackRef, audioStarted]);

  return null;
};

const Croquetas = () => {
  const router = useRouter();
  const params = useParams();
  const trackId = params?.trackId ? decodeURIComponent(params.trackId) : null;
  const [audioStarted, setAudioStarted] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [isPausedByHold, setIsPausedByHold] = useState(false);
  const [showStartButton, setShowStartButton] = useState(false);
  const [wasSelectedFromIntro, setWasSelectedFromIntro] = useState(false);
  const [loadingFadedOut, setLoadingFadedOut] = useState(false);
  const wasPlayingBeforeHoldRef = useRef(false);
  const wasSelectedFromIntroRef = useRef(false);
  const startButtonRef = useRef(null);
  const triggerCallbackRef = useRef(null);
  const voiceCallbackRef = useRef(null);
  const lastSquareTimeRef = useRef(0);
  const minTimeBetweenSquares = 600;
  const typewriterInstanceRef = useRef(null);
  const audioRef = useRef(null);
  const audioFadeRef = useRef(null); // Segundo audio para crossfade
  const fadeAnimationRef = useRef(null); // Ref para cancelar animaciones de fade
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  // Refs compartidos para AudioAnalyzer que se pasan a Background y Prompt
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const [isAudioAnalyzerInitialized, setIsAudioAnalyzerInitialized] = useState(false);
  
  const { tracks, isLoading: tracksLoading } = useTracks();
  
  // Restaurar wasSelectedFromIntro desde sessionStorage al montar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('wasSelectedFromIntro');
      if (saved === 'true') {
        setWasSelectedFromIntro(true);
        wasSelectedFromIntroRef.current = true;
        // Limpiar después de leer
        sessionStorage.removeItem('wasSelectedFromIntro');
      }
    }
  }, []);

  // Seleccionar automáticamente el track cuando hay un trackId en la URL
  useEffect(() => {
    if (!trackId || tracksLoading || tracks.length === 0) return;
    
    const normalizedTrackId = trackId.toLowerCase().replace(/\s+/g, '-');
    const foundTrack = tracks.find(track => {
      const normalizedId = (track.id || track.name.toLowerCase().replace(/\s+/g, '-'));
      return normalizedId === normalizedTrackId;
    });
    
    // Solo seleccionar si el track encontrado es diferente al actual
    if (foundTrack && (!selectedTrack || selectedTrack.id !== foundTrack.id)) {
      console.log(`[Croquetas] Track encontrado desde URL: ${foundTrack.name}`);
      setSelectedTrack(foundTrack);
      // Preservar wasSelectedFromIntro si fue establecido desde el Intro
      // Solo establecerlo a false si no fue seleccionado desde el Intro (acceso directo a URL)
      if (!wasSelectedFromIntroRef.current && !wasSelectedFromIntro) {
        setWasSelectedFromIntro(false);
      } else if (wasSelectedFromIntroRef.current || wasSelectedFromIntro) {
        // Si el ref o el estado indican que fue seleccionado desde Intro, mantener el estado
        setWasSelectedFromIntro(true);
        wasSelectedFromIntroRef.current = true;
      }
    }
  }, [trackId, tracks, tracksLoading, selectedTrack, wasSelectedFromIntro]);
  
  // Callback para cuando se completa una subcarpeta - cambiar al siguiente audio
  const handleSubfolderComplete = useCallback((completedSubfolder) => {
    if (!selectedTrack || !selectedTrack.subfolderToAudioIndex) return;
    
    const audioIndex = selectedTrack.subfolderToAudioIndex[completedSubfolder];
    if (audioIndex === undefined) return; // Esta subcarpeta no tiene audio
    
    // Buscar siguiente subcarpeta con audio
    const subfolderOrder = selectedTrack.subfolderOrder || [];
    const currentSubfolderIndex = subfolderOrder.indexOf(completedSubfolder);
    
    if (currentSubfolderIndex === -1) return;
    
    let nextAudioIndex = null;
    for (let i = currentSubfolderIndex + 1; i < subfolderOrder.length; i++) {
      const nextSubfolder = subfolderOrder[i];
      const nextAudio = selectedTrack.subfolderToAudioIndex[nextSubfolder];
      if (nextAudio !== undefined) {
        nextAudioIndex = nextAudio;
        break;
      }
    }
    
    if (nextAudioIndex !== null && typeof window !== 'undefined' && window.__subfolderCompleteHandler) {
      window.__subfolderCompleteHandler(completedSubfolder, nextAudioIndex);
    }
  }, [selectedTrack]);
  
  // Ref para el callback de completado que puede pausar el audio
  const handleAllCompleteRef = useRef(null);
  
  // Callback para cuando se completa toda la colección - volver a Intro
  const handleAllComplete = useCallback(async () => {
    console.log('[Croquetas] Todas las subcarpetas completadas, volviendo a Intro');
    
    // Primero pausar el audio si está disponible
    if (audioRef?.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    
    // Luego detener todo y volver a la home
    setAudioStarted(false);
    setSelectedTrack(null);
    setShowStartButton(false);
    setWasSelectedFromIntro(false);
    wasSelectedFromIntroRef.current = false; // Resetear el ref también
    setLoadingFadedOut(false);
    
    // Navegar inmediatamente (igual que el botón de volver)
    console.log('[Croquetas] Navegando a /');
    router.push('/');
    console.log('[Croquetas] Navegación iniciada');
  }, [router]);
  
  // Handler simple para pausar audio
  useEffect(() => {
    handleAllCompleteRef.current = async () => {
      console.log('[AllCompleteHandler] Pausando audio antes de volver a home');
      if (audioRef?.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };
    
    return () => {
      handleAllCompleteRef.current = null;
    };
  }, []);
  
  const { isLoading: imagesLoading, preloadProgress: imagesProgress, seekToImagePosition } = useGallery(selectedTrack, handleSubfolderComplete, handleAllComplete);
  const audioSrcs = selectedTrack?.srcs || (selectedTrack?.src ? [selectedTrack.src] : []);
  const isDirectUri = !!trackId;
  const currentAudioSrc = audioSrcs[currentAudioIndex] || audioSrcs[0];
  
  // Función para hacer crossfade entre dos audios
  const performCrossfade = useCallback(async (oldAudio, newSrc, targetTime = 0) => {
    if (!oldAudio || !audioFadeRef.current) return;
    
    const newAudio = audioFadeRef.current;
    const wasPlaying = !oldAudio.paused;
    
    // Configurar el nuevo audio
    const audioSrcString = typeof newSrc === 'string' ? newSrc : (newSrc?.default || newSrc);
    let finalSrc = audioSrcString;
    if (!finalSrc.startsWith('http') && !finalSrc.startsWith('data:')) {
      if (!finalSrc.startsWith('/')) {
        finalSrc = '/' + finalSrc;
      }
    }
    
    newAudio.src = finalSrc;
    newAudio.volume = 0;
    newAudio.load();
    
    // Esperar a que el nuevo audio esté listo
    await new Promise((resolve) => {
      const handleCanPlay = () => {
        newAudio.removeEventListener('canplay', handleCanPlay);
        newAudio.removeEventListener('loadeddata', handleCanPlay);
        resolve();
      };
      newAudio.addEventListener('canplay', handleCanPlay);
      newAudio.addEventListener('loadeddata', handleCanPlay);
      
      // Si ya está listo, resolver inmediatamente
      if (newAudio.readyState >= 2) {
        resolve();
      }
    });
    
    // Establecer el tiempo objetivo después de que esté listo
    newAudio.currentTime = targetTime;
    
    // Iniciar el nuevo audio si estaba reproduciéndose
    if (wasPlaying) {
      try {
        await newAudio.play();
      } catch (e) {
        console.warn('[Crossfade] Error iniciando nuevo audio:', e);
      }
    }
    
    // Hacer crossfade de 5 segundos
    const crossfadeDuration = 5.0; // 5 segundos
    
    // Cancelar cualquier animación de fade anterior
    if (fadeAnimationRef.current) fadeAnimationRef.current.kill();
    
    // Animar el fade
    const fadeObj = { oldVol: oldAudio.volume, newVol: 0 };
    fadeAnimationRef.current = gsap.to(fadeObj, {
      oldVol: 0,
      newVol: 1.0,
      duration: crossfadeDuration,
      ease: 'power2.inOut',
      onUpdate: function() {
        if (oldAudio && !oldAudio.paused) {
          oldAudio.volume = fadeObj.oldVol;
        }
        if (newAudio && !newAudio.paused) {
          newAudio.volume = fadeObj.newVol;
        }
      },
      onComplete: () => {
        // Pausar y limpiar el audio viejo
        if (oldAudio) {
          oldAudio.pause();
          oldAudio.currentTime = 0;
          oldAudio.volume = 1.0; // Resetear volumen para próxima vez
        }
        
        // Copiar el estado del nuevo audio al principal
        if (audioRef.current && newAudio) {
          const wasNewAudioPlaying = !newAudio.paused;
          const newCurrentTime = newAudio.currentTime;
          const newVolume = newAudio.volume;
          
          audioRef.current.src = newAudio.src;
          audioRef.current.currentTime = newCurrentTime;
          audioRef.current.volume = newVolume;
          
          if (wasNewAudioPlaying) {
            audioRef.current.play().catch(() => {});
          }
        }
        
        // Resetear el audio de fade
        newAudio.pause();
        newAudio.currentTime = 0;
        newAudio.volume = 0;
        newAudio.src = '';
      }
    });
  }, []);
  
  // Configurar audio simple cuando cambia el track o el índice
  useEffect(() => {
    if (!currentAudioSrc || !audioRef.current) return;
    
    const audio = audioRef.current;
    const audioSrcString = typeof currentAudioSrc === 'string' ? currentAudioSrc : (currentAudioSrc?.default || currentAudioSrc);
    
    // Asegurar que la URL sea absoluta si es relativa
    let finalSrc = audioSrcString;
    if (!finalSrc.startsWith('http') && !finalSrc.startsWith('data:')) {
      if (!finalSrc.startsWith('/')) {
        finalSrc = '/' + finalSrc;
      }
    }
    
    // Si el src cambió, hacer crossfade si ya había un audio reproduciéndose
    if (audio.src !== finalSrc && audio.src && audio.src !== '' && !audio.paused) {
      // Hay un audio reproduciéndose, hacer crossfade
      performCrossfade(audio, finalSrc, 0);
      setIsLoaded(false);
      setLoadingProgress(0);
    } else if (audio.src !== finalSrc) {
      // No hay audio reproduciéndose, cambiar directamente
      audio.src = finalSrc;
      audio.volume = 1.0;
      audio.load();
      setIsLoaded(false);
      setLoadingProgress(0);
    }
    
    const handleCanPlay = () => {
      if (audio.readyState >= 2) {
        setIsLoaded(true);
        setLoadingProgress(100);
      }
    };
    
    const handleLoadedData = () => {
      if (audio.readyState >= 2) {
        setIsLoaded(true);
        setLoadingProgress(100);
      }
    };
    
    const handlePlay = () => {
      // Fade in al reproducir
      if (audio && audio.volume < 1.0) {
        if (fadeAnimationRef.current) fadeAnimationRef.current.kill();
        fadeAnimationRef.current = gsap.to({ value: audio.volume }, {
          value: 1.0,
          duration: 0.5,
          ease: 'power2.out',
          onUpdate: function() {
            if (audio) audio.volume = this.targets()[0].value;
          }
        });
      }
      setIsPlaying(true);
    };
    
    const handlePause = () => {
      // Fade out al pausar
      if (audio && audio.volume > 0) {
        if (fadeAnimationRef.current) fadeAnimationRef.current.kill();
        fadeAnimationRef.current = gsap.to({ value: audio.volume }, {
          value: 0,
          duration: 0.5,
          ease: 'power2.in',
          onUpdate: function() {
            if (audio) audio.volume = this.targets()[0].value;
          },
          onComplete: () => {
            if (audio) audio.pause();
          }
        });
      }
      setIsPlaying(false);
    };
    
    const handleEnded = () => {
      console.log(`[Croquetas] Audio ${currentAudioIndex} terminó`);
      const isLastAudio = currentAudioIndex === audioSrcs.length - 1;
      
      if (isLastAudio) {
        // Si es el último audio, no hacer nada - dejar que handleAllComplete se encargue
        // cuando terminen todas las imágenes del último tramo
        console.log('[Croquetas] Es el último audio, esperando a que terminen las imágenes');
      } else {
        // Si NO es el último audio, cambiar automáticamente al siguiente con crossfade
        console.log('[Croquetas] Cambiando automáticamente al siguiente audio con crossfade');
        const nextAudioIndex = currentAudioIndex + 1;
        const nextSrc = audioSrcs[nextAudioIndex];
        if (nextSrc && audio && !audio.paused) {
          performCrossfade(audio, nextSrc, 0).then(() => {
            setCurrentAudioIndex(nextAudioIndex);
          });
        } else {
          setCurrentAudioIndex(nextAudioIndex);
        }
      }
    };
    
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    
    return () => {
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('loadeddata', handleLoadedData);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentAudioSrc, currentAudioIndex, audioSrcs, performCrossfade]);
  
  // Logging para debug en producción
  useEffect(() => {
    if (selectedTrack && audioSrcs.length > 0) {
      console.log(`[Croquetas] Track seleccionado: ${selectedTrack.name}`);
      console.log(`[Croquetas] AudioSrcs:`, audioSrcs);
      audioSrcs.forEach((src, idx) => {
        console.log(`[Croquetas] Audio ${idx}: ${src} (tipo: ${typeof src})`);
      });
    }
  }, [selectedTrack, audioSrcs]);

  const handleTrackSelect = (track) => {
    setSelectedTrack(track);
    setAudioStarted(false);
    setShowStartButton(false);
    setWasSelectedFromIntro(true);
    wasSelectedFromIntroRef.current = true; // Marcar en el ref también
    // Guardar en sessionStorage para preservar durante la navegación
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('wasSelectedFromIntro', 'true');
    }
    setLoadingFadedOut(false);
    const trackIdForUrl = track.id || track.name.toLowerCase().replace(/\s+/g, '-');
    router.push(`/${trackIdForUrl}`);
  };

  const handleClick = async (e) => {
    if (!audioStarted && selectedTrack && showStartButton && startButtonRef.current) {
      // Detectar iOS (especialmente Chrome en iOS)
      if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const isChromeIOS = isIOS && /CriOS/.test(navigator.userAgent);
      const isSafariIOS = isIOS && !isChromeIOS;
      
      // En iOS, necesitamos iniciar el audio DIRECTAMENTE desde el click (no async)
      // iOS requiere que play() se llame sincrónicamente desde el evento de usuario
      if (isIOS || isChromeIOS || isSafariIOS) {
        // Intentar reproducir el audio directamente desde el elemento
        // Esto DEBE hacerse dentro del handler de click, no en un callback
        try {
          if (audioRef.current && audioRef.current.paused) {
            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
              playPromise.then(() => {
                console.log('[Croquetas] Audio iniciado directamente desde click en iOS');
                setIsPlaying(true);
              }).catch(playErr => {
                console.warn('[Croquetas] Error iniciando audio directamente:', playErr);
              });
            }
          }
        } catch (playErr) {
          console.warn('[Croquetas] Error iniciando audio directamente:', playErr);
        }
      }
      
      gsap.to(startButtonRef.current, {
        opacity: 0,
        scale: 0.8,
        duration: 0.5,
        ease: 'power2.in',
        onComplete: () => {
          setShowStartButton(false);
          setAudioStarted(true);
        }
      });
    }
  };

  const HoldToPauseHandler = ({ isPausedByHold, setIsPausedByHold, wasPlayingBeforeHoldRef, typewriterInstanceRef, audioRef, isPlaying, setIsPlaying }) => {
    const isPausingRef = useRef(false);
    const eventStartTimeRef = useRef(0);
    const isHoldRef = useRef(false);
    const holdTimeoutRef = useRef(null);

    const shouldIgnoreEvent = useCallback((e) => {
      return e.target.closest('.seek') ||
             e.target.closest('.croquetas25-start-croqueta') ||
             e.target.closest('.intro__button') ||
             e.target.closest('.croqueta') ||
             e.target.closest('.intro');
    }, []);

    const pauseEverything = useCallback(async () => {
      if (isPausingRef.current) return;
      isPausingRef.current = true;
      wasPlayingBeforeHoldRef.current = isPlaying;
      if (audioRef?.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
      
      if (typeof document === 'undefined' || typeof window === 'undefined') return;
      const introOverlay = document.querySelector('.intro');
      if (!introOverlay || window.getComputedStyle(introOverlay).opacity === '0' || introOverlay.style.display === 'none') {
        gsap.globalTimeline.pause();
      }
      if (typewriterInstanceRef?.current) typewriterInstanceRef.current.pause();
      setIsPausedByHold(true);
      isPausingRef.current = false;
    }, [isPlaying, audioRef, setIsPlaying, setIsPausedByHold, wasPlayingBeforeHoldRef, typewriterInstanceRef]);

    const resumeEverything = useCallback(() => {
      if (!isPausedByHold) return;
      gsap.globalTimeline.resume();
      if (typewriterInstanceRef?.current) typewriterInstanceRef.current.start();
      setIsPausedByHold(false);
      isPausingRef.current = false;
      if (wasPlayingBeforeHoldRef.current && audioRef?.current?.paused) {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
      wasPlayingBeforeHoldRef.current = false;
    }, [isPausedByHold, audioRef, setIsPlaying, setIsPausedByHold, wasPlayingBeforeHoldRef, typewriterInstanceRef]);

    const togglePauseResume = useCallback(async () => {
      if (audioRef?.current?.paused || isPausedByHold) {
        wasPlayingBeforeHoldRef.current = true;
        resumeEverything();
      } else {
        await pauseEverything();
      }
    }, [audioRef, isPausedByHold, pauseEverything, resumeEverything, wasPlayingBeforeHoldRef]);

    const handleStart = useCallback((e) => {
      if (shouldIgnoreEvent(e)) return;
      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
      eventStartTimeRef.current = Date.now();
      isHoldRef.current = false;
      holdTimeoutRef.current = setTimeout(() => {
        if (Date.now() - eventStartTimeRef.current >= 200) {
          isHoldRef.current = true;
          pauseEverything();
        }
        holdTimeoutRef.current = null;
      }, 200);
    }, [pauseEverything, shouldIgnoreEvent]);

    const handleEnd = useCallback((e) => {
      if (shouldIgnoreEvent(e)) return;
      const timeSinceStart = eventStartTimeRef.current > 0 ? Date.now() - eventStartTimeRef.current : 0;
      const wasHold = isHoldRef.current;
      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
      
      (wasHold || timeSinceStart >= 200) ? resumeEverything() : (timeSinceStart > 0 && timeSinceStart < 200 && togglePauseResume());
      
      eventStartTimeRef.current = 0;
      isHoldRef.current = false;
    }, [resumeEverything, togglePauseResume, shouldIgnoreEvent]);

    useEffect(() => {
      if (typeof document === 'undefined') return;
      const container = document.querySelector('.croquetas');
      if (!container) return;
      container.addEventListener('mousedown', handleStart);
      container.addEventListener('mouseup', handleEnd);
      container.addEventListener('mouseleave', handleEnd);
      container.addEventListener('touchstart', handleStart, { passive: true });
      container.addEventListener('touchend', handleEnd);
      container.addEventListener('touchcancel', handleEnd);
      return () => {
        container.removeEventListener('mousedown', handleStart);
        container.removeEventListener('mouseup', handleEnd);
        container.removeEventListener('mouseleave', handleEnd);
        container.removeEventListener('touchstart', handleStart);
        container.removeEventListener('touchend', handleEnd);
        container.removeEventListener('touchcancel', handleEnd);
      };
    }, [handleStart, handleEnd]);

    return null;
  };

  const lastDiagonalTimeRef = useRef(0);
  const minTimeBetweenDiagonals = 500; // 0.5 segundos - permitir más diagonales

  const triggerSquare = (type, data) => {
    if (!audioStarted) return;
    
    const timestamp = Date.now();
    const timeSinceLastSquare = timestamp - lastSquareTimeRef.current;
    if (timeSinceLastSquare >= minTimeBetweenSquares && triggerCallbackRef.current) {
      try {
        triggerCallbackRef.current(type, { timestamp, ...data });
        lastSquareTimeRef.current = timestamp;
      } catch (error) {
        console.error(`[Croquetas25] ${type} square callback ERROR:`, error.message);
      }
    }
  };

  const triggerDiagonal = (intensity, voiceEnergy = 0, type = '') => {
    const timestamp = Date.now();
    const timeSinceLastDiagonal = timestamp - lastDiagonalTimeRef.current;
    
    // Calcular tiempo mínimo dinámico basado en la intensidad
    // Intensidad alta (1.0) = 100ms mínimo, intensidad baja (0.0) = 2000ms mínimo
    // Esto permite más diagonales cuando la música es más intensa
    const dynamicMinTime = 100 + (1900 * (1 - intensity));
    
    if (timeSinceLastDiagonal >= dynamicMinTime && 
        voiceCallbackRef.current && 
        typeof voiceCallbackRef.current === 'function') {
      try {
        voiceCallbackRef.current(intensity, voiceEnergy);
        lastDiagonalTimeRef.current = timestamp;
      } catch (error) {
        console.error(`[Croquetas25] ${type} diagonal callback ERROR:`, error.message);
      }
    }
  };

  const handleBeat = (intensity = 0.5, shouldBeSolid = false) => {
    if (isPausedByHold || !audioStarted) return;
    triggerSquare('beat', { intensity, shouldBeSolid });
    triggerDiagonal(intensity, 0, 'beat');
  };

  const handleVoice = (intensity = 0.5, voiceEnergy = 0) => {
    if (isPausedByHold || !audioStarted) return;
    triggerDiagonal(intensity, voiceEnergy, 'voice');
    triggerSquare('voice', { intensity, voiceEnergy });
  };

  // Controles de teclado para audio - se manejan dentro de AudioProvider

  return (
    <div className="croquetas" onClick={handleClick}>
      {tracksLoading && (
        <div className="image-preloader">
          <div className="image-preloader__content">
            <div className="image-preloader__text">Cargando canciones...</div>
          </div>
        </div>
      )}
      
      {!tracksLoading && tracks.length > 0 && (
        <Intro 
          tracks={tracks} 
          onTrackSelect={handleTrackSelect}
          selectedTrackId={trackId ? trackId.toLowerCase().replace(/\s+/g, '-') : 'croquetas'}
          isDirectUri={isDirectUri}
          isVisible={!selectedTrack}
        />
      )}
      
      {/* Background siempre visible para mostrar diagonales */}
      {selectedTrack && audioSrcs.length > 0 ? (
        <>
          <BackgroundWrapper 
            onTriggerCallbackRef={audioStarted ? triggerCallbackRef : null} 
            onVoiceCallbackRef={audioStarted ? voiceCallbackRef : null}
            selectedTrack={audioStarted ? selectedTrack : null}
            showOnlyDiagonales={!audioStarted}
            onAllComplete={handleAllComplete}
            audioRef={audioRef}
            isPlaying={isPlaying}
            currentAudioIndex={audioStarted ? currentAudioIndex : null}
            analyserRef={analyserRef}
            dataArrayRef={dataArrayRef}
            isAudioAnalyzerInitialized={isAudioAnalyzerInitialized}
          />
          <UnifiedLoadingIndicator 
            imagesLoading={imagesLoading}
            imagesProgress={imagesProgress}
            isDirectUri={isDirectUri}
            audioStarted={audioStarted}
            showStartButton={showStartButton}
            loadingFadedOut={loadingFadedOut}
            setLoadingFadedOut={setLoadingFadedOut}
            setAudioStarted={setAudioStarted}
            selectedTrack={selectedTrack}
            audioRef={audioRef}
            isLoaded={isLoaded}
            loadingProgress={loadingProgress}
          />
          <UnifiedContentManager
            imagesLoading={imagesLoading}
            imagesProgress={imagesProgress}
            audioStarted={audioStarted}
            setAudioStarted={setAudioStarted}
            showStartButton={showStartButton}
            setShowStartButton={setShowStartButton}
            isDirectUri={isDirectUri}
            wasSelectedFromIntro={wasSelectedFromIntro}
            startButtonRef={startButtonRef}
            handleClick={handleClick}
            selectedTrack={selectedTrack}
            loadingFadedOut={loadingFadedOut}
            audioRef={audioRef}
            isLoaded={isLoaded}
          />
          <AudioStarter audioStarted={audioStarted} audioRef={audioRef} setIsPlaying={setIsPlaying} isLoaded={isLoaded} />
          <HoldToPauseHandler 
            isPausedByHold={isPausedByHold}
            setIsPausedByHold={setIsPausedByHold}
            wasPlayingBeforeHoldRef={wasPlayingBeforeHoldRef}
            typewriterInstanceRef={typewriterInstanceRef}
            audioRef={audioRef}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
          />
          <LoadingProgressHandler onTriggerCallbackRef={triggerCallbackRef} audioStarted={audioStarted} audioRef={audioRef} />
          {selectedTrack && audioSrcs.length > 0 && audioRef?.current && (
            <AudioAnalyzer 
              onBeat={handleBeat} 
              onVoice={handleVoice} 
              audioRef={audioRef} 
              currentAudioIndex={currentAudioIndex}
              analyserRef={analyserRef}
              dataArrayRef={dataArrayRef}
              setIsInitialized={setIsAudioAnalyzerInitialized}
            />
          )}
          <SeekWrapper selectedTrack={selectedTrack} audioRef={audioRef} currentAudioIndex={currentAudioIndex} audioSrcs={audioSrcs} setCurrentAudioIndex={setCurrentAudioIndex} />
          {audioStarted && selectedTrack && (
            <SubfolderAudioController selectedTrack={selectedTrack} audioRef={audioRef} currentAudioIndex={currentAudioIndex} setCurrentAudioIndex={setCurrentAudioIndex} audioSrcs={audioSrcs} />
          )}
          {audioStarted && (
            <GuionManager 
              selectedTrack={selectedTrack}
              typewriterInstanceRef={typewriterInstanceRef}
              isPausedByHold={isPausedByHold}
              audioRef={audioRef}
              currentAudioIndex={currentAudioIndex}
              analyserRef={analyserRef}
            />
          )}
          {/* Mostrar BackButton siempre si es URI directa (incluso antes de seleccionar track), o cuando audioStarted */}
          {isDirectUri || audioStarted ? (
            <BackButton 
              onBack={() => {
                if (audioRef?.current && !audioRef.current.paused) {
                  audioRef.current.pause();
                  setIsPlaying(false);
                }
                setAudioStarted(false);
                setSelectedTrack(null);
                setShowStartButton(false);
                setWasSelectedFromIntro(false);
                setLoadingFadedOut(false);
              }}
              audioRef={audioRef}
            />
          ) : null}
          <audio ref={audioRef} crossOrigin="anonymous" playsInline volume={1.0} style={{ display: 'none' }} />
          <audio ref={audioFadeRef} crossOrigin="anonymous" playsInline volume={0} style={{ display: 'none' }} />
        </>
      ) : (
        // Cuando no hay track seleccionado, mostrar solo diagonales
        <DiagonalesOnly />
      )}
    </div>
  );
};

const AudioStarter = ({ audioStarted, audioRef, setIsPlaying, isLoaded: externalIsLoaded }) => {
  const hasAttemptedPlayRef = useRef(false);
  const [internalIsLoaded, setInternalIsLoaded] = useState(false);

  useEffect(() => {
    if (!audioRef?.current) return;
    const audio = audioRef.current;
    
    const handleCanPlay = () => {
      if (audio.readyState >= 2) setInternalIsLoaded(true);
    };
    const handleLoadedData = () => {
      if (audio.readyState >= 2) setInternalIsLoaded(true);
    };
    
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('loadeddata', handleLoadedData);
    
    // Verificar estado inicial
    if (audio.readyState >= 2) {
      setInternalIsLoaded(true);
    }
    
    return () => {
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [audioRef]);

  // Usar el estado externo si está disponible, sino usar el interno
  const isLoaded = externalIsLoaded !== undefined ? externalIsLoaded : internalIsLoaded;

  useEffect(() => {
    if (!audioStarted) {
      hasAttemptedPlayRef.current = false;
      return;
    }

    if (!audioRef?.current) return;
    const audio = audioRef.current;
    
    const tryPlay = async () => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const minReadyState = isIOS ? 1 : 2;
      
      // Verificar si el audio está conectado a un AudioContext
      // Si está conectado, el audio DEBE pasar por el AudioContext para reproducirse
      const isConnectedToAudioContext = audio.__audioAnalyzerConnected || audio.__audioAnalyzerSourceNode;
      
      // Verificar readyState directamente
      if (audio.readyState >= minReadyState || isLoaded) {
        try {
          // Asegurar que el volumen esté al máximo
          audio.volume = 1.0;
          
          // Si el audio está conectado a un AudioContext, asegurarse de que el AudioContext esté resumido
          if (isConnectedToAudioContext) {
            const audioContext = audio.__audioAnalyzerContext;
            if (audioContext && audioContext.state === 'suspended') {
              await audioContext.resume();
              console.log('[AudioStarter] AudioContext resumido antes de reproducir');
            }
          }
          
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            await playPromise;
            setIsPlaying(true);
            console.log('[AudioStarter] Audio reproducido, readyState:', audio.readyState, 'volume:', audio.volume, 'paused:', audio.paused, 'currentTime:', audio.currentTime, 'connectedToAudioContext:', isConnectedToAudioContext);
          } else {
            setIsPlaying(true);
            console.log('[AudioStarter] Audio reproducido (sin promise), readyState:', audio.readyState);
          }
        } catch (error) {
          console.error('[AudioStarter] Error playing audio:', error);
          hasAttemptedPlayRef.current = false;
          // Reintentar después de un delay
          if (audioStarted) {
            setTimeout(tryPlay, 200);
          }
        }
      } else if (audioStarted) {
        // Esperar a que el audio esté listo
        console.log('[AudioStarter] Esperando a que el audio esté listo, readyState:', audio.readyState);
        setTimeout(tryPlay, 100);
      }
    };
    
    if (audioStarted && !hasAttemptedPlayRef.current) {
      hasAttemptedPlayRef.current = true;
      tryPlay();
    }
  }, [audioStarted, isLoaded, audioRef, setIsPlaying]);

  return null;
};

const UnifiedLoadingIndicator = ({ imagesLoading, imagesProgress, isDirectUri, audioStarted, loadingFadedOut, setLoadingFadedOut, setAudioStarted, selectedTrack, audioRef, isLoaded: audioLoaded, loadingProgress: audioProgress }) => {
  const loadingRef = useRef(null);
  const fadeoutStartedRef = useRef(false);
  const hasCheckedReadyRef = useRef(false);
  
  // Detectar móviles y navegadores
  const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isChromeIOS = isIOS && /CriOS/.test(navigator.userAgent);
  const isSafariIOS = isIOS && !isChromeIOS;
  const isMobile = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth <= 768)
  );
  
  // En móviles, ser más permisivo con readyState (iOS puede funcionar con readyState 1)
  // En Safari iOS especialmente, readyState 1 es suficiente para metadata
  const minReadyState = (isIOS || isSafariIOS) ? 1 : 2;
  const audioHasMetadata = audioRef?.current && audioRef.current.readyState >= minReadyState;
  
  // Solo requerir que las imágenes iniciales estén listas (no todas), y que el audio esté listo
  // En móviles, ser más permisivo con el progreso de imágenes
  const minImagesProgress = isMobile ? 10 : 20; // Menos imágenes iniciales en móviles
  const imagesReady = !imagesLoading && imagesProgress >= minImagesProgress;
  
  // En móviles, especialmente Chrome iOS, ser más permisivo con audioLoaded
  // Si el audio tiene metadata (readyState >= minReadyState), considerarlo listo
  const audioReady = isMobile 
    ? (audioLoaded || audioHasMetadata) 
    : (audioLoaded && audioHasMetadata);
  
  const everythingReady = imagesReady && audioReady;
  
  // Debug logging
  useEffect(() => {
    console.log('[UnifiedLoadingIndicator] Estado:', {
      imagesLoading,
      imagesProgress,
      audioLoaded,
      audioHasMetadata: audioRef?.current?.readyState >= minReadyState,
      audioReadyState: audioRef?.current?.readyState,
      audioProgress,
      everythingReady,
      isMobile,
      isIOS,
      isChromeIOS,
      isSafariIOS
    });
  }, [imagesLoading, imagesProgress, audioLoaded, audioProgress, everythingReady, audioRef, minReadyState, isMobile, isIOS, isChromeIOS, isSafariIOS]);
  
  useEffect(() => {
    if (selectedTrack) {
      fadeoutStartedRef.current = false;
      hasCheckedReadyRef.current = false;
      setLoadingFadedOut(false);
      if (loadingRef.current) {
        // Fade-in suave del loading cuando aparece
        // En móviles, asegurar que el loading sea visible inmediatamente
        gsap.set(loadingRef.current, { opacity: isMobile ? 1 : 0 });
        if (!isMobile) {
          gsap.to(loadingRef.current, {
            opacity: 1,
            duration: 0.6,
            ease: 'power2.out'
          });
        }
      }
    }
  }, [selectedTrack, setLoadingFadedOut, isMobile]);
  
  useEffect(() => {
    if (everythingReady && !fadeoutStartedRef.current && !hasCheckedReadyRef.current && loadingRef.current && !loadingFadedOut) {
      hasCheckedReadyRef.current = true;
      fadeoutStartedRef.current = true;
      
      // En móviles, dar un pequeño delay antes de hacer fade out para asegurar que todo esté listo
      const fadeOutDelay = isMobile ? 300 : 0;
      
      setTimeout(() => {
        gsap.to(loadingRef.current, {
          opacity: 0,
          duration: 0.8,
          ease: 'power2.out',
          onComplete: () => {
            setLoadingFadedOut(true);
          }
        });
      }, fadeOutDelay);
    }
  }, [everythingReady, loadingFadedOut, setLoadingFadedOut, isMobile]);
  
  // Timeout de seguridad: si el loading lleva mucho tiempo, forzar el fade out
  // Esto previene que el loading se quede atascado en móviles
  useEffect(() => {
    if (!selectedTrack || audioStarted || loadingFadedOut) return;
    
    const safetyTimeout = setTimeout(() => {
      // Si después de 10 segundos (móviles) o 15 segundos (desktop) no se ha completado
      // y tenemos al menos algo de progreso, forzar el fade out
      const maxWaitTime = isMobile ? 10000 : 15000;
      const minProgress = isMobile ? 30 : 50; // Mínimo progreso requerido
      
      if (loadingRef.current && !loadingFadedOut && !fadeoutStartedRef.current) {
        const currentProgress = Math.round((imagesProgress + audioProgress) / 2);
        if (currentProgress >= minProgress) {
          console.warn('[UnifiedLoadingIndicator] Timeout de seguridad: forzando fade out del loading y iniciando audio');
          hasCheckedReadyRef.current = true;
          fadeoutStartedRef.current = true;
          
          gsap.to(loadingRef.current, {
            opacity: 0,
            duration: 0.8,
            ease: 'power2.out',
            onComplete: () => {
              setLoadingFadedOut(true);
              // IMPORTANTE: Cuando el loading se quita por timeout, forzar el inicio del audio
              // Esto asegura que el audio se inicie incluso si everythingReady es false
              if (!audioStarted) {
                console.log('[UnifiedLoadingIndicator] Iniciando audio después de timeout de seguridad');
                setAudioStarted(true);
              }
            }
          });
        }
      }
    }, isMobile ? 10000 : 15000);
    
    return () => clearTimeout(safetyTimeout);
  }, [selectedTrack, audioStarted, loadingFadedOut, imagesProgress, audioProgress, isMobile, setLoadingFadedOut, setAudioStarted]);
  
  // En móviles, especialmente Chrome iOS, asegurar que el loading siempre se muestre
  // incluso si everythingReady es false inicialmente
  if (audioStarted || loadingFadedOut) {
    return null;
  }
  
  const combinedProgress = everythingReady ? 100 : Math.round((imagesProgress + audioProgress) / 2);
  const showFast = combinedProgress >= 95;
  
  // En móviles, asegurar que el loading tenga al menos un progreso mínimo visible
  const displayProgress = isMobile && combinedProgress === 0 ? 5 : combinedProgress;
  
  return (
    <div className="image-preloader" ref={loadingRef}>
      <div className="image-preloader__content">
        <KITTLoader fast={showFast} progress={displayProgress} />
      </div>
    </div>
  );
};

const UnifiedContentManager = ({ 
  imagesLoading, 
  imagesProgress, 
  audioStarted, 
  setAudioStarted,
  showStartButton,
  setShowStartButton,
  isDirectUri,
  wasSelectedFromIntro,
  startButtonRef,
  handleClick,
  selectedTrack,
  loadingFadedOut,
  audioRef,
  isLoaded
}) => {
  const buttonRef = useRef(null);
  const buttonAnimationStartedRef = useRef(false);
  
  // Detectar móviles y navegadores
  const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isChromeIOS = isIOS && /CriOS/.test(navigator.userAgent);
  const isSafariIOS = isIOS && !isChromeIOS;
  const isMobile = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth <= 768)
  );
  
  // En móviles, ser más permisivo con readyState
  const minReadyState = (isIOS || isSafariIOS) ? 1 : 2;
  const audioHasMetadata = audioRef?.current && audioRef.current.readyState >= minReadyState;
  
  // Solo requerir que las imágenes iniciales estén listas (no todas), y que el audio esté listo
  // En móviles, ser más permisivo con el progreso de imágenes
  const minImagesProgress = isMobile ? 10 : 20;
  const imagesReady = !imagesLoading && imagesProgress >= minImagesProgress;
  
  // En móviles, especialmente Chrome iOS, ser más permisivo con audioLoaded
  const audioReady = isMobile 
    ? (isLoaded || audioHasMetadata) 
    : (isLoaded && audioHasMetadata);
  
  const everythingReady = imagesReady && audioReady;
  
  useEffect(() => {
    if (!everythingReady || !loadingFadedOut) return;
    
    if (isDirectUri && !wasSelectedFromIntro) {
      if (!showStartButton && !audioStarted) {
        setShowStartButton(true);
      }
    } else {
      if (showStartButton) {
        setShowStartButton(false);
      }
      if (!audioStarted && everythingReady && loadingFadedOut) {
        setAudioStarted(true);
      }
    }
  }, [everythingReady, loadingFadedOut, isDirectUri, showStartButton, audioStarted, wasSelectedFromIntro, setShowStartButton, setAudioStarted]);
  
  useEffect(() => {
    if (isDirectUri && !wasSelectedFromIntro && everythingReady && loadingFadedOut && showStartButton && !audioStarted) {
      if (!buttonAnimationStartedRef.current && buttonRef.current) {
        buttonAnimationStartedRef.current = true;
        gsap.fromTo(buttonRef.current, 
          { opacity: 0, scale: 0.8 },
          { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)' }
        );
      }
    } else {
      buttonAnimationStartedRef.current = false;
    }
  }, [isDirectUri, wasSelectedFromIntro, everythingReady, loadingFadedOut, showStartButton, audioStarted]);
  
  useEffect(() => {
    buttonAnimationStartedRef.current = false;
  }, [selectedTrack]);
  
  if (!(isDirectUri && !wasSelectedFromIntro && everythingReady && loadingFadedOut && showStartButton && !audioStarted)) {
    return null;
  }
  
  return (
    <div 
      className="croquetas-start-croqueta" 
      ref={(el) => {
        startButtonRef.current = el;
        buttonRef.current = el;
      }}
      onClick={handleClick}
    >
      <Croqueta
        index={selectedTrack ? 0 : 999}
        text={selectedTrack?.name || "Comenzar"}
        onClick={handleClick}
        rotation={0}
        className="croquetas-start-croqueta__button"
      />
    </div>
  );
};

const BackgroundWrapper = ({ onTriggerCallbackRef, onVoiceCallbackRef, selectedTrack, showOnlyDiagonales = false, onAllComplete, audioRef, isPlaying, currentAudioIndex, analyserRef, dataArrayRef, isAudioAnalyzerInitialized }) => {
  return (
    <Background 
      onTriggerCallbackRef={showOnlyDiagonales ? null : onTriggerCallbackRef} 
      onVoiceCallbackRef={showOnlyDiagonales ? null : onVoiceCallbackRef}
      analyserRef={showOnlyDiagonales ? null : analyserRef}
      dataArrayRef={showOnlyDiagonales ? null : dataArrayRef}
      isInitialized={showOnlyDiagonales ? false : isAudioAnalyzerInitialized}
      selectedTrack={showOnlyDiagonales ? null : selectedTrack}
      showOnlyDiagonales={showOnlyDiagonales}
      currentAudioIndex={showOnlyDiagonales ? null : currentAudioIndex}
      onAllComplete={onAllComplete}
      pause={showOnlyDiagonales ? null : (() => {
        if (audioRef?.current) {
          audioRef.current.pause();
        }
      })}
    />
  );
};

// Componente para mostrar solo diagonales sin necesidad de AudioProvider
const DiagonalesOnly = () => {
  return (
    <Background 
      onTriggerCallbackRef={null}
      onVoiceCallbackRef={null}
      analyserRef={null}
      dataArrayRef={null}
      isInitialized={false}
      selectedTrack={null}
      showOnlyDiagonales={true}
    />
  );
};

const SeekWrapper = ({ selectedTrack, audioRef, currentAudioIndex, audioSrcs, setCurrentAudioIndex }) => {
  const [squares, setSquares] = useState([]);
  const { seekToImagePosition } = useGallery(selectedTrack, null, null, null);
  
  useEffect(() => {
    const updateSquares = () => {
      const squareElements = document.querySelectorAll('[data-square-id]');
      setSquares(Array.from(squareElements).map(el => ({
        gradient: {
          color1: el.style.getPropertyValue('--square-color-1') || '#00ffff',
          color2: el.style.getPropertyValue('--square-color-2') || '#00ffff'
        }
      })));
    };
    
    const interval = setInterval(updateSquares, 100);
    return () => clearInterval(interval);
  }, []);
  
  return <Seek squares={squares} seekToImagePosition={seekToImagePosition} selectedTrack={selectedTrack} audioRef={audioRef} currentAudioIndex={currentAudioIndex} audioSrcs={audioSrcs} setCurrentAudioIndex={setCurrentAudioIndex} />;
};

// Componente para gestionar el guión según la subcarpeta actual
// Componente para controlar el cambio de audio cuando se completa una subcarpeta
const SubfolderAudioController = ({ selectedTrack, audioRef, currentAudioIndex, setCurrentAudioIndex, audioSrcs }) => {
  const completedSubfoldersRef = useRef(new Set());

  useEffect(() => {
    if (!selectedTrack || !selectedTrack.subfolderToAudioIndex) return;
    
    completedSubfoldersRef.current.clear();
    
    window.__subfolderCompleteHandler = (completedSubfolder, nextAudioIndex) => {
      if (completedSubfoldersRef.current.has(completedSubfolder)) {
        console.log(`[SubfolderAudioController] Subcarpeta ${completedSubfolder} ya procesada`);
        return;
      }
      
      if (nextAudioIndex !== null && currentAudioIndex !== nextAudioIndex && nextAudioIndex < audioSrcs.length) {
        completedSubfoldersRef.current.add(completedSubfolder);
        console.log(`[SubfolderAudioController] Cambiando de audio ${currentAudioIndex} a ${nextAudioIndex}`);
        setCurrentAudioIndex(nextAudioIndex);
        if (audioRef?.current) {
          const nextSrc = audioSrcs[nextAudioIndex];
          const nextSrcString = typeof nextSrc === 'string' ? nextSrc : (nextSrc?.default || nextSrc);
          let finalSrc = nextSrcString;
          if (!finalSrc.startsWith('http') && !finalSrc.startsWith('data:')) {
            if (!finalSrc.startsWith('/')) finalSrc = '/' + finalSrc;
          }
          audioRef.current.src = finalSrc;
          audioRef.current.load();
          audioRef.current.play().catch(() => {});
        }
      } else {
        completedSubfoldersRef.current.add(completedSubfolder);
        console.log(`[SubfolderAudioController] No hay siguiente audio o ya estamos en el correcto`);
      }
    };
    
    return () => {
      window.__subfolderCompleteHandler = null;
    };
  }, [selectedTrack, currentAudioIndex, setCurrentAudioIndex, audioSrcs, audioRef]);

  return null;
};

const GuionManager = ({ selectedTrack, typewriterInstanceRef, isPausedByHold, audioRef, currentAudioIndex, analyserRef }) => {
  const [currentSubfolder, setCurrentSubfolder] = useState(null);
  const [loadedGuiones, setLoadedGuiones] = useState({});
  const [currentGuion, setCurrentGuion] = useState(null);
  
  // Rastrear la subcarpeta actual basándose en el audio que está sonando
  useEffect(() => {
    if (!selectedTrack || !selectedTrack.subfolderToAudioIndex || !selectedTrack.subfolderOrder) return;
    
    const subfolderOrder = selectedTrack.subfolderOrder || [];
    let foundSubfolder = null;
    
    // Buscar la subcarpeta que tiene el audio actual
    for (const subfolder of subfolderOrder) {
      const audioIndex = selectedTrack.subfolderToAudioIndex[subfolder];
      if (audioIndex === currentAudioIndex) {
        foundSubfolder = subfolder;
        break;
      }
    }
    
    // Si no encontramos una subcarpeta con el audio actual, usar la primera o __root__
    if (!foundSubfolder && subfolderOrder.length > 0) {
      foundSubfolder = subfolderOrder[0];
    }
    
    setCurrentSubfolder(foundSubfolder);
  }, [selectedTrack, currentAudioIndex]);
  
  // Cargar guiones dinámicamente
  useEffect(() => {
    if (!selectedTrack || !selectedTrack.guionesBySubfolder) {
      setCurrentGuion(null);
      return;
    }
    
    const loadGuion = async (guionPath) => {
      if (!guionPath) return null;
      
      // Si ya está cargado, devolverlo
      if (loadedGuiones[guionPath]) {
        return loadedGuiones[guionPath];
      }
      
      try {
        // Usar fetch para cargar el archivo .js desde public
        const response = await fetch(guionPath);
        if (!response.ok) {
          throw new Error(`Failed to load guion: ${response.status}`);
        }
        
        const jsContent = await response.text();
        
        // Extraer el objeto exportado del archivo JS
        // Los archivos tienen formato: export default { textos: [...] }
        // Necesitamos extraer el objeto
        let guionData = null;
        
        // Intentar extraer el objeto del export default
        const exportMatch = jsContent.match(/export\s+default\s+({[\s\S]*?});?\s*$/m);
        if (exportMatch) {
          try {
            // Usar Function constructor para evaluar de forma más segura
            const objStr = exportMatch[1];
            guionData = new Function('return ' + objStr)();
          } catch (e) {
            console.warn(`[GuionManager] Error parseando objeto de ${guionPath}:`, e);
          }
        }
        
        // Si no funcionó, intentar buscar el objeto directamente
        if (!guionData) {
          const objMatch = jsContent.match(/{[\s\S]*textos[\s\S]*}/);
          if (objMatch) {
            try {
              guionData = new Function('return ' + objMatch[0])();
            } catch (e) {
              console.warn(`[GuionManager] Error parseando objeto alternativo de ${guionPath}:`, e);
            }
          }
        }
        
        if (guionData && guionData.textos && Array.isArray(guionData.textos)) {
          setLoadedGuiones(prev => ({ ...prev, [guionPath]: guionData }));
          return guionData;
        }
      } catch (error) {
        console.warn(`[GuionManager] Error cargando guión ${guionPath}:`, error);
      }
      
      return null;
    };
    
    const determineAndLoadGuion = async () => {
      // Priorizar guión de la raíz
      const rootGuionPaths = selectedTrack.guionesBySubfolder['__root__'];
      if (rootGuionPaths && Array.isArray(rootGuionPaths) && rootGuionPaths.length > 0) {
        const rootGuion = await loadGuion(rootGuionPaths[0]);
        if (rootGuion && rootGuion.textos) {
          setCurrentGuion(rootGuion);
          return;
        }
      }
      
      // Si no hay guión en la raíz, usar el de la subcarpeta actual
      if (currentSubfolder) {
        const subfolderGuionPaths = selectedTrack.guionesBySubfolder[currentSubfolder];
        if (subfolderGuionPaths && Array.isArray(subfolderGuionPaths) && subfolderGuionPaths.length > 0) {
          const subfolderGuion = await loadGuion(subfolderGuionPaths[0]);
          if (subfolderGuion && subfolderGuion.textos) {
            setCurrentGuion(subfolderGuion);
            return;
          }
        }
      }
      
      // Fallback al guión general del track
      if (selectedTrack.guion) {
        const fallbackGuion = await loadGuion(selectedTrack.guion);
        if (fallbackGuion && fallbackGuion.textos) {
          setCurrentGuion(fallbackGuion);
          return;
        }
      }
      
      setCurrentGuion(null);
    };
    
    determineAndLoadGuion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrack, currentSubfolder]);
  
  // Debug logging
  useEffect(() => {
    console.log('[GuionManager] Estado:', {
      selectedTrack: selectedTrack?.name,
      currentSubfolder,
      currentGuion: currentGuion ? {
        hasTextos: !!currentGuion.textos,
        textosLength: currentGuion.textos?.length
      } : null,
      currentAudioIndex,
      guionesBySubfolder: selectedTrack?.guionesBySubfolder
    });
  }, [selectedTrack, currentSubfolder, currentGuion, currentAudioIndex]);
  
  if (!currentGuion || !currentGuion.textos) {
    console.log('[GuionManager] No hay guión o textos, retornando null');
    return null;
  }
  
  return (
    <PromptWrapper 
      textos={currentGuion.textos} 
      typewriterInstanceRef={typewriterInstanceRef} 
      isPausedByHold={isPausedByHold}
      audioRef={audioRef}
      analyserRef={analyserRef}
    />
  );
};

const PromptWrapper = ({ textos, typewriterInstanceRef, isPausedByHold, audioRef, analyserRef }) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Debug logging
  useEffect(() => {
    console.log('[PromptWrapper] Estado:', {
      textosLength: textos?.length,
      textos: textos,
      currentTime,
      duration,
      hasAudioRef: !!audioRef?.current,
      hasAnalyserRef: !!analyserRef?.current,
      isPausedByHold
    });
  }, [textos, currentTime, duration, audioRef, analyserRef, isPausedByHold]);
  
  useEffect(() => {
    if (!audioRef?.current) {
      console.log('[PromptWrapper] No audioRef.current, skipping time updates');
      return;
    }
    
    const audio = audioRef.current;
    const updateTime = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) setDuration(audio.duration);
    };
    
    // Actualizar inmediatamente si ya hay duración
    if (audio.duration) {
      setDuration(audio.duration);
    }
    if (audio.readyState >= 2) {
      setCurrentTime(audio.currentTime);
    }
    
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration) setDuration(audio.duration);
    });
    audio.addEventListener('durationchange', () => {
      if (audio.duration) setDuration(audio.duration);
    });
    
    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', () => {});
      audio.removeEventListener('durationchange', () => {});
    };
  }, [audioRef]);
  
  return (
    <Prompt 
      textos={textos} 
      currentTime={currentTime}
      duration={duration}
      typewriterInstanceRef={typewriterInstanceRef}
      isPaused={isPausedByHold}
      analyser={analyserRef?.current || null}
    />
  );
};

export default Croquetas;
