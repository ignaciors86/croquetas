'use client';

import { useState, useRef } from 'react';
import './Croquetas.scss';
import Test from './Test';

const Croquetas = () => {
  const [currentAudio, setCurrentAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const audio1 = '/audio/audio1.mp3';
  const audio2 = '/audio/audio2.mp3';

  const handlePlayAudio = (audioPath: string) => {
    if (audioRef.current) {
      // Si es el mismo audio, no hacer nada o reiniciar
      if (currentAudio === audioPath) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      } else {
        // Cambiar a otro audio
        setCurrentAudio(audioPath);
        audioRef.current.src = audioPath;
        audioRef.current.load();
        audioRef.current.play();
      }
    }
  };

  return (
    <div className="croquetas">
      <Test />
      <div className="croquetas__controls">
        <button 
          onClick={() => handlePlayAudio(audio1)}
          className="croquetas__button"
        >
          Reproducir Audio 1
        </button>
        <button 
          onClick={() => handlePlayAudio(audio2)}
          className="croquetas__button"
        >
          Reproducir Audio 2
        </button>
      </div>
      <audio ref={audioRef} />
    </div>
  );
};

export default Croquetas;

