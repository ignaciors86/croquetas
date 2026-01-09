'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';
import './Croquetas25.scss';
import { AudioProvider, useAudio } from './context/AudioContext';
import { useTracks } from './hooks/useTracks';
import Intro from './components/Intro/Intro';
import Background from './components/Background/Background';
import AudioAnalyzer from './components/AudioAnalyzer/AudioAnalyzer';
import Seek from './components/Seek/Seek';
import Prompt from './components/Prompt/Prompt';
import BackButton from './components/BackButton/BackButton';
import KITTLoader from './components/KITTLoader/KITTLoader';
import FullscreenButton from './components/FullscreenButton/FullscreenButton';
import { useGallery } from './components/Gallery/Gallery';

const normalizeId = (id) => (id || '').toLowerCase().replace(/\s+/g, '-');

const getTrackIdFromUrl = () => {
    if (typeof window === 'undefined') return null;
    const pathname = window.location.pathname;
    const match = pathname.match(/\/(?:nachitos-de-nochevieja\/)?([^\/]+)$/);
  return match && match[1] && match[1] !== 'nachitos-de-nochevieja' ? match[1] : null;
};

const Croquetas25 = () => {
  const { tracks, isLoading: tracksLoading } = useTracks();
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const urlTrackId = getTrackIdFromUrl();
  const mainTrack = tracks.find(t => {
    if (urlTrackId) {
      return normalizeId(t.id) === normalizeId(urlTrackId) || normalizeId(t.name) === normalizeId(urlTrackId);
    }
    const normalizedName = normalizeId(t.name);
    return normalizedName === 'nachitos-de-nochevieja' || normalizedName.includes('nachitos');
  }) || tracks[0] || null;

  // Determinar el ID de la croqueta activa
  const activeTrackId = mainTrack ? normalizeId(mainTrack.id || mainTrack.name) : (urlTrackId || 'nachitos-de-nochevieja');

  // Cuando se hace clic en cualquier croqueta: establecer selectedTrack y empezar
  const handleCroquetaClick = (track) => {
    setSelectedTrack(track);
    window.history.replaceState({}, '', `/${normalizeId(track.id || track.name)}`);
  };

  // Cuando se hace clic en una croqueta normal: establecer selectedTrack y empezar
  const handleTrackSelect = (track) => {
    handleCroquetaClick(track);
  };

  // Cuando se hace clic en la croqueta activa: establecer selectedTrack y empezar
  const handleStartPlayback = (e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (mainTrack) {
      handleCroquetaClick(mainTrack);
    }
  };

  const handleExit = () => {
    // Ocultar menú primero (si está visible)
    const introContainer = document.getElementById('intro-container');
    if (introContainer) {
      gsap.to(introContainer, {
          opacity: 0,
        duration: 0.3,
          ease: 'power2.in',
          onComplete: () => {
            setSelectedTrack(null);
          setIsPlaying(false);
          window.history.replaceState({}, '', '/');
          // Mostrar menú con fade in
            requestAnimationFrame(() => {
            if (introContainer) {
              gsap.fromTo(introContainer, 
                  { opacity: 0 },
                { opacity: 1, duration: 0.6, ease: 'power2.out', delay: 0.1 }
                );
              }
            });
          }
        });
      } else {
        setSelectedTrack(null);
      setIsPlaying(false);
      window.history.replaceState({}, '', '/');
    }
  };
  
  return (
    <div className="croquetas25">
      {/* Diagonales siempre de fondo (solo cuando NO hay track seleccionado) */}
      {!selectedTrack && (
        <Background 
          selectedTrack={null}
          analyserRef={null}
          dataArrayRef={null}
          currentAudioIndex={null}
          isInitialized={false}
          showOnlyDiagonales={true}
        />
      )}

      {/* ESTADO 1: Cargando tracks */}
      {tracksLoading && (
        <div className="croquetas25__loading-layer">
          <div className="croquetas25__loading-content">
            <KITTLoader fast={false} progress={0} />
          </div>
        </div>
      )}

      {/* ESTADO 2: Mostrar croquetas */}
      {!selectedTrack && !tracksLoading && (
        <div className="croquetas25__intro-container" id="intro-container">
        <Intro 
          tracks={tracks} 
          onTrackSelect={handleTrackSelect}
          onStartPlayback={handleStartPlayback}
          selectedTrackId={activeTrackId}
          isDirectUri={!!urlTrackId}
          isVisible={true}
          keepBlurVisible={false}
        />
        </div>
      )}

      {/* ESTADO 3: Reproduciendo colección */}
      {selectedTrack && (
        <AudioProvider track={selectedTrack}>
          <CroquetasContent 
            track={selectedTrack}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            onExit={handleExit}
          />
        </AudioProvider>
      )}
    </div>
  );
};

