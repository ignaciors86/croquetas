'use client';

import { useRef, useState } from 'react';
import './Test.scss';

const Test = () => {
  const audioRef1 = useRef<HTMLAudioElement>(null);
  const audioRef2 = useRef<HTMLAudioElement>(null);
  const [isPlaying1, setIsPlaying1] = useState(false);
  const [isPlaying2, setIsPlaying2] = useState(false);

  const handlePlay1 = () => {
    if (audioRef1.current) {
      if (isPlaying1) {
        audioRef1.current.pause();
        setIsPlaying1(false);
      } else {
        // Pausar el otro audio si está sonando
        if (audioRef2.current && !audioRef2.current.paused) {
          audioRef2.current.pause();
          setIsPlaying2(false);
        }
        audioRef1.current.play();
        setIsPlaying1(true);
      }
    }
  };

  const handlePlay2 = () => {
    if (audioRef2.current) {
      if (isPlaying2) {
        audioRef2.current.pause();
        setIsPlaying2(false);
      } else {
        // Pausar el otro audio si está sonando
        if (audioRef1.current && !audioRef1.current.paused) {
          audioRef1.current.pause();
          setIsPlaying1(false);
        }
        audioRef2.current.play();
        setIsPlaying2(true);
      }
    }
  };

  return (
    <div className="test">
      <button onClick={handlePlay1}>
        {isPlaying1 ? 'Pausar Audio 1' : 'Reproducir Audio 1'}
      </button>
      <button onClick={handlePlay2}>
        {isPlaying2 ? 'Pausar Audio 2' : 'Reproducir Audio 2'}
      </button>
      <audio 
        ref={audioRef1} 
        src="/audio/audio1.mp3" 
        onEnded={() => setIsPlaying1(false)}
        onPlay={() => setIsPlaying1(true)}
        onPause={() => setIsPlaying1(false)}
      />
      <audio 
        ref={audioRef2} 
        src="/audio/audio2.mp3" 
        onEnded={() => setIsPlaying2(false)}
        onPlay={() => setIsPlaying2(true)}
        onPause={() => setIsPlaying2(false)}
      />
    </div>
  );
};

export default Test;

