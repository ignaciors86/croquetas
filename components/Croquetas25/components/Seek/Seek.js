'use client';

import React, { useState, useRef, useEffect } from 'react';
import './Seek.scss';

const MAINCLASS = 'seek';

const Seek = ({ squares, seekToImagePosition, selectedTrack, audioRef, currentAudioIndex, audioSrcs }) => {
  const [progress, setProgress] = useState(0);
  const [audioDurations, setAudioDurations] = useState([]);
  const progressBarRef = useRef(null);

  // Calcular duraciones de los audios
  useEffect(() => {
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
      
      const progressPercent = (audio.currentTime / audio.duration) * 100;
      setProgress(Math.max(0, Math.min(100, progressPercent)));
    };

    const handleTimeUpdate = () => updateProgress();

    const audio = audioRef.current;
    audio.addEventListener('timeupdate', handleTimeUpdate);

    updateProgress();

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [audioRef, currentAudioIndex]);

  const handleProgressClick = async (e) => {
    if (!audioRef?.current || !progressBarRef.current) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    
    const audio = audioRef.current;
    if (!audio.duration) return;
    
    const targetTime = (percentage / 100) * audio.duration;
    
    // Usar tiempos auxiliares para reposicionar imágenes ANTES de hacer seek del audio
    if (seekToImagePosition && selectedTrack) {
      seekToImagePosition(targetTime, selectedTrack);
    }
    
    // Hacer seek en el audio
    audio.currentTime = targetTime;
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

  return (
    <div className={MAINCLASS}>
      <div className={`${MAINCLASS}__progressContainer`}>
        <div 
          className={`${MAINCLASS}__progressBar`}
          ref={progressBarRef}
          onClick={handleProgressClick}
          style={{}}
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
