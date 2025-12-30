'use client';

import React, { useState, useRef, useEffect } from 'react';
import './Seek.scss';

const MAINCLASS = 'seek';

const Seek = ({ squares, seekToImagePosition, selectedTrack, audioRef, currentAudioIndex, audioSrcs, setCurrentAudioIndex }) => {
  const [progress, setProgress] = useState(0);
  const [audioDurations, setAudioDurations] = useState([]);
  const progressBarRef = useRef(null);

  // Calcular duraciones de los audios
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    if (!audioSrcs || audioSrcs.length === 0) {
      setAudioDurations([]);
      return;
    }

    const loadDurations = async () => {
      const durations = [];
      for (let i = 0; i < audioSrcs.length; i++) {
        const src = audioSrcs[i];
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
  }, [audioSrcs]);

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
    
    // Si hay múltiples audios, determinar qué audio corresponde al click
    if (audioDurations.length > 1) {
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
      
      // Si el audio objetivo es diferente al actual, cambiar de audio
      if (targetAudioIndex !== currentAudioIndex && setCurrentAudioIndex) {
        console.log(`[Seek] Cambiando de audio ${currentAudioIndex} a ${targetAudioIndex}, tiempo: ${targetTime}`);
        const audio = audioRef.current;
        const wasPlaying = !audio.paused;
        
        // Cambiar el índice - esto activará el useEffect que cambiará el src
        setCurrentAudioIndex(targetAudioIndex);
        
        // Esperar a que el audio se cargue y luego hacer seek
        // Usar un pequeño delay para asegurar que el useEffect haya cambiado el src
        setTimeout(() => {
          if (audioRef?.current) {
            const newAudio = audioRef.current;
            // Esperar a que el audio esté listo antes de hacer seek
            const handleCanSeek = () => {
              newAudio.removeEventListener('canplay', handleCanSeek);
              newAudio.removeEventListener('loadeddata', handleCanSeek);
              newAudio.currentTime = targetTime;
              if (wasPlaying) {
                newAudio.play().catch(() => {});
              }
            };
            
            newAudio.addEventListener('canplay', handleCanSeek);
            newAudio.addEventListener('loadeddata', handleCanSeek);
            
            // Si ya está listo, hacer seek inmediatamente
            if (newAudio.readyState >= 2) {
              newAudio.currentTime = targetTime;
              if (wasPlaying) {
                newAudio.play().catch(() => {});
              }
            }
          }
        }, 50);
      } else {
        // Mismo audio, solo hacer seek
        const audio = audioRef.current;
        audio.currentTime = targetTime;
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
      audio.currentTime = targetTime;
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
    if (!audioDurations || audioDurations.length === 0) {
      // Si solo hay un audio, mostrar un solo segmento
      if (audioRef?.current?.duration) {
        return [{
          index: 0,
          startPercent: 0,
          widthPercent: 100,
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
        startPercent,
        widthPercent,
        ...colors
      });
      
      accumulatedTime += duration;
    });
    
    return segmentsData;
  }, [audioDurations, audioRef]);

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
