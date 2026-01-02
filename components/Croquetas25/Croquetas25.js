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
  const { audios, guion, play, isLoaded, loadingProgress, audioRef, analyserRef, dataArrayRef, timeDataArrayRef, currentIndex, seekToAudio } = useAudio();
  // Cargar imágenes desde el principio (audioStarted = true para que se carguen inmediatamente)
  // El parámetro audioStarted controla cuándo se cargan las imágenes, no cuándo se muestran
  const { isLoading: imagesLoading, preloadProgress: imagesProgress, seekToImagePosition } = useGallery(track, null, null, currentIndex, true);
  const [loadingFadedOut, setLoadingFadedOut] = useState(false);
  const [autoPlayAttempted, setAutoPlayAttempted] = useState(false);
  const onTriggerCallbackRef = React.useRef(null);
  const onVoiceCallbackRef = React.useRef(null);

  const combinedProgress = Math.round((imagesProgress + loadingProgress) / 2);
  const audioReady = isLoaded && loadingProgress >= 50;
  const imagesReady = !imagesLoading && imagesProgress >= 10;
  const everythingReady = audioReady && imagesReady;
  const showLoading = !loadingFadedOut && (!audioReady || !imagesReady);

  // Log de depuración
  React.useEffect(() => {
    console.log('[CroquetasContent] Estado de carga:', {
      isLoaded,
      loadingProgress,
      audioReady,
      imagesLoading,
      imagesProgress,
      imagesReady,
      everythingReady,
      autoPlayAttempted,
      isPlaying
    });
  }, [isLoaded, loadingProgress, audioReady, imagesLoading, imagesProgress, imagesReady, everythingReady, autoPlayAttempted, isPlaying]);

  // Cuando todo esté listo: ocultar loading e iniciar play automáticamente
  // Solo si el usuario ya hizo clic en la croqueta (selectedTrack está establecido)
  React.useEffect(() => {
    if (everythingReady && !autoPlayAttempted && !isPlaying) {
      console.log('[CroquetasContent] Todo listo, iniciando play...');
      setAutoPlayAttempted(true);
      setLoadingFadedOut(true);
      
      // Iniciar play inmediatamente (el usuario ya hizo clic en la croqueta)
      play().then(() => {
        console.log('[CroquetasContent] Play iniciado correctamente');
        setIsPlaying(true);
      }).catch((err) => {
        console.log('[CroquetasContent] Error en play, reintentando...', err);
        // Si falla, reintentar una vez más después de un breve delay
      setTimeout(() => {
          play().then(() => {
            console.log('[CroquetasContent] Play iniciado en reintento');
            setIsPlaying(true);
          }).catch((err2) => {
            console.log('[CroquetasContent] Error en reintento de play', err2);
          });
        }, 300);
      });
    }
  }, [everythingReady, autoPlayAttempted, isPlaying, play]);

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
            setCurrentAudioIndex={(index) => seekToAudio(index, 0)}
          />

          {guion && (
            <Prompt textos={guion.textos || []} />
          )}

          <BackButton onBack={onExit} />
        </>
      )}
    </>
  );
};

export default Croquetas25;
