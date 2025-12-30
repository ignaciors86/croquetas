import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import './Croquetas25.scss';
import Background from './components/Background/Background';
import AudioAnalyzer from './components/AudioAnalyzer/AudioAnalyzer';
import Seek from './components/Seek/Seek';
import Intro from './components/Intro/Intro';
import { AudioProvider, useAudio } from './context/AudioContext';
import { useGallery } from './components/Gallery/Gallery';
import { useTracks } from './hooks/useTracks';
import Prompt from './components/Prompt/Prompt';
import Croqueta from './components/Croqueta/Croqueta';
import BackButton from './components/BackButton/BackButton';
import KITTLoader from './components/KITTLoader/KITTLoader';

const LoadingProgressHandler = ({ onTriggerCallbackRef, audioStarted }) => {
  const { loadingProgress, isLoaded } = useAudio();

  useEffect(() => {
    if (!audioStarted || !isLoaded || !onTriggerCallbackRef?.current) return;
    
    // Solo generar cuadros después de que el audio haya empezado y esté cargado
    // Este handler ya no genera cuadros durante el loading
  }, [loadingProgress, isLoaded, onTriggerCallbackRef, audioStarted]);

  return null;
};

const Croquetas25 = () => {
  const { trackId } = useParams();
  const navigate = useNavigate();
  const [audioStarted, setAudioStarted] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [isPausedByHold, setIsPausedByHold] = useState(false);
  const [showStartButton, setShowStartButton] = useState(false);
  const [wasSelectedFromIntro, setWasSelectedFromIntro] = useState(false);
  const [loadingFadedOut, setLoadingFadedOut] = useState(false);
  const wasPlayingBeforeHoldRef = useRef(false);
  const startButtonRef = useRef(null);
  const triggerCallbackRef = useRef(null);
  const voiceCallbackRef = useRef(null);
  const lastSquareTimeRef = useRef(0);
  const minTimeBetweenSquares = 600;
  const typewriterInstanceRef = useRef(null);
  
  const { tracks, isLoading: tracksLoading } = useTracks();
  
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
    console.log('[Croquetas25] Todas las subcarpetas completadas, volviendo a Intro');
    
    // Primero pausar el audio si está disponible
    if (handleAllCompleteRef.current) {
      await handleAllCompleteRef.current();
    }
    
    // Luego detener todo y volver a la home
    setAudioStarted(false);
    setSelectedTrack(null);
    setShowStartButton(false);
    setWasSelectedFromIntro(false);
    setLoadingFadedOut(false);
    
    // Navegar inmediatamente (igual que el botón de volver)
    console.log('[Croquetas25] Navegando a /nachitos-de-nochevieja');
    navigate('/nachitos-de-nochevieja', { replace: true });
    console.log('[Croquetas25] Navegación iniciada');
  }, [navigate]);
  
  // Componente que maneja el completado dentro de AudioProvider para poder pausar el audio
  const AllCompleteHandler = () => {
    const { pause } = useAudio();
    
    useEffect(() => {
      handleAllCompleteRef.current = async () => {
        console.log('[AllCompleteHandler] Pausando audio antes de volver a home');
        try {
          await pause();
        } catch (error) {
          console.warn('[AllCompleteHandler] Error pausando audio:', error);
        }
      };
      
      return () => {
        handleAllCompleteRef.current = null;
      };
    }, [pause]);
    
    return null;
  };
  
  const { isLoading: imagesLoading, preloadProgress: imagesProgress, seekToImagePosition } = useGallery(selectedTrack, handleSubfolderComplete, handleAllComplete);
  const audioSrcs = selectedTrack?.srcs || (selectedTrack?.src ? [selectedTrack.src] : []);
  const isDirectUri = !!trackId;
  
  // Logging para debug en producción
  useEffect(() => {
    if (selectedTrack && audioSrcs.length > 0) {
      console.log(`[Croquetas25] Track seleccionado: ${selectedTrack.name}`);
      console.log(`[Croquetas25] AudioSrcs:`, audioSrcs);
      audioSrcs.forEach((src, idx) => {
        console.log(`[Croquetas25] Audio ${idx}: ${src} (tipo: ${typeof src})`);
      });
    }
  }, [selectedTrack, audioSrcs]);

  const handleTrackSelect = (track) => {
    setSelectedTrack(track);
    setAudioStarted(false);
    setShowStartButton(false);
    setWasSelectedFromIntro(true);
    setLoadingFadedOut(false);
    const trackIdForUrl = track.id || track.name.toLowerCase().replace(/\s+/g, '-');
    navigate(`/nachitos-de-nochevieja/${trackIdForUrl}`, { replace: true });
  };

  const handleClick = async (e) => {
    if (!audioStarted && selectedTrack && showStartButton && startButtonRef.current) {
      // Detectar iOS (especialmente Chrome en iOS)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const isChromeIOS = isIOS && /CriOS/.test(navigator.userAgent);
      const isSafariIOS = isIOS && !isChromeIOS;
      
      // En iOS, necesitamos iniciar el audio DIRECTAMENTE desde el click (no async)
      // iOS requiere que play() se llame sincrónicamente desde el evento de usuario
      if (isIOS || isChromeIOS || isSafariIOS) {
        // Obtener el contexto de audio si está disponible
        const audioContext = window.__globalAudioContext;
        if (audioContext && audioContext.state === 'suspended') {
          // Resumir AudioContext - debe ser dentro del evento de usuario
          audioContext.resume().then(() => {
            console.log('[Croquetas25] AudioContext resumido desde click del usuario');
          }).catch(err => {
            console.warn('[Croquetas25] Error resumiendo AudioContext:', err);
          });
        }
        
        // Intentar reproducir el audio directamente desde el elemento
        // Esto DEBE hacerse dentro del handler de click, no en un callback
        try {
          const audioElement = document.querySelector('.audio-context');
          if (audioElement) {
            // En iOS, incluso con readyState bajo, intentar reproducir
            // El navegador cargará el audio si es necesario
            if (audioElement.paused) {
              const playPromise = audioElement.play();
              if (playPromise !== undefined) {
                playPromise.then(() => {
                  console.log('[Croquetas25] Audio iniciado directamente desde click en iOS');
                }).catch(playErr => {
                  console.warn('[Croquetas25] Error iniciando audio directamente:', playErr);
                });
              }
            }
          }
        } catch (playErr) {
          console.warn('[Croquetas25] Error iniciando audio directamente:', playErr);
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

  const HoldToPauseHandler = ({ isPausedByHold, setIsPausedByHold, wasPlayingBeforeHoldRef, typewriterInstanceRef }) => {
    const { audioRef, isPlaying, pause, play } = useAudio();
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
      if (audioRef?.current && !audioRef.current.paused) await pause();
      
      const introOverlay = document.querySelector('.intro');
      if (!introOverlay || window.getComputedStyle(introOverlay).opacity === '0' || introOverlay.style.display === 'none') {
        gsap.globalTimeline.pause();
      }
      if (typewriterInstanceRef?.current) typewriterInstanceRef.current.pause();
      setIsPausedByHold(true);
      isPausingRef.current = false;
    }, [isPlaying, audioRef, pause, setIsPausedByHold, wasPlayingBeforeHoldRef, typewriterInstanceRef]);

    const resumeEverything = useCallback(() => {
      if (!isPausedByHold) return;
      gsap.globalTimeline.resume();
      if (typewriterInstanceRef?.current) typewriterInstanceRef.current.start();
      setIsPausedByHold(false);
      isPausingRef.current = false;
      if (wasPlayingBeforeHoldRef.current && audioRef?.current?.paused) play();
      wasPlayingBeforeHoldRef.current = false;
    }, [isPausedByHold, audioRef, play, setIsPausedByHold, wasPlayingBeforeHoldRef, typewriterInstanceRef]);

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
      const container = document.querySelector('.croquetas25');
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
    <div className="croquetas25" onClick={handleClick}>
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
          selectedTrackId={trackId ? trackId.toLowerCase().replace(/\s+/g, '-') : 'croquetas25'}
          isDirectUri={isDirectUri}
          isVisible={!selectedTrack}
        />
      )}
      
      {/* Background siempre visible para mostrar diagonales - dentro de AudioProvider si hay track, fuera si no */}
      {selectedTrack && audioSrcs.length > 0 ? (
        <AudioProvider audioSrcs={audioSrcs}>
          <AllCompleteHandler />
          <BackgroundWrapper 
            onTriggerCallbackRef={audioStarted ? triggerCallbackRef : null} 
            onVoiceCallbackRef={audioStarted ? voiceCallbackRef : null}
            selectedTrack={audioStarted ? selectedTrack : null}
            showOnlyDiagonales={!audioStarted}
            onAllComplete={handleAllComplete}
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
          />
          <AudioStarter audioStarted={audioStarted} />
          <HoldToPauseHandler 
            isPausedByHold={isPausedByHold}
            setIsPausedByHold={setIsPausedByHold}
            wasPlayingBeforeHoldRef={wasPlayingBeforeHoldRef}
            typewriterInstanceRef={typewriterInstanceRef}
          />
          <LoadingProgressHandler onTriggerCallbackRef={triggerCallbackRef} audioStarted={audioStarted} />
          <AudioAnalyzer onBeat={handleBeat} onVoice={handleVoice} />
          <SeekWrapper />
          {audioStarted && selectedTrack && (
            <SubfolderAudioController selectedTrack={selectedTrack} />
          )}
          {audioStarted && (
            <GuionManager 
              selectedTrack={selectedTrack}
              typewriterInstanceRef={typewriterInstanceRef}
              isPausedByHold={isPausedByHold}
            />
          )}
          {/* Mostrar BackButton siempre si es URI directa (incluso antes de seleccionar track), o cuando audioStarted */}
          {isDirectUri || audioStarted ? (
            <BackButton 
              onBack={() => {
                setAudioStarted(false);
                setSelectedTrack(null);
                setShowStartButton(false);
                setWasSelectedFromIntro(false);
                setLoadingFadedOut(false);
              }}
            />
          ) : null}
        </AudioProvider>
      ) : (
        // Cuando no hay track seleccionado, mostrar solo diagonales sin AudioProvider
        <DiagonalesOnly />
      )}
    </div>
  );
};