const CroquetasContent = ({ track, isPlaying, setIsPlaying, onExit }) => {
  const { audios, guion: guionPath, play, pause: pauseAudio, isLoaded, loadingProgress, audioRef, analyserRef, dataArrayRef, timeDataArrayRef, currentIndex, seekToAudio, getTotalElapsed, getTotalDuration, audioDurations } = useAudio();
  
  // Manejar resize para recalcular todo
  React.useEffect(() => {
    const handleResize = () => {
      // Forzar recálculo de canvas y elementos
      // Los componentes individuales ya tienen sus propios listeners de resize
      // pero podemos disparar un evento personalizado si es necesario
      window.dispatchEvent(new Event('croquetas-resize'));
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
      
      return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);
  
  // Refs para manejar pause/play con clic y mantener pulsado
  const wasPlayingBeforeHoldRef = React.useRef(false);
  const holdTimeoutRef = React.useRef(null);
  const isHoldingRef = React.useRef(false);
  const mouseDownTimeRef = React.useRef(0);
  // Cargar imágenes desde el principio (audioStarted = true para que se carguen inmediatamente)
  // El parámetro audioStarted controla cuándo se cargan las imágenes, no cuándo se muestran
  const { isLoading: imagesLoading, preloadProgress: imagesProgress, seekToImagePosition } = useGallery(track, null, null, currentIndex, true);
  const [loadingFadedOut, setLoadingFadedOut] = useState(false);
  const [autoPlayAttempted, setAutoPlayAttempted] = useState(false);
  const [seekLoading, setSeekLoading] = useState(false);
  const [elementsVisible, setElementsVisible] = useState(false); // Controla si los elementos de reproducción son visibles
  const imageCycleCompletedRef = React.useRef(false); // Flag para rastrear si el ciclo de imágenes se completó
  const shouldExitRef = React.useRef(false); // Flag para controlar salida después de último tramo
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSegmentTime, setCurrentSegmentTime] = useState(0); // Tiempo relativo al tramo actual
  const [currentSegmentDuration, setCurrentSegmentDuration] = useState(0); // Duración del tramo actual
  const [activeSegment, setActiveSegment] = useState(null); // Segmento activo actual
  const [guion, setGuion] = useState(null);
  const onTriggerCallbackRef = React.useRef(null);
  const onVoiceCallbackRef = React.useRef(null);
  
  // Refs para elementos a animar en entrada/salida
  const playbackElementsRef = React.useRef(null);
  const backgroundContainerRef = React.useRef(null);

  const combinedProgress = Math.round((imagesProgress + loadingProgress) / 2);
  const audioReady = isLoaded && loadingProgress >= 50;
  // Asegurar que el loader se muestre si las imágenes aún no han empezado a cargar
  // o si están cargando pero el progreso es bajo
  const imagesReady = !imagesLoading && imagesProgress >= 10;
  const everythingReady = audioReady && imagesReady;
  // Mostrar loading hasta que los elementos de reproducción sean visibles (con fade)
  // El loader se oculta cuando isPlaying es true Y elementsVisible es true
  const showLoading = (!elementsVisible || !isPlaying || seekLoading) && (!loadingFadedOut || !elementsVisible);

  // Log de depuración eliminado - innecesario en producción

  // Cuando todo esté listo: ocultar loading e iniciar play automáticamente
  // Solo si el usuario ya hizo clic en la croqueta (selectedTrack está establecido)
  const playRef = React.useRef(play);
  React.useEffect(() => {
    playRef.current = play;
  }, [play]);

  // Ref para evitar múltiples ejecuciones del play automático
  const playAttemptedRef = React.useRef(false);
  
  React.useEffect(() => {
    // Resetear el flag si everythingReady cambia a false (nuevo track)
    if (!everythingReady) {
      playAttemptedRef.current = false;
      return;
    }
    
    if (everythingReady && !autoPlayAttempted && !isPlaying && !playAttemptedRef.current) {
      playAttemptedRef.current = true; // Marcar inmediatamente para evitar doble ejecución
      setAutoPlayAttempted(true);
      setLoadingFadedOut(true);
      
      // Iniciar play inmediatamente (el usuario ya hizo clic en la croqueta)
      playRef.current().then(() => {
        setIsPlaying(true);
        // Mostrar elementos de reproducción con animación suave
        setElementsVisible(true);
        
        // Animar entrada de elementos suavemente (inverso de salida)
        requestAnimationFrame(() => {
          const enterTimeline = gsap.timeline();
          
          // Mostrar canvas de cuadrados/círculos con borde
          const borderSquaresCanvas = document.querySelector('.border-squares-synthesizer');
          if (borderSquaresCanvas) {
            gsap.set(borderSquaresCanvas, { opacity: 0 });
            enterTimeline.to(borderSquaresCanvas, {
              opacity: 1,
        duration: 0.6,
              ease: 'power2.out'
      }, 0);
    }
    
          // Mostrar canvas de diagonales dinámicas
          const diagonalCanvas = document.querySelector('.diagonal-synthesizer');
          if (diagonalCanvas) {
            gsap.set(diagonalCanvas, { opacity: 0 });
            enterTimeline.to(diagonalCanvas, {
              opacity: 1,
        duration: 0.6,
              ease: 'power2.out'
            }, 0.1);
          }
          
          // Mostrar elementos de reproducción
          if (playbackElementsRef.current) {
            gsap.set(playbackElementsRef.current, { opacity: 0 });
            enterTimeline.to(playbackElementsRef.current, {
            opacity: 1, 
              duration: 0.5,
            ease: 'power2.out' 
            }, 0.2);
          }
        });
      }).catch((err) => {
        // Si falla, el efecto de reintento se encargará
        playAttemptedRef.current = false;
      });
    }
  }, [everythingReady, autoPlayAttempted, isPlaying]);
  
  // Reintentar play si falló (usando estado en lugar de setTimeout)
  const [playRetryCount, setPlayRetryCount] = React.useState(0);
  React.useEffect(() => {
    if (!isPlaying && autoPlayAttempted && everythingReady && playRetryCount < 1 && !playAttemptedRef.current) {
      // Solo reintentar una vez si falló
      playAttemptedRef.current = true;
      const retryId = setTimeout(() => {
        if (!isPlaying && everythingReady) {
          playRef.current().then(() => {
            setIsPlaying(true);
            setElementsVisible(true);
            setPlayRetryCount(0);
          }).catch(() => {
            setPlayRetryCount(prev => prev + 1);
            playAttemptedRef.current = false;
          });
        }
      }, 500);
      return () => clearTimeout(retryId);
    }
  }, [isPlaying, autoPlayAttempted, everythingReady, playRetryCount]);

  // Determinar el segmento activo basado en currentIndex
  React.useEffect(() => {
    if (!track?.segments || track.segments.length === 0) {
      setActiveSegment(null);
      return;
    }
    
    const segment = track.segments.find(s => s.audioIndex === currentIndex);
    if (segment) {
      setActiveSegment(segment);
      
      // Actualizar duración del segmento
      if (audioDurations && audioDurations.length > currentIndex) {
        const segmentDuration = audioDurations[currentIndex] || 0;
        if (segmentDuration > 0) {
          setCurrentSegmentDuration(segmentDuration);
            }
          }
        } else {
      setActiveSegment(null);
    }
  }, [track, currentIndex, audioDurations]);

  // Cargar guion del segmento activo
  React.useEffect(() => {
    if (!activeSegment) {
      // Si no hay segmento activo, intentar usar el guion del track
      if (track?.guion) {
        const loadGuion = async () => {
          try {
            const response = await fetch(track.guion);
            if (!response.ok) throw new Error(`Failed to load guion: ${response.status}`);
            const text = await response.text();
            const exportMatch = text.match(/export\s+default\s+({[\s\S]*?});?\s*$/m);
            if (exportMatch) {
              const objStr = exportMatch[1];
              const guionData = new Function('return ' + objStr)();
              setGuion(guionData);
      } else {
              setGuion(null);
            }
      } catch (error) {
            setGuion(null);
          }
        };
        loadGuion();
        } else {
        setGuion(null);
      }
      return;
    }

    // Cargar guion del segmento activo
    if (!activeSegment.guion) {
      setGuion(null);
      return;
    }
    
    const loadGuion = async () => {
      try {
        const response = await fetch(activeSegment.guion);
        if (!response.ok) {
          throw new Error(`Failed to load guion: ${response.status}`);
        }
        const text = await response.text();
        
        const exportMatch = text.match(/export\s+default\s+({[\s\S]*?});?\s*$/m);
        if (exportMatch) {
          const objStr = exportMatch[1];
          try {
            const guionData = new Function('return ' + objStr)();
            setGuion(guionData);
          } catch (parseError) {
            setGuion(null);
          }
      } else {
          setGuion(null);
        }
      } catch (error) {
        setGuion(null);
      }
    };

    loadGuion();
  }, [activeSegment, track]);

  // Actualizar duration cuando el audio esté cargado
  const getTotalDurationRef = React.useRef(getTotalDuration);
  React.useEffect(() => {
    getTotalDurationRef.current = getTotalDuration;
  }, [getTotalDuration]);

  React.useEffect(() => {
    if (isLoaded && audioDurations && audioDurations.length > 0) {
      const totalDuration = getTotalDurationRef.current();
      if (totalDuration > 0 && totalDuration !== duration) {
        setDuration(totalDuration);
      }
    }
  }, [isLoaded, audioDurations.length, duration]);

  // Actualizar currentTime y tiempo del tramo actual continuamente
  const getTotalElapsedRef = React.useRef(getTotalElapsed);
  React.useEffect(() => {
    getTotalElapsedRef.current = getTotalElapsed;
  }, [getTotalElapsed]);

  // Actualizar currentTime y tiempo del tramo actual
  // IMPORTANTE: Actualizar siempre, incluso cuando no está reproduciendo, para que el seek funcione
  React.useEffect(() => {
    const updateTime = () => {
      const elapsed = getTotalElapsedRef.current();
      if (elapsed >= 0) {
        setCurrentTime(prev => {
          // Solo actualizar si cambió significativamente (más de 50ms) para evitar renders innecesarios
          if (Math.abs(elapsed - prev) > 0.05) {
            return elapsed;
          }
          return prev;
        });
        
        // Calcular tiempo relativo al tramo actual
        if (audioDurations && audioDurations.length > 0 && currentIndex >= 0) {
          const previousTime = audioDurations
            .slice(0, currentIndex)
            .reduce((sum, dur) => sum + dur, 0);
          const segmentTime = Math.max(0, elapsed - previousTime);
          const segmentDuration = audioDurations[currentIndex] || 0;
          
          setCurrentSegmentTime(segmentTime);
          if (segmentDuration > 0 && segmentDuration !== currentSegmentDuration) {
            setCurrentSegmentDuration(segmentDuration);
          }
        }
      } else if (!isPlaying) {
        // Si no está reproduciendo y no hay tiempo, resetear
        setCurrentTime(0);
        setCurrentSegmentTime(0);
      }
    };

    // Actualizar inmediatamente
    updateTime();

    // Si está reproduciendo, actualizar cada 100ms para suavidad
    // Si no está reproduciendo, no necesitamos actualizar continuamente
    if (isPlaying) {
      const interval = setInterval(updateTime, 100);
      return () => clearInterval(interval);
    }
  }, [isPlaying, currentIndex, audioDurations, currentSegmentDuration]);
  
  // Handlers para pause/play con clic y mantener pulsado
  const handleMouseDown = React.useCallback((e) => {
    // Ignorar clics en elementos interactivos
    const target = e.target;
    if (target.closest('button, a, input, [role="button"], .croquetas25__seek, .croquetas25__back-button, .seek, .seek__progressContainer, .seek__progressBar')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    
    // Guardar el estado de reproducción actual ANTES de cualquier cambio
    wasPlayingBeforeHoldRef.current = isPlaying;
    isHoldingRef.current = true;
    mouseDownTimeRef.current = Date.now();
    
    // Si está reproduciendo, pausar inmediatamente (para modo "mantener pulsado")
    if (isPlaying) {
      pauseAudio().then(() => {
        setIsPlaying(false);
      }).catch(() => {});
    }
    
    // Configurar timeout para detectar si es un clic simple o mantener pulsado
    holdTimeoutRef.current = setTimeout(() => {
      // Si después de 200ms sigue pulsado, es "mantener pulsado" (story mode)
      // Ya pausamos arriba, así que no hacer nada más
    }, 200);
  }, [isPlaying, pauseAudio, setIsPlaying]);
  
  const handleMouseUp = React.useCallback((e) => {
    // Ignorar clics en elementos interactivos
    const target = e.target;
    if (target.closest('button, a, input, [role="button"], .croquetas25__seek, .croquetas25__back-button, .seek, .seek__progressContainer, .seek__progressBar')) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    const wasHolding = isHoldingRef.current;
    const wasPlayingBefore = wasPlayingBeforeHoldRef.current;
    const holdDuration = Date.now() - mouseDownTimeRef.current;
    
    isHoldingRef.current = false;
    
    // Limpiar timeout si existe
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    
    // Si fue un hold (más de 200ms), reanudar al soltar si estaba reproduciendo antes
    if (wasHolding && holdDuration > 200 && wasPlayingBefore) {
      // Reanudar solo si estaba reproduciendo antes
      play().then(() => {
        setIsPlaying(true);
      }).catch(() => {});
    } else if (wasHolding && holdDuration <= 200) {
      // Si fue un clic rápido (menos de 200ms), toggle play/pause
      if (wasPlayingBefore) {
        // Estaba reproduciendo, ahora está pausado (por el mousedown), reanudar (toggle)
        play().then(() => {
          setIsPlaying(true);
        }).catch(() => {});
    } else {
        // Estaba pausado, iniciar reproducción
        play().then(() => {
          setIsPlaying(true);
        }).catch(() => {});
      }
    }
  }, [isPlaying, pauseAudio, play, setIsPlaying]);
  
  // Función para salir con animaciones suaves
  const handleExitWithAnimation = React.useCallback(async () => {
    // 1. Fade del volumen a 0
    await pauseAudio();
    
    // 2. Ocultar elementos suavemente (Prompt, Imágenes, cuadrados/círculos con borde)
    const exitTimeline = gsap.timeline();
    
    // Ocultar Prompt
    const promptElement = document.querySelector('.prompt');
    if (promptElement) {
      exitTimeline.to(promptElement, {
        opacity: 0,
        duration: 0.5,
        ease: 'power2.in'
      }, 0); // Empezar al mismo tiempo
    }
    
    // Ocultar imágenes (cuadrados con imagen)
    const imageSquares = document.querySelectorAll('.background__square');
    if (imageSquares.length > 0) {
      exitTimeline.to(imageSquares, {
        opacity: 0,
        scale: '+=0.3', // Continuar creciendo mientras desaparecen
        duration: 0.6,
        ease: 'power2.in',
        stagger: 0.05
      }, 0.1); // Empezar ligeramente después
    }
    
    // Ocultar canvas de cuadrados/círculos con borde (sintetizador)
    const borderSquaresCanvas = document.querySelector('.border-squares-synthesizer');
    if (borderSquaresCanvas) {
      exitTimeline.to(borderSquaresCanvas, {
        opacity: 0,
        duration: 0.5,
        ease: 'power2.in'
      }, 0.2);
    }
    
    // Ocultar canvas de diagonales dinámicas
    const diagonalCanvas = document.querySelector('.diagonal-synthesizer');
    if (diagonalCanvas) {
      exitTimeline.to(diagonalCanvas, {
            opacity: 0,
        duration: 0.5,
        ease: 'power2.in'
      }, 0.2);
    }
    
    // Ocultar elementos de reproducción (Seek, AudioAnalyzer, BackButton, FullscreenButton)
    if (playbackElementsRef.current) {
      exitTimeline.to(playbackElementsRef.current, {
            opacity: 0,
        duration: 0.4,
        ease: 'power2.in'
      }, 0.3);
    }
    
    // Esperar a que termine la animación
    await exitTimeline;
    
    // 3. Llamar a onExit (esto mostrará el menú)
    onExit();
  }, [pauseAudio, onExit]);
  
  // Escuchar evento de ciclo completo de imágenes
  React.useEffect(() => {
    const handleImageCycleCompleted = (event) => {
      const { segmentKey, audioIndex } = event.detail;
      // Marcar que el ciclo se completó
      imageCycleCompletedRef.current = true;
      
      // Verificar si es el último tramo
      const isLastSegment = track?.segments && track.segments.length > 0 
        ? audioIndex === track.segments.length - 1 
        : audioIndex === (audios?.length || 1) - 1;
      
      if (isLastSegment) {
        // Es el último tramo, hacer fade out y volver al menú
        shouldExitRef.current = true;
        pauseAudio().then(() => {
          setIsPlaying(false);
      });
    } else {
        // No es el último tramo, cambiar al siguiente con fade
        const nextIndex = audioIndex + 1;
        seekToAudio(nextIndex, 0).then(() => {
          setIsPlaying(true);
        });
      }
    };
    
    window.addEventListener('imageCycleCompleted', handleImageCycleCompleted);
    return () => {
      window.removeEventListener('imageCycleCompleted', handleImageCycleCompleted);
    };
  }, [track?.segments?.length, audios?.length, pauseAudio, seekToAudio, setIsPlaying]);
  
  // Volver al menú cuando se pausa después de completar el último tramo
  React.useEffect(() => {
    if (shouldExitRef.current && !isPlaying) {
      // Usar handleExitWithAnimation en lugar de setTimeout
      handleExitWithAnimation().then(() => {
        shouldExitRef.current = false;
      });
    }
  }, [isPlaying, handleExitWithAnimation]);
  
  // Resetear flag cuando cambia el tramo
  React.useEffect(() => {
    imageCycleCompletedRef.current = false;
    // Resetear también el flag en window
    if (typeof window !== 'undefined' && window.__imageCycleCompleted) {
      window.__imageCycleCompleted[currentIndex] = false;
    }
  }, [currentIndex]);
  
  // Handlers para touch (móvil)
  const handleTouchStart = React.useCallback((e) => {
    handleMouseDown(e);
  }, [handleMouseDown]);
  
  const handleTouchEnd = React.useCallback((e) => {
    handleMouseUp(e);
  }, [handleMouseUp]);
  
  // Generar className basado en el nombre de la colección
  const collectionClassName = track ? normalizeId(track.name || track.id || '') : '';
  
  return (
    <div 
      className={collectionClassName ? `croquetas25-collection-${collectionClassName}` : ''}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
    <div ref={backgroundContainerRef}>
    <Background 
        selectedTrack={track}
      analyserRef={analyserRef}
      dataArrayRef={dataArrayRef}
        currentAudioIndex={currentIndex}
        isInitialized={!!analyserRef?.current}
        showOnlyDiagonales={false}
        onTriggerCallbackRef={onTriggerCallbackRef}
        onVoiceCallbackRef={onVoiceCallbackRef}
        pause={pauseAudio}
        isPlaying={isPlaying}
      />
    </div>

      {showLoading && (
        <div className="croquetas25__loading-layer">
          <div className="croquetas25__loading-content">
            <KITTLoader fast={combinedProgress >= 95} progress={combinedProgress} />
          </div>
        </div>
      )}

      {isPlaying && elementsVisible && (
        <div className="croquetas25__playback-elements" ref={playbackElementsRef}>
    <AudioAnalyzer 
      audioRef={audioRef}
      analyserRef={analyserRef}
      dataArrayRef={dataArrayRef}
            timeDataArrayRef={timeDataArrayRef}
            currentAudioIndex={currentIndex}
            onBeat={(intensity, shouldBeSolid) => {
              if (onTriggerCallbackRef.current) {
                onTriggerCallbackRef.current('beat', { intensity, shouldBeSolid });
              }
            }}
            onVoice={(intensity, voiceEnergy) => {
              if (onVoiceCallbackRef.current) {
                onVoiceCallbackRef.current(intensity, voiceEnergy);
              }
            }}
          />

    <Seek 
            selectedTrack={track}
      audioRef={audioRef}
      currentAudioIndex={currentIndex}
            audioSrcs={audios}
            seekToImagePosition={seekToImagePosition}
            setCurrentAudioIndex={(index, time = 0) => seekToAudio(index, time)}
            onSeekLoading={setSeekLoading}
          />

          {guion && (
    <Prompt 
              textos={guion.textos || []} 
              currentTime={currentSegmentTime} // Usar tiempo relativo al tramo actual
              duration={currentSegmentDuration} // Usar duración del tramo actual
      analyser={analyserRef?.current}
    />
          )}

          <BackButton onBack={handleExitWithAnimation} audioRef={audioRef} />
          <FullscreenButton />
        </div>
      )}

    </div>
  );
};

export default Croquetas25;
