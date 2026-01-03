import React, { forwardRef } from 'react';
import './Croqueta.scss';

const MAINCLASS = 'croqueta';

// Formas de croquetas - reutilizables desde la portada
const CroquetaShape1 = ({ className }) => (
  <svg 
    className={className}
    viewBox="0 0 200 120" 
    preserveAspectRatio="xMidYMid meet"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M 20 60 
         Q 15 40, 20 25 
         Q 25 15, 40 18 
         Q 60 22, 80 20 
         Q 100 18, 120 25 
         Q 140 32, 155 40 
         Q 170 48, 175 60 
         Q 180 72, 175 85 
         Q 170 98, 160 100 
         Q 150 102, 140 100 
         Q 130 98, 120 95 
         Q 110 92, 100 88 
         Q 90 84, 80 80 
         Q 70 76, 60 72 
         Q 50 68, 40 65 
         Q 30 62, 22 60 
         Q 20 60, 20 60 Z"
      fill="currentColor"
      fillOpacity="0"
      pointerEvents="all"
    />
    <path
      d="M 20 60 
         Q 15 40, 20 25 
         Q 25 15, 40 18 
         Q 60 22, 80 20 
         Q 100 18, 120 25 
         Q 140 32, 155 40 
         Q 170 48, 175 60 
         Q 180 72, 175 85 
         Q 170 98, 160 100 
         Q 150 102, 140 100 
         Q 130 98, 120 95 
         Q 110 92, 100 88 
         Q 90 84, 80 80 
         Q 70 76, 60 72 
         Q 50 68, 40 65 
         Q 30 62, 22 60 
         Q 20 60, 20 60 Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    />
    <path d="M 50 30 Q 47 28, 50 26 Q 53 28, 50 30" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    <path d="M 90 25 Q 87 23, 90 21 Q 93 23, 90 25" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    <path d="M 130 35 Q 127 33, 130 31 Q 133 33, 130 35" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    <path d="M 70 75 Q 67 73, 70 71 Q 73 73, 70 75" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    <path d="M 110 80 Q 107 78, 110 76 Q 113 78, 110 80" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

const CroquetaShape2 = ({ className }) => (
  <svg 
    className={className}
    viewBox="0 0 200 120" 
    preserveAspectRatio="xMidYMid meet"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M 30 60 
         Q 25 35, 35 20 
         Q 45 10, 65 15 
         Q 85 20, 100 18 
         Q 115 16, 130 22 
         Q 145 28, 160 35 
         Q 175 42, 170 60 
         Q 165 78, 155 90 
         Q 145 102, 130 100 
         Q 115 98, 100 95 
         Q 85 92, 70 88 
         Q 55 84, 45 75 
         Q 35 66, 30 60 Z"
      fill="currentColor"
      fillOpacity="0"
      pointerEvents="all"
    />
    <path
      d="M 30 60 
         Q 25 35, 35 20 
         Q 45 10, 65 15 
         Q 85 20, 100 18 
         Q 115 16, 130 22 
         Q 145 28, 160 35 
         Q 175 42, 170 60 
         Q 165 78, 155 90 
         Q 145 102, 130 100 
         Q 115 98, 100 95 
         Q 85 92, 70 88 
         Q 55 84, 45 75 
         Q 35 66, 30 60 Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    />
    <path d="M 55 28 Q 52 26, 55 24 Q 58 26, 55 28" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    <path d="M 85 22 Q 82 20, 85 18 Q 88 20, 85 22" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    <path d="M 115 30 Q 112 28, 115 26 Q 118 28, 115 30" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    <path d="M 145 38 Q 142 36, 145 34 Q 148 36, 145 38" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    <path d="M 65 72 Q 62 70, 65 68 Q 68 70, 65 72" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    <path d="M 95 78 Q 92 76, 95 74 Q 98 76, 95 78" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    <path d="M 125 82 Q 122 80, 125 78 Q 128 80, 125 82" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

// Función para generar diferentes formas de croquetas
// Usa el índice para seleccionar la variación de forma genérica
const getCroquetaSVG = (index) => {
  const variations = [
    <CroquetaShape1 key={`croqueta-${index}-1`} className={`${MAINCLASS}__svg`} />,
    <CroquetaShape2 key={`croqueta-${index}-2`} className={`${MAINCLASS}__svg`} />
  ];
  
  return variations[index % variations.length];
};

const Croqueta = forwardRef(({ 
  index = 0, 
  text = '', 
  onClick, 
  rotation = 0,
  className = '',
  style = {}
}, ref) => {
  return (
    <button
      ref={ref}
      className={`${MAINCLASS} ${className}`}
      onClick={onClick}
      style={{
        ...style,
        ...(rotation !== 0 && { '--rotation': `${rotation}deg` })
      }}
    >
      <div 
        className={`${MAINCLASS}__svgWrapper`}
        onClick={onClick}
      >
        {getCroquetaSVG(index)}
      </div>
      {text && (
        <span className={`${MAINCLASS}__text`}>
          {text}
        </span>
      )}
    </button>
  );
});

Croqueta.displayName = 'Croqueta';

export default Croqueta;
