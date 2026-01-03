'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
    console.log('[Croquetas25] Clic en croqueta:', track.name);
    setSelectedTrack(track);
    window.history.replaceState({}, '', `/${normalizeId(track.id || track.name)}`);
  };

  // Cuando se hace clic en una croqueta normal: establecer selectedTrack y empezar
  const handleTrackSelect = (track) => {
    console.log('[Croquetas25] Seleccionando croqueta normal:', track.name);
    handleCroquetaClick(track);
  };

  // Cuando se hace clic en la croqueta activa: establecer selectedTrack y empezar
  const handleStartPlayback = (e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (mainTrack) {
      console.log('[Croquetas25] Iniciando reproducción de:', mainTrack.name);
      handleCroquetaClick(mainTrack);
    }
  };

  const handleExit = () => {
    setSelectedTrack(null);
    setIsPlaying(false);
    window.history.replaceState({}, '', '/');
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
        <Intro 
          tracks={tracks} 
          onTrackSelect={handleTrackSelect}
          onStartPlayback={handleStartPlayback}
          selectedTrackId={activeTrackId}
          isDirectUri={!!urlTrackId}
          isVisible={true}
          keepBlurVisible={false}
        />
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
  // Cargar imágenes desde el principio (audioStarted = true para que se carguen inmediatamente)
  // El parámetro audioStarted controla cuándo se cargan las imágenes, no cuándo se muestran
  const { isLoading: imagesLoading, preloadProgress: imagesProgress, seekToImagePosition } = useGallery(track, null, null, currentIndex, true);
  const [loadingFadedOut, setLoadingFadedOut] = useState(false);
  const [autoPlayAttempted, setAutoPlayAttempted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSegmentTime, setCurrentSegmentTime] = useState(0); // Tiempo relativo al tramo actual
  const [currentSegmentDuration, setCurrentSegmentDuration] = useState(0); // Duración del tramo actual
  const [activeSegment, setActiveSegment] = useState(null); // Segmento activo actual
  const [guion, setGuion] = useState(null);
  const onTriggerCallbackRef = React.useRef(null);
  const onVoiceCallbackRef = React.useRef(null);

  const combinedProgress = Math.round((imagesProgress + loadingProgress) / 2);
  const audioReady = isLoaded && loadingProgress >= 50;
  const imagesReady = !imagesLoading && imagesProgress >= 10;
  const everythingReady = audioReady && imagesReady;
  const showLoading = !loadingFadedOut && (!audioReady || !imagesReady);

  // Log de depuración eliminado - innecesario en producción

  // Cuando todo esté listo: ocultar loading e iniciar play automáticamente
  // Solo si el usuario ya hizo clic en la croqueta (selectedTrack está establecido)
  const playRef = React.useRef(play);
  React.useEffect(() => {
    playRef.current = play;
  }, [play]);

  React.useEffect(() => {
    if (everythingReady && !autoPlayAttempted && !isPlaying) {
      console.log('[CroquetasContent] Todo listo, iniciando play...');
      setAutoPlayAttempted(true);
      setLoadingFadedOut(true);
      
      // Iniciar play inmediatamente (el usuario ya hizo clic en la croqueta)
      playRef.current().then(() => {
        console.log('[CroquetasContent] Play iniciado correctamente');
        setIsPlaying(true);
      }).catch((err) => {
        console.log('[CroquetasContent] Error en play, reintentando...', err);
        // Si falla, reintentar una vez más después de un breve delay
        setTimeout(() => {
          playRef.current().then(() => {
            console.log('[CroquetasContent] Play iniciado en reintento');
            setIsPlaying(true);
          }).catch((err2) => {
            console.log('[CroquetasContent] Error en reintento de play', err2);
          });
              }, 300);
      });
    }
  }, [everythingReady, autoPlayAttempted, isPlaying]);

  // Timeout de seguridad: solo ocultar loading después de 15 segundos, NO forzar play
  // El play solo debe ocurrir cuando el usuario hace clic
  React.useEffect(() => {
    const safetyTimer = setTimeout(() => {
      console.log('[CroquetasContent] Timeout de seguridad: ocultando loading', {
  loadingFadedOut,
        isPlaying,
        autoPlayAttempted,
        audioReady,
        imagesReady,
      imagesProgress,
        loadingProgress
      });
      if (!loadingFadedOut) {
              setLoadingFadedOut(true);
      }
      // NO forzar play aquí - solo ocultar el loading
    }, 15000);
    return () => clearTimeout(safetyTimer);
  }, [loadingFadedOut, isPlaying, autoPlayAttempted, audioReady, imagesReady, imagesProgress, loadingProgress]);

  // Determinar el segmento activo basado en currentIndex
  React.useEffect(() => {
    if (!track?.segments || track.segments.length === 0) {
      setActiveSegment(null);
      return;
    }
    
    const segment = track.segments.find(s => s.audioIndex === currentIndex);
    if (segment) {
      console.log('[CroquetasContent] Segmento activo cambiado a:', currentIndex, segment);
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
              console.log('[CroquetasContent] Guion cargado del track:', guionData);
              setGuion(guionData);
            } else {
              setGuion(null);
            }
          } catch (error) {
            console.error('[CroquetasContent] Error cargando guion del track:', error);
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
      console.log('[CroquetasContent] No hay guion para el segmento activo');
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
            console.log('[CroquetasContent] Guion cargado para segmento', activeSegment.audioIndex, ':', guionData, 'textos:', guionData?.textos?.length);
            setGuion(guionData);
          } catch (parseError) {
            console.error('[CroquetasContent] Error parseando objeto del guion:', parseError);
            setGuion(null);
          }
    } else {
          console.warn('[CroquetasContent] No se encontró export default en el guion');
          setGuion(null);
        }
      } catch (error) {
        console.error('[CroquetasContent] Error cargando guion:', error, 'path:', activeSegment.guion);
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
        console.log('[CroquetasContent] Actualizando duration:', totalDuration);
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
  
  return (
    <>
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

      {showLoading && (
        <div className="croquetas25__loading-layer">
          <div className="croquetas25__loading-content">
            <KITTLoader fast={combinedProgress >= 95} progress={combinedProgress} />
          </div>
        </div>
      )}

      {isPlaying && (
        <>
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
          />

          {guion && (
    <Prompt 
              textos={guion.textos || []} 
              currentTime={currentSegmentTime} // Usar tiempo relativo al tramo actual
              duration={currentSegmentDuration} // Usar duración del tramo actual
      analyser={analyserRef?.current}
    />
          )}

          <BackButton onBack={onExit} />
        </>
      )}
    </>
  );
};

export default Croquetas25;
