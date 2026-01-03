'use client';

import React, { useState, useRef, useEffect } from 'react';
import './Seek.scss';

const MAINCLASS = 'seek';

const Seek = ({ squares, seekToImagePosition, selectedTrack, audioRef, currentAudioIndex, audioSrcs, setCurrentAudioIndex }) => {
  const [progress, setProgress] = useState(0);
  const [audioDurations, setAudioDurations] = useState([]);
  const progressBarRef = useRef(null);

  // Calcular duraciones de los audios usando la estructura de segments
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    
    // NUEVA LÓGICA: Usar selectedTrack.segments si está disponible
    let audioSources = [];
    if (selectedTrack?.segments && selectedTrack.segments.length > 0) {
      // Usar los audios de los segments
      audioSources = selectedTrack.segments
        .filter(segment => segment.audioSrc)
        .map(segment => segment.audioSrc);
    } else if (audioSrcs && audioSrcs.length > 0) {
      // Fallback: usar audioSrcs directamente
      audioSources = audioSrcs;
    }
    
    if (audioSources.length === 0) {
      setAudioDurations([]);
      return;
    }

    const loadDurations = async () => {
      const durations = [];
      for (let i = 0; i < audioSources.length; i++) {
        const src = audioSources[i];
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
  }, [selectedTrack, audioSrcs]);

  useEffect(() => {
    if (!audioRef?.current) return;

    const updateProgress = () => {
      const audio = audioRef.current;
      if (!audio || !audio.duration) return;
      
      // Si hay múltiples audios, calcular el progreso total
      if (audioDurations.length > 1) {
        let totalElapsed = 0;
        // Sumar duraciones de audios anteriores
        for (let i = 0; i < currentAudioIndex; i++) {
          totalElapsed += audioDurations[i] || 0;
        }
        // Agregar el tiempo del audio actual
        totalElapsed += audio.currentTime;
        
        // Calcular duración total
        const totalDuration = audioDurations.reduce((sum, dur) => sum + dur, 0);
        
        if (totalDuration > 0) {
          const progressPercent = (totalElapsed / totalDuration) * 100;
          setProgress(Math.max(0, Math.min(100, progressPercent)));
        }
      } else {
        // Si solo hay un audio, usar el cálculo simple
        const progressPercent = (audio.currentTime / audio.duration) * 100;
        setProgress(Math.max(0, Math.min(100, progressPercent)));
      }
    };

    const handleTimeUpdate = () => updateProgress();

    const audio = audioRef.current;
    audio.addEventListener('timeupdate', handleTimeUpdate);

    updateProgress();

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [audioRef, currentAudioIndex, audioDurations]);

  const handleProgressClick = async (e) => {
    if (!audioRef?.current || !progressBarRef.current) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    // Soporte para eventos táctiles y de mouse
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0));
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    
    // NUEVA LÓGICA: Usar selectedTrack.segments si está disponible
    if (selectedTrack?.segments && selectedTrack.segments.length > 0) {
      // Calcular duraciones de los segments
      const segmentDurations = selectedTrack.segments
        .map(segment => {
          const audioIndex = segment.audioIndex;
          return audioDurations[audioIndex] || 0;
        });
      
      const totalDuration = segmentDurations.reduce((sum, dur) => sum + dur, 0);
      if (totalDuration === 0) {
        // Fallback: usar duración del audio actual
        const audio = audioRef.current;
        if (!audio.duration) return;
        const targetTime = (percentage / 100) * audio.duration;
        if (seekToImagePosition && selectedTrack) {
          seekToImagePosition(targetTime, selectedTrack);
        }
        if (setCurrentAudioIndex) {
          setCurrentAudioIndex(currentAudioIndex, targetTime);
        } else {
          audio.currentTime = targetTime;
        }
        return;
      }
      
      // Calcular el tiempo total correspondiente al click
      const targetTotalTime = (percentage / 100) * totalDuration;
      
      // Determinar qué segmento corresponde y el tiempo dentro de ese segmento
      let accumulatedTime = 0;
      let targetSegment = null;
      let targetTime = 0;
      
      for (let i = 0; i < selectedTrack.segments.length; i++) {
        const segment = selectedTrack.segments[i];
        const duration = segmentDurations[i] || 0;
        if (targetTotalTime <= accumulatedTime + duration) {
          targetSegment = segment;
          targetTime = targetTotalTime - accumulatedTime;
          break;
        }
        accumulatedTime += duration;
      }
      
      if (targetSegment) {
        const targetAudioIndex = targetSegment.audioIndex;
        
        // Usar seekToAudio para cambio con fade
        if (setCurrentAudioIndex) {
          console.log(`[Seek] Cambiando a segmento ${targetSegment.audioIndex} (audio ${targetAudioIndex}), tiempo: ${targetTime}`);
          setCurrentAudioIndex(targetAudioIndex, targetTime);
        } else {
          // Fallback: solo hacer seek si no hay función
          const audio = audioRef.current;
          if (audio && audio.readyState >= 2) {
            audio.currentTime = targetTime;
          }
        }
        
        // Usar tiempos auxiliares para reposicionar imágenes ANTES de hacer seek del audio
        if (seekToImagePosition && selectedTrack) {
          seekToImagePosition(targetTotalTime, selectedTrack);
        }
      }
    } else if (audioDurations.length > 1) {
      // Fallback: lógica antigua para múltiples audios
      const totalDuration = audioDurations.reduce((sum, dur) => sum + dur, 0);
      if (totalDuration === 0) return;
      
      // Calcular el tiempo total correspondiente al click
      const targetTotalTime = (percentage / 100) * totalDuration;
      
      // Determinar qué audio corresponde y el tiempo dentro de ese audio
      let accumulatedTime = 0;
      let targetAudioIndex = 0;
      let targetTime = 0;
      
      for (let i = 0; i < audioDurations.length; i++) {
        const duration = audioDurations[i] || 0;
        if (targetTotalTime <= accumulatedTime + duration) {
          targetAudioIndex = i;
          targetTime = targetTotalTime - accumulatedTime;
          break;
        }
        accumulatedTime += duration;
      }
      
      // Usar seekToAudio para cambio con fade
      if (setCurrentAudioIndex) {
        console.log(`[Seek] Cambiando de audio ${currentAudioIndex} a ${targetAudioIndex}, tiempo: ${targetTime}`);
        setCurrentAudioIndex(targetAudioIndex, targetTime);
      } else {
        // Fallback: solo hacer seek si no hay función
        const audio = audioRef.current;
        if (audio && audio.readyState >= 2) {
        audio.currentTime = targetTime;
        }
      }
      
      // Usar tiempos auxiliares para reposicionar imágenes ANTES de hacer seek del audio
      if (seekToImagePosition && selectedTrack) {
        seekToImagePosition(targetTotalTime, selectedTrack);
      }
    } else {
      // Si solo hay un audio, usar el cálculo simple
      const audio = audioRef.current;
      if (!audio.duration) return;
      
      const targetTime = (percentage / 100) * audio.duration;
      
      // Usar tiempos auxiliares para reposicionar imágenes ANTES de hacer seek del audio
      if (seekToImagePosition && selectedTrack) {
        seekToImagePosition(targetTime, selectedTrack);
      }
      
      // Hacer seek en el audio
      if (setCurrentAudioIndex) {
        setCurrentAudioIndex(currentAudioIndex, targetTime);
      } else {
      audio.currentTime = targetTime;
      }
    }
  };


  // Calcular posiciones y colores de cada tramo
  const getSegmentColors = (index) => {
    // Paleta de colores para diferentes tramos
    const colors = [
      { color1: '#FF0080', color2: '#FF8000' }, // Rosa/Naranja
      { color1: '#FFFF00', color2: '#00FF00' }, // Amarillo/Verde
      { color1: '#0080FF', color2: '#8000FF' }, // Azul/Morado
      { color1: '#00FFFF', color2: '#FF00FF' }, // Cyan/Magenta
      { color1: '#FFB347', color2: '#FFD700' }, // Naranja/Dorado
      { color1: '#C0C0C0', color2: '#FFFFFF' }, // Plata/Blanco
      { color1: '#FF6B6B', color2: '#4ECDC4' }, // Rojo/Verde agua
      { color1: '#95E1D3', color2: '#F38181' }, // Verde agua/Rosa
    ];
    return colors[index % colors.length];
  };

  const segments = React.useMemo(() => {
    // NUEVA LÓGICA: Usar selectedTrack.segments si está disponible
    if (selectedTrack?.segments && selectedTrack.segments.length > 0) {
      // Calcular duraciones totales de los segments
      const segmentDurations = selectedTrack.segments
        .map(segment => {
          // Buscar la duración correspondiente al audioIndex del segmento
          const audioIndex = segment.audioIndex;
          return audioDurations[audioIndex] || 0;
        });
      
      const totalDuration = segmentDurations.reduce((sum, dur) => sum + dur, 0);
      if (totalDuration === 0) {
        // Fallback: usar duración del audio actual si está disponible
        if (audioRef?.current?.duration) {
          return [{
            index: 0,
            startPercent: 0,
            widthPercent: 100,
            audioIndex: 0,
            ...getSegmentColors(0)
          }];
        }
        return [];
      }
      
      const segmentsData = [];
      let accumulatedTime = 0;
      
      selectedTrack.segments.forEach((segment, index) => {
        const duration = segmentDurations[index] || 0;
        if (duration > 0) {
          const startPercent = (accumulatedTime / totalDuration) * 100;
          const widthPercent = (duration / totalDuration) * 100;
          const colors = getSegmentColors(index);
          
          segmentsData.push({
            index,
            audioIndex: segment.audioIndex,
            startPercent,
            widthPercent,
            ...colors
          });
          
          accumulatedTime += duration;
        }
      });
      
      return segmentsData;
    }
    
    // Fallback: lógica antigua usando audioDurations directamente
    if (!audioDurations || audioDurations.length === 0) {
      // Si solo hay un audio, mostrar un solo segmento
      if (audioRef?.current?.duration) {
        return [{
          index: 0,
          startPercent: 0,
          widthPercent: 100,
          audioIndex: 0,
          ...getSegmentColors(0)
        }];
      }
      return [];
    }
    
    const totalDuration = audioDurations.reduce((sum, dur) => sum + dur, 0);
    if (totalDuration === 0) return [];
    
    const segmentsData = [];
    let accumulatedTime = 0;
    
    audioDurations.forEach((duration, index) => {
      const startPercent = (accumulatedTime / totalDuration) * 100;
      const widthPercent = (duration / totalDuration) * 100;
      const colors = getSegmentColors(index);
      
      segmentsData.push({
        index,
        audioIndex: index,
        startPercent,
        widthPercent,
        ...colors
      });
      
      accumulatedTime += duration;
    });
    
    return segmentsData;
  }, [audioDurations, audioRef, selectedTrack]);

  const handleTouchStart = (e) => {
    e.preventDefault(); // Prevenir scroll mientras se toca
    handleProgressClick(e);
  };

  const handleTouchEnd = (e) => {
    e.preventDefault();
  };

  return (
    <div className={MAINCLASS}>
      <div className={`${MAINCLASS}__progressContainer`}>
        <div 
          className={`${MAINCLASS}__progressBar`}
          ref={progressBarRef}
          onClick={handleProgressClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'none', userSelect: 'none' }}
        >
          {/* Segmentos de fondo con diferentes colores */}
          {segments.map((segment) => (
            <div
              key={segment.index}
              className={`${MAINCLASS}__segment`}
              style={{
                left: `${segment.startPercent}%`,
                width: `${segment.widthPercent}%`,
                '--segment-color-1': segment.color1,
                '--segment-color-2': segment.color2
              }}
            />
          ))}
          <div 
            className={`${MAINCLASS}__progressFill`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default Seek;
