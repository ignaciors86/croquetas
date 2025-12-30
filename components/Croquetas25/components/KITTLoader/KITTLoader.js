import React from 'react';
import './KITTLoader.scss';

const MAINCLASS = 'kittLoader';

const KITTLoader = ({ fast = false, progress = 0 }) => {
  const totalSegments = 8;
  // Calcular cuántos segmentos deben estar iluminados según el progreso
  const activeSegments = Math.floor((progress / 100) * totalSegments);
  
  return (
    <div className={`${MAINCLASS} ${fast ? `${MAINCLASS}--fast` : ''}`}>
      {[...Array(totalSegments)].map((_, i) => {
        const isActive = i < activeSegments;
        return (
          <div 
            key={i} 
            className={`${MAINCLASS}__segment ${isActive ? `${MAINCLASS}__segment--active` : ''}`}
          />
        );
      })}
    </div>
  );
};

export default KITTLoader;

