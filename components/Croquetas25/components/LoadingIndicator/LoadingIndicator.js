import React from 'react';
import { useAudio } from '../../context/AudioContext';
import './LoadingIndicator.scss';

const MAINCLASS = 'loadingIndicator';

const LoadingIndicator = () => {
  const { loadingProgress, isLoaded } = useAudio();

  if (isLoaded) return null;

  return (
    <div className={MAINCLASS}>
      <div className={`${MAINCLASS}__bar`}>
        <div 
          className={`${MAINCLASS}__fill`}
          style={{ width: `${loadingProgress}%` }}
        />
      </div>
      <div className={`${MAINCLASS}__text`}>
        {Math.round(loadingProgress)}%
      </div>
    </div>
  );
};

export default LoadingIndicator;