const AudioStarter = ({ audioStarted }) => {
  const { play, isLoaded, audioRef, audioContextRef } = useAudio();
  const hasAttemptedPlayRef = useRef(false);

  useEffect(() => {
    if (!audioStarted) {
      hasAttemptedPlayRef.current = false;
      return;
    }

    if (audioStarted && isLoaded && !hasAttemptedPlayRef.current && audioRef?.current) {
      hasAttemptedPlayRef.current = true;
      const audio = audioRef.current;
      
      // Detectar iOS (especialmente Chrome en iOS)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const isChromeIOS = isIOS && /CriOS/.test(navigator.userAgent);
      const isSafariIOS = isIOS && !isChromeIOS;
      
      const tryPlay = async () => {
        // En iOS/Safari, ser más permisivo con readyState
        const minReadyState = (isIOS || isSafariIOS) ? 1 : 2;
        
        if (audio.readyState >= minReadyState) {
          // En iOS, asegurar que el AudioContext esté resumido
          if (isIOS || isChromeIOS || isSafariIOS) {
            const audioContext = audioContextRef?.current || window.__globalAudioContext;
            if (audioContext && audioContext.state === 'suspended') {
              try {
                await audioContext.resume();
                console.log('[AudioStarter] AudioContext resumido antes de play()');
              } catch (resumeErr) {
                console.warn('[AudioStarter] Error resumiendo AudioContext:', resumeErr);
              }
            }
          }
          
          // Llamar a play() del contexto
          play().catch(error => {
            console.error('[AudioStarter] Error playing audio:', error);
            // En iOS, si es NotAllowedError, puede ser que necesitemos más tiempo
            if (isIOS && error.name === 'NotAllowedError') {
              console.warn('[AudioStarter] NotAllowedError en iOS, reintentando después de delay...');
              setTimeout(async () => {
                try {
                  const audioContext = audioContextRef?.current || window.__globalAudioContext;
                  if (audioContext && audioContext.state === 'suspended') {
                    await audioContext.resume();
                  }
                  await play();
                } catch (retryErr) {
                  console.error('[AudioStarter] Error en reintento:', retryErr);
                  hasAttemptedPlayRef.current = false;
                }
              }, 300);
            } else {
              hasAttemptedPlayRef.current = false;
            }
          });
        } else if (audioStarted) {
          // En iOS, esperar menos tiempo
          const waitTime = (isIOS || isSafariIOS) ? 50 : 100;
          setTimeout(tryPlay, waitTime);
        }
      };
      
      tryPlay();
    }
  }, [audioStarted, isLoaded, play, audioRef, audioContextRef]);

  return null;
};

