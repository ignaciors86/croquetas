import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
  const [audioStarted, setAudioStarted] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [isPausedByHold, setIsPausedByHold] = useState(false);
  const [showStartButton, setShowStartButton] = useState(false);
  const [loadingFadedOut, setLoadingFadedOut] = useState(false);
  const wasPlayingBeforeHoldRef = useRef(false);
  const startButtonRef = useRef(null);
  const triggerCallbackRef = useRef(null);
  const voiceCallbackRef = useRef(null);
  const lastSquareTimeRef = useRef(0);
  const minTimeBetweenSquares = 600;
  const typewriterInstanceRef = useRef(null);
  
  const { tracks, isLoading: tracksLoading } = useTracks();
  
  // LÓGICA SIMPLIFICADA: trackIdFromUrl solo determina qué croqueta mostrar como activa
  // selectedTrack solo se establece cuando el usuario hace clic en la croqueta activa para empezar
  
  const getTrackIdFromUrl = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const pathname = window.location.pathname;
    const match = pathname.match(/\/(?:nachitos-de-nochevieja\/)?([^\/]+)$/);
    if (match && match[1] && match[1] !== 'nachitos-de-nochevieja') {
      return match[1];
    }
    return null;
  }, []);
  
  const [activeTrackId, setActiveTrackId] = useState(() => {
    const fromUrl = getTrackIdFromUrl();
    return fromUrl || 'nachitos-de-nochevieja'; // Por defecto nachitos-de-nochevieja
  });
  
  // La URI es solo un parámetro amigable - NO cambiar location, solo leer
  // Inicializar activeTrackId desde la URL o usar por defecto - SOLO UNA VEZ al montar
  const initializedRef = useRef(false);
  useEffect(() => {
    if (tracksLoading || tracks.length === 0 || initializedRef.current) return;
    
    const currentTrackId = getTrackIdFromUrl();
    if (!currentTrackId) {
      // Buscar el track de Nachitos de Nochevieja como por defecto
      const nachitosTrack = tracks.find(track => {
        const normalizedName = track.name?.toLowerCase().replace(/\s+/g, '-') || '';
        const normalizedId = (track.id || '').toLowerCase().replace(/\s+/g, '-');
        return normalizedName.includes('nachitos-de-nochevieja') || 
               normalizedName.includes('nachitos de nochevieja') ||
               normalizedId === 'nachitos-de-nochevieja';
      });
      const defaultId = nachitosTrack 
        ? (nachitosTrack.id || nachitosTrack.name).toLowerCase().replace(/\s+/g, '-')
        : 'nachitos-de-nochevieja';
      
      // NO cambiar la URL - solo establecer el estado interno UNA VEZ
      setActiveTrackId(defaultId);
      initializedRef.current = true;
    } else {
      setActiveTrackId(currentTrackId);
      initializedRef.current = true;
    }
  }, [tracksLoading, tracks, getTrackIdFromUrl]);
  
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
  
  // Función de salida de croquetas que anima correctamente todos los elementos
  const exitCroqueta = useCallback(async () => {
    console.log('[Croquetas25] Iniciando salida de croqueta con animaciones');
    console.log('[exitCroqueta] URL actual antes de cambiar:', typeof window !== 'undefined' ? window.location.pathname : 'N/A');
    
    // Crear timeline maestro para todas las animaciones
    const exitTimeline = gsap.timeline();
    
    // 1. Fade out de elementos UI (Seek, Prompt, BackButton)
    const seekElement = document.querySelector('.seek');
    const promptElement = document.querySelector('.prompt');
    const backButtonElement = document.querySelector('.backButton');
    
    if (seekElement) {
      exitTimeline.to(seekElement, {
        opacity: 0,
        y: 20,
        duration: 0.6,
        ease: 'power2.in'
      }, 0);
    }
    
    if (promptElement) {
      exitTimeline.to(promptElement, {
        opacity: 0,
        y: 50,
        duration: 0.6,
        ease: 'power2.in'
      }, 0);
    }
    
    if (backButtonElement) {
      exitTimeline.to(backButtonElement, {
        opacity: 0,
        scale: 0,
        duration: 0.6,
        ease: 'power2.in'
      }, 0);
    }
    
    // 2. Fade out del contenido principal (Background, imágenes, etc.)
    const contentContainer = document.querySelector('.croquetas25');
    if (contentContainer) {
      exitTimeline.to(contentContainer, {
        opacity: 0,
        duration: 0.8,
        ease: 'power2.in'
      }, 0.2);
    }
    
    // 3. Fade out del audio (si está disponible)
    if (handleAllCompleteRef.current) {
      exitTimeline.call(async () => {
        await handleAllCompleteRef.current();
      }, null, 0.4);
    }
    
    // Esperar a que todas las animaciones terminen
    await exitTimeline;
    
    // 4. Limpiar estados y volver a la home
    // IMPORTANTE: Resetear todo el estado para evitar que se reinicie la croqueta
    setAudioStarted(false);
    setSelectedTrack(null);
    setShowStartButton(false);
    setLoadingFadedOut(false);
    
    // Limpiar callbacks para evitar que se activen después
    if (triggerCallbackRef.current) {
      triggerCallbackRef.current = null;
    }
    if (voiceCallbackRef.current) {
      voiceCallbackRef.current = null;
    }
    
    // NO cambiar la URL - la URI es solo lectura
    // Solo resetear el estado interno y volver a la croqueta por defecto
    if (typeof window !== 'undefined' && tracks.length > 0) {
      // Buscar el track de Nachitos de Nochevieja como por defecto
      const nachitosTrack = tracks.find(track => {
        const normalizedName = track.name?.toLowerCase().replace(/\s+/g, '-') || '';
        const normalizedId = (track.id || '').toLowerCase().replace(/\s+/g, '-');
        return normalizedName.includes('nachitos-de-nochevieja') || 
               normalizedName.includes('nachitos de nochevieja') ||
               normalizedId === 'nachitos-de-nochevieja';
      });
      const defaultId = nachitosTrack 
        ? (nachitosTrack.id || nachitosTrack.name).toLowerCase().replace(/\s+/g, '-')
        : 'nachitos-de-nochevieja';
      setActiveTrackId(defaultId);
    }
    
    // 5. Fade-in del contenido después de un breve delay
    setTimeout(() => {
      if (contentContainer) {
        gsap.fromTo(contentContainer, 
          { opacity: 0 },
          { 
            opacity: 1, 
            duration: 0.8, 
            ease: 'power2.out' 
          }
        );
      }
    }, 100);
  }, []);
  
  // Callback para cuando se completa toda la colección - volver a Intro con fade
  const handleAllComplete = useCallback(async () => {
    console.log('[Croquetas25] Todas las subcarpetas completadas, volviendo a Intro');
    await exitCroqueta();
  }, [exitCroqueta]);
  
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
  
  const { isLoading: imagesLoading, preloadProgress: imagesProgress, seekToImagePosition } = useGallery(selectedTrack, handleSubfolderComplete, handleAllComplete, null, audioStarted);
  
  // Memoizar audioSrcs para evitar recálculos innecesarios que causan re-montaje del AudioProvider
  const audioSrcs = useMemo(() => {
    if (!selectedTrack) return [];
    return selectedTrack?.srcs || (selectedTrack?.src ? [selectedTrack.src] : []);
  }, [selectedTrack?.id, selectedTrack?.srcs, selectedTrack?.src]); // Solo recalcular si cambia el ID o los srcs
  
  const isDirectUri = !!activeTrackId;
  
  
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

  // Cuando se hace clic en una croqueta normal: solo cambiar la activa mostrada
  // NO cambiar la URL - la URI es solo lectura
  const handleTrackSelect = useCallback((track) => {
    const trackIdForUrl = (track.id || track.name).toLowerCase().replace(/\s+/g, '-');
    // Solo actualizar el estado interno - NO cambiar location
    setActiveTrackId(trackIdForUrl);
  }, []);

  // Cuando se hace clic en la croqueta activa: establecer selectedTrack y mostrar botón de inicio
  const handleStartPlayback = useCallback(async (e) => {
    // Buscar el track según activeTrackId
    const normalizedTrackId = activeTrackId.toLowerCase().replace(/\s+/g, '-');
    const trackToUse = tracks.find(track => {
      const normalizedId = (track.id || track.name).toLowerCase().replace(/\s+/g, '-');
      return normalizedId === normalizedTrackId;
    });
    
    if (!trackToUse) return;
    
    // Establecer selectedTrack y ocultar Intro
    setSelectedTrack(trackToUse);
    setAudioStarted(false);
    setShowStartButton(false);
    setLoadingFadedOut(false);
    
    // Ocultar el Intro y mostrar el botón de inicio
    const introOverlay = document.querySelector('.intro');
    if (introOverlay) {
      gsap.to(introOverlay, {
        opacity: 0,
        duration: 0.6,
        ease: 'power2.in',
        onComplete: () => {
          gsap.set(introOverlay, { display: 'none' });
          setShowStartButton(true);
        }
      });
    } else {
      setShowStartButton(true);
    }
  }, [activeTrackId, tracks]);

  const handleClick = async (e) => {
    if (!audioStarted && selectedTrack && showStartButton && startButtonRef.current) {
      // Detectar móviles
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const isAndroid = /Android/.test(navigator.userAgent);
      const isChromeIOS = isIOS && /CriOS/.test(navigator.userAgent);
      const isSafariIOS = isIOS && !isChromeIOS;
      const isMobile = isIOS || isAndroid;
      
      // En móviles, asegurar que el AudioContext esté inicializado y resumido
      if (isMobile) {
        // Obtener el contexto de audio si está disponible
        const audioContext = window.__globalAudioContext;
        if (audioContext) {
          if (audioContext.state === 'suspended') {
            // Resumir AudioContext - debe ser dentro del evento de usuario
            try {
              await audioContext.resume();
              console.log('[Croquetas25] AudioContext resumido desde click del usuario (móvil)');
            } catch (err) {
              console.warn('[Croquetas25] Error resumiendo AudioContext:', err);
            }
          }
        } else {
          // Si no hay AudioContext, esperar un momento para que se inicialice
          console.log('[Croquetas25] Esperando inicialización del AudioContext...');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Intentar reproducir el audio directamente desde el elemento
        // Esto DEBE hacerse dentro del handler de click, no en un callback
        try {
          const audioElement = document.querySelector('.audio-context');
          if (audioElement) {
            // En móviles, incluso con readyState bajo, intentar reproducir
            // El navegador cargará el audio si es necesario
            if (audioElement.paused) {
              const playPromise = audioElement.play();
              if (playPromise !== undefined) {
                playPromise.then(() => {
                  console.log('[Croquetas25] Audio iniciado directamente desde click en móvil');
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

  // Determinar qué capas deben estar visibles
  const showTracksLoading = tracksLoading;
  // El Intro siempre debe estar visible hasta que el usuario haga clic en la croqueta activa
  // Solo se oculta cuando audioStarted es true (después del clic del usuario)
  // IMPORTANTE: No depende de loadingFadedOut - debe estar visible siempre hasta que el usuario haga clic
  const showIntro = !tracksLoading && tracks.length > 0 && !audioStarted;
  const showBackground = true; // Siempre visible
  const showLoading = selectedTrack && !loadingFadedOut && !audioStarted;
  const showContent = selectedTrack && audioSrcs.length > 0;
  const showUI = selectedTrack && (audioStarted || showStartButton);

  // Ref para el contenedor principal para animaciones de fade
  const mainContainerRef = useRef(null);
  
  // La croqueta activa es simplemente activeTrackId
  const introSelectedTrackId = activeTrackId;
  
  // Fade-in inicial del contenedor
  useEffect(() => {
    if (mainContainerRef.current) {
      gsap.fromTo(mainContainerRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.6, ease: 'power2.out' }
      );
    }
  }, []);
  
  return (
    <div className="croquetas25" ref={mainContainerRef} onClick={handleClick}>
      {/* Capa 1: Background/Diagonales - Siempre presente */}
      {/* Capa 2: Loading Unificado - Siempre presente, visible según condiciones */}
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
        isVisible={showLoading}
        tracksLoading={tracksLoading}
      />
      {showContent ? (
        <AudioProvider key={selectedTrack?.id || 'no-track'} audioSrcs={audioSrcs}>
          <AllCompleteHandler />
          <BackgroundWrapper 
            onTriggerCallbackRef={audioStarted ? triggerCallbackRef : null} 
            onVoiceCallbackRef={audioStarted ? voiceCallbackRef : null}
            selectedTrack={audioStarted ? selectedTrack : null}
            showOnlyDiagonales={!audioStarted}
            onAllComplete={handleAllComplete}
          />
          {/* Capa 3: Contenido principal */}
          <UnifiedContentManager
            imagesLoading={imagesLoading}
            imagesProgress={imagesProgress}
            audioStarted={audioStarted}
            setAudioStarted={setAudioStarted}
            showStartButton={showStartButton}
            setShowStartButton={setShowStartButton}
            isDirectUri={isDirectUri}
            startButtonRef={startButtonRef}
            handleClick={handleClick}
            selectedTrack={selectedTrack}
            loadingFadedOut={loadingFadedOut}
          />
          {/* Capa 4: Handlers y componentes funcionales */}
          <AudioStarter audioStarted={audioStarted} />
          <HoldToPauseHandler 
            isPausedByHold={isPausedByHold}
            setIsPausedByHold={setIsPausedByHold}
            wasPlayingBeforeHoldRef={wasPlayingBeforeHoldRef}
            typewriterInstanceRef={typewriterInstanceRef}
          />
          <LoadingProgressHandler onTriggerCallbackRef={triggerCallbackRef} audioStarted={audioStarted} />
          {audioStarted && <AudioAnalyzerWrapper onBeat={handleBeat} onVoice={handleVoice} />}
          {/* Capa 5: UI Elements - Visible cuando hay contenido activo */}
          {showUI && (
            <>
              <SeekWrapper />
              {audioStarted && selectedTrack && (
                <>
                  <SubfolderAudioController selectedTrack={selectedTrack} />
                  <AudioEndMonitor selectedTrack={selectedTrack} onExit={exitCroqueta} />
                </>
              )}
              {audioStarted && (
                <GuionManager 
                  selectedTrack={selectedTrack}
                  typewriterInstanceRef={typewriterInstanceRef}
                  isPausedByHold={isPausedByHold}
                />
              )}
              {(isDirectUri || audioStarted) && (
                <BackButton 
                  onBack={exitCroqueta}
                />
              )}
            </>
          )}
        </AudioProvider>
      ) : (
        <DiagonalesOnly />
      )}
      
      {/* Capa 6: Intro - Siempre visible hasta que el usuario haga clic en la croqueta activa */}
      {showIntro && (
        <Intro 
          tracks={tracks} 
          onTrackSelect={handleTrackSelect}
          onStartPlayback={!audioStarted ? handleStartPlayback : null}
          selectedTrackId={introSelectedTrackId}
          isDirectUri={isDirectUri}
          isVisible={showIntro}
          keepBlurVisible={selectedTrack && audioStarted}
        />
      )}
      
      {/* El loader unificado ahora maneja también la carga de tracks */}
    </div>
  );
};

const AudioStarter = ({ audioStarted }) => {
  const { play, isLoaded, audioRef, audioContextRef, currentIndex } = useAudio();
  const hasAttemptedPlayRef = useRef(false);
  const lastPlayStateRef = useRef(null);
  const lastAudioIndexRef = useRef(null);

  // Resetear refs cuando cambia el índice de audio (nuevo track o nuevo segmento)
  useEffect(() => {
    if (currentIndex !== lastAudioIndexRef.current) {
      console.log('[AudioStarter] Audio index cambió, reseteando refs');
      hasAttemptedPlayRef.current = false;
      lastPlayStateRef.current = null;
      lastAudioIndexRef.current = currentIndex;
    }
  }, [currentIndex]);

  useEffect(() => {
    if (!audioStarted) {
      hasAttemptedPlayRef.current = false;
      lastPlayStateRef.current = null;
      return;
    }

    // Crear un identificador único para este intento de reproducción
    const playStateId = `${audioStarted}-${isLoaded}-${audioRef?.current?.src || 'no-audio'}`;
    
    // Si ya intentamos reproducir con este mismo estado, no hacer nada (protección contra StrictMode)
    if (playStateId === lastPlayStateRef.current) {
      console.log('[AudioStarter] Ya se intentó reproducir con este estado, ignorando');
      return;
    }
    
    if (audioStarted && isLoaded && !hasAttemptedPlayRef.current && audioRef?.current) {
      hasAttemptedPlayRef.current = true;
      lastPlayStateRef.current = playStateId;
      console.log('[AudioStarter] Intentando reproducir audio');
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

  // Listener para inicializar AudioContext en móviles - SIEMPRE activo en móviles
  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/.test(navigator.userAgent);
    const isMobile = isIOS || isAndroid;
    
    if (!isMobile) return;
    
    let hasResumed = false;
    
    const initializeAudioContextOnTouch = async (e) => {
      // Solo intentar una vez para evitar múltiples intentos
      if (hasResumed) return;
      
      const audioContext = audioContextRef?.current || window.__globalAudioContext;
      
      if (audioContext && audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
          hasResumed = true;
          console.log('[AudioInitializer] AudioContext resumido desde evento táctil');
          
          // Si el audio está pausado y debería estar reproduciéndose, intentar reproducirlo
          if (audioRef?.current && audioRef.current.paused && audioStarted) {
            try {
              await play();
              console.log('[AudioInitializer] Audio iniciado desde evento táctil');
            } catch (playErr) {
              console.warn('[AudioInitializer] Error iniciando audio desde evento táctil:', playErr);
            }
          }
        } catch (err) {
          console.warn('[AudioInitializer] Error resumiendo AudioContext desde evento táctil:', err);
        }
      } else if (audioContext && audioContext.state === 'running') {
        // Si ya está corriendo, marcar como resumido
        hasResumed = true;
      }
    };
    
    // Escuchar eventos táctiles y de clic para inicializar AudioContext
    // Usar capture phase para capturar antes que otros listeners
    const events = ['touchstart', 'touchend', 'click', 'mousedown'];
    events.forEach(eventType => {
      document.addEventListener(eventType, initializeAudioContextOnTouch, { capture: true, passive: true });
    });
    
    return () => {
      events.forEach(eventType => {
        document.removeEventListener(eventType, initializeAudioContextOnTouch, { capture: true });
      });
    };
  }, [audioStarted, audioContextRef, audioRef, play]);

  return null;
};

const UnifiedLoadingIndicator = ({ imagesLoading, imagesProgress, isDirectUri, audioStarted, loadingFadedOut, setLoadingFadedOut, setAudioStarted, selectedTrack, tracksLoading }) => {
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
  
  // Ref para rastrear el último track procesado (protección contra StrictMode)
  const lastProcessedTrackRef = useRef(null);
  
  useEffect(() => {
    // Si el track no ha cambiado realmente, no hacer nada
    if (selectedTrack && lastProcessedTrackRef.current === selectedTrack.id) {
      return;
    }
    
    if (selectedTrack) {
      lastProcessedTrackRef.current = selectedTrack.id;
      fadeoutStartedRef.current = false;
      hasCheckedReadyRef.current = false;
      setLoadingFadedOut(false);
      // NO hacer fade-in aquí, dejar que el efecto de visibilidad lo maneje
      // Esto evita que se muestre dos veces
    } else {
      lastProcessedTrackRef.current = null;
    }
  }, [selectedTrack?.id, setLoadingFadedOut]);
  
  // Ref para rastrear el último estado de everythingReady procesado (protección contra StrictMode)
  const lastEverythingReadyStateRef = useRef(null);
  
  useEffect(() => {
    const currentState = `${everythingReady}-${loadingFadedOut}-${selectedTrack?.id || 'no-track'}`;
    
    // Si el estado no ha cambiado, no hacer nada (protección contra StrictMode)
    if (currentState === lastEverythingReadyStateRef.current) {
      return;
    }
    lastEverythingReadyStateRef.current = currentState;
    
    if (everythingReady && !fadeoutStartedRef.current && !hasCheckedReadyRef.current && loadingRef.current && !loadingFadedOut) {
      hasCheckedReadyRef.current = true;
      fadeoutStartedRef.current = true;
      
      // En móviles, dar un pequeño delay antes de hacer fade out para asegurar que todo esté listo
      const fadeOutDelay = isMobile ? 300 : 0;
      
      setTimeout(() => {
        if (loadingRef.current) {
          gsap.to(loadingRef.current, {
            opacity: 0,
            duration: 0.8,
            ease: 'power2.out',
            onComplete: () => {
              setLoadingFadedOut(true);
            }
          });
        }
      }, fadeOutDelay);
    }
  }, [everythingReady, loadingFadedOut, setLoadingFadedOut, isMobile, selectedTrack?.id]);
  
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
  
  // Controlar visibilidad con GSAP para transiciones suaves
  const visibilityAnimationRef = useRef(null);
  const lastVisibilityStateRef = useRef(null);
  
  // Determinar si debe estar visible
  const shouldShowTracksLoading = tracksLoading;
  const shouldShowContentLoading = isVisible && !audioStarted && !loadingFadedOut;
  const shouldBeVisible = shouldShowTracksLoading || shouldShowContentLoading;
  
  useEffect(() => {
    if (!loadingRef.current) return;
    
    const currentState = `${shouldBeVisible}-${tracksLoading}-${isVisible}-${audioStarted}-${loadingFadedOut}`;
    
    // Si el estado no ha cambiado, no hacer nada
    if (currentState === lastVisibilityStateRef.current) {
      return;
    }
    
    lastVisibilityStateRef.current = currentState;
    
    // Cancelar animación anterior si existe
    if (visibilityAnimationRef.current) {
      visibilityAnimationRef.current.kill();
      visibilityAnimationRef.current = null;
    }
    
    if (shouldBeVisible) {
      // Mostrar loading con fade-in suave
      gsap.set(loadingRef.current, { display: 'block', opacity: 0 });
      visibilityAnimationRef.current = gsap.to(loadingRef.current, {
        opacity: 1,
        duration: 0.5,
        ease: 'power2.out',
        onComplete: () => {
          visibilityAnimationRef.current = null;
        }
      });
    } else {
      // Ocultar loading con fade-out suave
      visibilityAnimationRef.current = gsap.to(loadingRef.current, {
        opacity: 0,
        duration: 0.6,
        ease: 'power2.in',
        onComplete: () => {
          if (loadingRef.current) {
            gsap.set(loadingRef.current, { display: 'none' });
          }
          visibilityAnimationRef.current = null;
        }
      });
    }
    
    return () => {
      if (visibilityAnimationRef.current) {
        visibilityAnimationRef.current.kill();
        visibilityAnimationRef.current = null;
      }
    };
  }, [shouldBeVisible, tracksLoading, isVisible, audioStarted, loadingFadedOut]);
  
  // Si no debe estar visible, no renderizar
  if (!shouldBeVisible) {
    return null;
  }
  
  // Si está cargando tracks, mostrar mensaje simple
  if (shouldShowTracksLoading) {
    return (
      <div className="image-preloader croquetas25__loading-layer" ref={loadingRef}>
        <div className="image-preloader__content">
          <div className="image-preloader__text">Cargando canciones...</div>
        </div>
      </div>
    );
  }
  
  // Si está cargando contenido, mostrar KITTLoader
  const combinedProgress = everythingReady ? 100 : Math.round((imagesProgress + audioProgress) / 2);
  const showFast = combinedProgress >= 95;
  
  // En móviles, asegurar que el loading tenga al menos un progreso mínimo visible
  const displayProgress = isMobile && combinedProgress === 0 ? 5 : combinedProgress;
  
  return (
    <div className="image-preloader croquetas25__loading-layer" ref={loadingRef}>
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
  startButtonRef,
  handleClick,
  selectedTrack,
  loadingFadedOut,
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
  
  // Ref para evitar iniciar audio múltiples veces (protección contra StrictMode)
  const audioStartAttemptedRef = useRef(false);
  const lastAudioStartStateRef = useRef(null);
  
  useEffect(() => {
    if (!everythingReady || !loadingFadedOut) return;
    
    const currentState = `${everythingReady}-${loadingFadedOut}-${isDirectUri}-${audioStarted}-${showStartButton}`;
    
    // Si el estado no ha cambiado, no hacer nada (protección contra StrictMode)
    if (currentState === lastAudioStartStateRef.current) {
      return;
    }
    lastAudioStartStateRef.current = currentState;
    
    if (isDirectUri) {
      // Si hay trackId en la URL, NO mostrar automáticamente el botón de inicio
      // El botón solo se mostrará cuando el usuario haga clic en la croqueta activa del Intro
      // Esto se maneja en handleStartPlayback
      // IMPORTANTE: Si el usuario ya hizo clic y showStartButton es true, mantenerlo así
      // No hacer nada aquí para acceso directo por URI - preservar el estado del botón
      return; // Salir temprano para no afectar el estado del botón
    } else {
      // NUNCA iniciar automáticamente - siempre requiere un clic del usuario
      // El usuario debe hacer clic en la croqueta activa del Intro para empezar
      // No hacer nada aquí - el audio solo se iniciará cuando el usuario haga clic
    }
  }, [everythingReady, loadingFadedOut, isDirectUri, showStartButton, audioStarted, setShowStartButton, setAudioStarted, audioContextRef]);
  
  // Resetear el ref cuando cambia el track seleccionado
  useEffect(() => {
    audioStartAttemptedRef.current = false;
    lastAudioStartStateRef.current = null;
  }, [selectedTrack]);
  
  useEffect(() => {
    if (isDirectUri && everythingReady && loadingFadedOut && showStartButton && !audioStarted) {
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
  }, [isDirectUri, everythingReady, loadingFadedOut, showStartButton, audioStarted]);
  
  useEffect(() => {
    buttonAnimationStartedRef.current = false;
  }, [selectedTrack]);
  
  // Mostrar el botón cuando showStartButton es true (tanto para acceso directo por URI como para selección normal)
  // No requerir everythingReady y loadingFadedOut porque el usuario ya hizo clic
  if (!(showStartButton && !audioStarted)) {
    return null;
  }
  
  // Si no está todo listo, el botón se muestra pero no es clickeable hasta que todo esté listo
  const isReady = everythingReady && loadingFadedOut;
  
  return (
    <div 
      className="croquetas25-start-croqueta" 
      ref={(el) => {
        startButtonRef.current = el;
        buttonRef.current = el;
      }}
      onClick={isReady ? handleClick : undefined}
      style={{ 
        pointerEvents: isReady ? 'auto' : 'none',
        opacity: isReady ? 1 : 0.5
      }}
    >
      <Croqueta
        index={selectedTrack ? 0 : 999}
        text={selectedTrack?.name || "Comenzar"}
        onClick={isReady ? handleClick : undefined}
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

const AudioAnalyzerWrapper = ({ onBeat, onVoice }) => {
  const { audioRef, analyserRef, dataArrayRef, isInitialized } = useAudio();
  
  return (
    <AudioAnalyzer 
      onBeat={onBeat} 
      onVoice={onVoice}
      audioRef={audioRef}
      analyserRef={analyserRef}
      dataArrayRef={dataArrayRef}
      setIsInitialized={isInitialized ? (() => {}) : undefined}
    />
  );
};

const SeekWrapper = ({ selectedTrack }) => {
  const { analyserRef, audioRef, currentIndex, seekToAudio } = useAudio();
  const [squares, setSquares] = useState([]);
  const { seekToImagePosition } = useGallery(selectedTrack, null, null, null, true);
  
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
  
  // Obtener audioSrcs del selectedTrack
  const audioSrcs = selectedTrack?.srcs || (selectedTrack?.src ? [selectedTrack.src] : []);
  
  // Función para cambiar el índice de audio
  const setCurrentAudioIndex = (index) => {
    seekToAudio(index, 0);
  };
  
  return (
    <Seek 
      squares={squares} 
      seekToImagePosition={seekToImagePosition} 
      selectedTrack={selectedTrack}
      audioRef={audioRef}
      currentAudioIndex={currentIndex}
      audioSrcs={audioSrcs}
      setCurrentAudioIndex={setCurrentAudioIndex}
    />
  );
};

// Componente para gestionar el guión según la subcarpeta actual
// Componente para controlar el cambio de audio cuando se completa una subcarpeta
const SubfolderAudioController = ({ selectedTrack }) => {
  const { seekToAudio, currentIndex } = useAudio();
  const completedSubfoldersRef = useRef(new Set());

  useEffect(() => {
    if (!selectedTrack || !selectedTrack.subfolderToAudioIndex) return;
    
    completedSubfoldersRef.current.clear();
    
    // Handler para cuando se completa una subcarpeta (cambio por imágenes)
    window.__subfolderCompleteHandler = (completedSubfolder, nextAudioIndex) => {
      if (completedSubfoldersRef.current.has(completedSubfolder)) {
        console.log(`[SubfolderAudioController] Subcarpeta ${completedSubfolder} ya procesada`);
        return;
      }
      
      if (nextAudioIndex !== null && currentIndex !== nextAudioIndex) {
        completedSubfoldersRef.current.add(completedSubfolder);
        console.log(`[SubfolderAudioController] Cambiando de audio ${currentIndex} a ${nextAudioIndex} (por subcarpeta completa)`);
        seekToAudio(nextAudioIndex, 0);
      } else {
        completedSubfoldersRef.current.add(completedSubfolder);
        console.log(`[SubfolderAudioController] No hay siguiente audio o ya estamos en el correcto`);
      }
    };
    
    // Handler para cuando termina un audio automáticamente
    const handleAudioSegmentEnded = (event) => {
      const { currentIndex: endedIndex, nextIndex, isLastAudio } = event.detail;
      
      if (isLastAudio) {
        console.log(`[SubfolderAudioController] Último audio terminó, no cambiar`);
        return;
      }
      
      if (nextIndex !== null && nextIndex !== undefined) {
        console.log(`[SubfolderAudioController] Audio ${endedIndex} terminó automáticamente, cambiando a ${nextIndex}`);
        seekToAudio(nextIndex, 0);
      }
    };
    
    window.addEventListener('audioSegmentEnded', handleAudioSegmentEnded);
    
    return () => {
      window.__subfolderCompleteHandler = null;
      window.removeEventListener('audioSegmentEnded', handleAudioSegmentEnded);
    };
  }, [selectedTrack, seekToAudio, currentIndex]);

  return null;
};

// Componente para monitorear el final del audio y activar salida 2 segundos antes
const AudioEndMonitor = ({ selectedTrack, onExit }) => {
  const { audioRef, currentIndex, isPlaying } = useAudio();
  const exitTriggeredRef = useRef(false);
  const lastAudioIndexRef = useRef(null);
  
  useEffect(() => {
    // Resetear cuando cambia el track
    exitTriggeredRef.current = false;
    lastAudioIndexRef.current = null;
  }, [selectedTrack?.id]);
  
  useEffect(() => {
    if (!audioRef?.current || !selectedTrack || !isPlaying || exitTriggeredRef.current) return;
    
    const audio = audioRef.current;
    const audioSrcs = selectedTrack.srcs || [];
    const audioMetadata = selectedTrack.audioMetadata || [];
    
    // Determinar si es el último audio
    const isLastAudio = currentIndex === audioSrcs.length - 1 || audioSrcs.length === 1;
    
    if (!isLastAudio) {
      // Si no es el último audio, resetear el flag cuando cambia el índice
      if (lastAudioIndexRef.current !== null && lastAudioIndexRef.current !== currentIndex) {
        exitTriggeredRef.current = false;
      }
      lastAudioIndexRef.current = currentIndex;
      return;
    }
    
    lastAudioIndexRef.current = currentIndex;
    
    const checkTime = () => {
      if (!audio || !audio.duration || exitTriggeredRef.current) return;
      
      // Obtener duración del segmento actual (con metadata si está disponible)
      const metadata = audioMetadata[currentIndex];
      let segmentDuration = audio.duration;
      let currentTimeInSegment = audio.currentTime;
      
      if (metadata && metadata.start !== null && metadata.end !== null) {
        segmentDuration = metadata.end - metadata.start;
        currentTimeInSegment = audio.currentTime - metadata.start;
      }
      
      // Calcular tiempo restante
      const timeRemaining = segmentDuration - currentTimeInSegment;
      
      // Si quedan 2 segundos o menos, activar salida
      if (timeRemaining <= 2 && timeRemaining > 0) {
        exitTriggeredRef.current = true;
        console.log('[AudioEndMonitor] Quedan 2 segundos o menos, activando salida');
        onExit();
      }
    };
    
    const handleTimeUpdate = () => checkTime();
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    
    // Verificar inmediatamente
    checkTime();
    
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [audioRef, selectedTrack, currentIndex, isPlaying, onExit]);
  
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
  
  // Obtener el guión: priorizar el de la subcarpeta actual, luego el de la raíz
  const getCurrentGuion = () => {
    if (!selectedTrack || !selectedTrack.guionesBySubfolder) {
      return selectedTrack?.guion;
    }
    
    // Priorizar guión de la subcarpeta actual si existe
    if (currentSubfolder) {
      const subfolderGuion = selectedTrack.guionesBySubfolder[currentSubfolder];
      if (subfolderGuion && subfolderGuion.textos) {
        return subfolderGuion;
      }
    }
    
    // Si no hay guión en la subcarpeta actual, usar el de la raíz
    const rootGuion = selectedTrack.guionesBySubfolder['__root__'];
    if (rootGuion && rootGuion.textos) {
      return rootGuion;
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
      selectedTrack={selectedTrack}
    />
  );
};

const PromptWrapper = ({ textos, typewriterInstanceRef, isPausedByHold, selectedTrack }) => {
  const { audioRef, analyserRef, currentIndex } = useAudio();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  useEffect(() => {
    if (!audioRef?.current) return;
    
    const audio = audioRef.current;
    let animationFrameId = null;
    let lastUpdateTime = 0;
    
    const updateTime = () => {
      const now = Date.now();
      // Limitar actualizaciones a 60fps (cada ~16ms) para suavidad
      if (now - lastUpdateTime < 16) {
        animationFrameId = requestAnimationFrame(updateTime);
        return;
      }
      lastUpdateTime = now;
      
      // Obtener metadata del audio actual si existe
      const audioMetadata = selectedTrack?.audioMetadata?.[currentIndex];
      
      if (audioMetadata && audioMetadata.start !== null && audioMetadata.end !== null) {
        // Calcular tiempo relativo al segmento (desde start hasta end)
        const relativeTime = audio.currentTime - audioMetadata.start;
        const segmentDuration = audioMetadata.end - audioMetadata.start;
        setCurrentTime(Math.max(0, Math.min(relativeTime, segmentDuration)));
        setDuration(segmentDuration);
      } else {
        // Sin metadata, usar tiempo absoluto
        setCurrentTime(audio.currentTime);
        if (audio.duration) setDuration(audio.duration);
      }
      
      // Continuar animación
      animationFrameId = requestAnimationFrame(updateTime);
    };
    
    // Usar timeupdate para sincronización con el audio
    const handleTimeUpdate = () => {
      // El requestAnimationFrame ya está corriendo, no hacer nada extra
    };
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', () => {
      const audioMetadata = selectedTrack?.audioMetadata?.[currentIndex];
      if (audioMetadata && audioMetadata.start !== null && audioMetadata.end !== null) {
        setDuration(audioMetadata.end - audioMetadata.start);
      } else if (audio.duration) {
        setDuration(audio.duration);
      }
    });
    
    // Iniciar animación continua para suavidad (60fps)
    animationFrameId = requestAnimationFrame(updateTime);
    
    // Actualizar inmediatamente
    updateTime();
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', () => {});
    };
  }, [audioRef, selectedTrack, currentIndex]);
  
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