const UnifiedLoadingIndicator = ({ imagesLoading, imagesProgress, isDirectUri, audioStarted, loadingFadedOut, setLoadingFadedOut, setAudioStarted, selectedTrack }) => {
  const { loadingProgress: audioProgress, isLoaded: audioLoaded, audioRef } = useAudio();
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
  loadingFadedOut
}) => {
  const { isLoaded, audioRef, audioContextRef } = useAudio();
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
        // En iOS, especialmente Chrome, asegurar que el AudioContext esté resumido antes de iniciar
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isChromeIOS = isIOS && /CriOS/.test(navigator.userAgent);
        
        if (isIOS || isChromeIOS) {
          const audioContext = audioContextRef?.current || window.__globalAudioContext;
          if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
              console.log('[UnifiedContentManager] AudioContext resumido antes de iniciar audio');
              setAudioStarted(true);
            }).catch(err => {
              console.warn('[UnifiedContentManager] Error resumiendo AudioContext:', err);
              setAudioStarted(true); // Continuar de todas formas
            });
          } else {
            setAudioStarted(true);
          }
        } else {
          setAudioStarted(true);
        }
      }
    }
  }, [everythingReady, loadingFadedOut, isDirectUri, showStartButton, audioStarted, wasSelectedFromIntro, setShowStartButton, setAudioStarted, audioContextRef]);
  
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
      className="croquetas25-start-croqueta" 
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
        className="croquetas25-start-croqueta__button"
      />
    </div>
  );
};

const BackgroundWrapper = ({ onTriggerCallbackRef, onVoiceCallbackRef, selectedTrack, showOnlyDiagonales = false, onAllComplete }) => {
  const { analyserRef, dataArrayRef, isInitialized, currentIndex, pause } = useAudio();
  
  return (
    <Background 
      onTriggerCallbackRef={showOnlyDiagonales ? null : onTriggerCallbackRef} 
      onVoiceCallbackRef={showOnlyDiagonales ? null : onVoiceCallbackRef}
      analyserRef={analyserRef}
      dataArrayRef={dataArrayRef}
      isInitialized={isInitialized}
      selectedTrack={showOnlyDiagonales ? null : selectedTrack}
      showOnlyDiagonales={showOnlyDiagonales}
      currentAudioIndex={showOnlyDiagonales ? null : currentIndex}
      onAllComplete={onAllComplete}
      pause={showOnlyDiagonales ? null : pause}
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

const SeekWrapper = ({ selectedTrack }) => {
  const { analyserRef } = useAudio();
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
  
  return <Seek squares={squares} seekToImagePosition={seekToImagePosition} selectedTrack={selectedTrack} />;
};

// Componente para gestionar el guión según la subcarpeta actual
// Componente para controlar el cambio de audio cuando se completa una subcarpeta
const SubfolderAudioController = ({ selectedTrack }) => {
  const { seekToAudio, currentIndex } = useAudio();
  const completedSubfoldersRef = useRef(new Set());

  useEffect(() => {
    if (!selectedTrack || !selectedTrack.subfolderToAudioIndex) return;
    
    completedSubfoldersRef.current.clear();
    
    window.__subfolderCompleteHandler = (completedSubfolder, nextAudioIndex) => {
      if (completedSubfoldersRef.current.has(completedSubfolder)) {
        console.log(`[SubfolderAudioController] Subcarpeta ${completedSubfolder} ya procesada`);
        return;
      }
      
      if (nextAudioIndex !== null && currentIndex !== nextAudioIndex) {
        completedSubfoldersRef.current.add(completedSubfolder);
        console.log(`[SubfolderAudioController] Cambiando de audio ${currentIndex} a ${nextAudioIndex}`);
        seekToAudio(nextAudioIndex, 0);
      } else {
        completedSubfoldersRef.current.add(completedSubfolder);
        console.log(`[SubfolderAudioController] No hay siguiente audio o ya estamos en el correcto`);
      }
    };
    
    return () => {
      window.__subfolderCompleteHandler = null;
    };
  }, [selectedTrack, seekToAudio, currentIndex]);

  return null;
};

const GuionManager = ({ selectedTrack, typewriterInstanceRef, isPausedByHold }) => {
  const [currentSubfolder, setCurrentSubfolder] = useState(null);
  const { currentIndex } = useAudio();
  
  // Rastrear la subcarpeta actual basándose en el audio que está sonando
  useEffect(() => {
    if (!selectedTrack || !selectedTrack.subfolderToAudioIndex || !selectedTrack.subfolderOrder) return;
    
    const subfolderOrder = selectedTrack.subfolderOrder || [];
    let foundSubfolder = null;
    
    // Buscar la subcarpeta que tiene el audio actual
    for (const subfolder of subfolderOrder) {
      const audioIndex = selectedTrack.subfolderToAudioIndex[subfolder];
      if (audioIndex === currentIndex) {
        foundSubfolder = subfolder;
        break;
      }
    }
    
    // Si no encontramos una subcarpeta con el audio actual, usar la primera o __root__
    if (!foundSubfolder && subfolderOrder.length > 0) {
      foundSubfolder = subfolderOrder[0];
    }
    
    setCurrentSubfolder(foundSubfolder);
  }, [selectedTrack, currentIndex]);
  
  // Obtener el guión: priorizar el de la raíz, luego el de la subcarpeta actual
  const getCurrentGuion = () => {
    if (!selectedTrack || !selectedTrack.guionesBySubfolder) {
      return selectedTrack?.guion;
    }
    
    // Priorizar guión de la raíz
    const rootGuion = selectedTrack.guionesBySubfolder['__root__'];
    if (rootGuion && rootGuion.textos) {
      return rootGuion;
    }
    
    // Si no hay guión en la raíz, usar el de la subcarpeta actual
    if (currentSubfolder) {
      const subfolderGuion = selectedTrack.guionesBySubfolder[currentSubfolder];
      if (subfolderGuion && subfolderGuion.textos) {
        return subfolderGuion;
      }
    }
    
    // Fallback al guión general del track
    return selectedTrack?.guion;
  };
  
  const currentGuion = getCurrentGuion();
  
  if (!currentGuion || !currentGuion.textos) {
    return null;
  }
  
  return (
    <PromptWrapper 
      textos={currentGuion.textos} 
      typewriterInstanceRef={typewriterInstanceRef} 
      isPausedByHold={isPausedByHold} 
    />
  );
};

const PromptWrapper = ({ textos, typewriterInstanceRef, isPausedByHold }) => {
  const { audioRef, analyserRef } = useAudio();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  useEffect(() => {
    if (!audioRef?.current) return;
    
    const audio = audioRef.current;
    const updateTime = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) setDuration(audio.duration);
    };
    
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration) setDuration(audio.duration);
    });
    
    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', () => {});
    };
  }, [audioRef]);
  
  return (
    <Prompt 
      textos={textos} 
      currentTime={currentTime}
      duration={duration}
      typewriterInstanceRef={typewriterInstanceRef}
      isPaused={isPausedByHold}
      analyser={analyserRef?.current}
    />
  );
};

export default Croquetas25;
