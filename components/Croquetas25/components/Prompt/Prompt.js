import React, { useEffect, useRef, useState, useMemo } from 'react';
import './Prompt.scss';
import { gsap } from 'gsap';
import KITT from '../KITT/KITT';

const MAINCLASS = 'prompt';

// Calcular tiempo de lectura basado en longitud del texto
const calculateReadingTime = (text) => {
  if (!text || text.trim() === '') return 0;
  const words = text.trim().split(/\s+/).length;
  const readingSpeed = 200; // palabras por minuto
  const timeInSeconds = (words / readingSpeed) * 60;
  // Mínimo 2 segundos, máximo 8 segundos para textos muy largos
  return Math.max(2, Math.min(8, timeInSeconds));
};

const Prompt = ({ textos = [], currentTime = 0, duration = 0, typewriterInstanceRef: externalTypewriterRef, isPaused = false, analyser = null }) => {
  const promptRef = useRef(null);
  const textContainerRef = useRef(null);
  const [currentTextIndex, setCurrentTextIndex] = useState(-1);
  const [displayText, setDisplayText] = useState('');
  const timelineRef = useRef(null);
  const lastTextIndexRef = useRef(-1);
  const targetHeightRef = useRef(0);
  const previousTextRef = useRef('');
  const minHeightRef = useRef(0); // Altura mínima cuando hay una línea de texto
  const kittRef = useRef(null);
  
  // Filtrar textos vacíos
  const validTextos = useMemo(() => {
    return textos.filter(text => text && text.trim() !== '');
  }, [textos]);
  
  // Calcular tiempos para cada texto
  const textTimings = useMemo(() => {
    if (validTextos.length === 0) {
      return [];
    }
    
    if (!duration || duration === 0) {
      return [];
    }
    
    // Calcular tiempo total necesario para todos los textos
    let totalTimeNeeded = 0;
    const timings = validTextos.map((text, index) => {
      const readingTime = calculateReadingTime(text);
      const fadeOutTime = 0.6; // tiempo de fade out del texto
      const fadeInTime = 0.8; // tiempo de fade in del texto después de levantar el div
      const heightAnimationTime = 0.5; // tiempo de animación de altura
      const pauseBetweenTexts = 0.6; // pausa entre textos
      const totalTime = heightAnimationTime + fadeInTime + readingTime + fadeOutTime + pauseBetweenTexts;
      totalTimeNeeded += totalTime;
      
      return {
        text,
        index,
        readingTime,
        fadeOutTime,
        fadeInTime,
        heightAnimationTime,
        pauseBetweenTexts,
        totalTime,
        startTime: 0,
        heightEndTime: 0,
        fadeInEndTime: 0,
        readingEndTime: 0,
        endTime: 0
      };
    });
    
    // Si el tiempo necesario es mayor que la duración, escalar proporcionalmente
    const scaleFactor = duration / totalTimeNeeded;
    
    // Calcular tiempos de inicio y fin para cada texto
    let accumulatedTime = 0;
    return timings.map((timing, index) => {
      const scaledHeightTime = timing.heightAnimationTime * scaleFactor;
      const scaledFadeInTime = timing.fadeInTime * scaleFactor;
      const scaledReadingTime = timing.readingTime * scaleFactor;
      const scaledFadeOutTime = timing.fadeOutTime * scaleFactor;
      const scaledPauseTime = index < timings.length - 1 ? timing.pauseBetweenTexts * scaleFactor : 0;
      
      const startTime = accumulatedTime;
      const heightEndTime = startTime + scaledHeightTime;
      const fadeInEndTime = heightEndTime + scaledFadeInTime;
      const readingEndTime = fadeInEndTime + scaledReadingTime;
      const endTime = readingEndTime + scaledFadeOutTime + scaledPauseTime;
      
      accumulatedTime = endTime;
      
      return {
        ...timing,
        startTime,
        heightEndTime,
        fadeInEndTime,
        readingEndTime,
        endTime,
        scaledHeightTime,
        scaledFadeInTime,
        scaledReadingTime,
        scaledFadeOutTime,
        scaledPauseTime
      };
    });
  }, [validTextos, duration]);
  
  // Determinar qué texto mostrar según el tiempo actual
  useEffect(() => {
    if (textTimings.length === 0) {
      if (validTextos.length > 0) {
        setCurrentTextIndex(0);
      } else {
        setCurrentTextIndex(-1);
      }
      return;
    }
    
    if (!duration || duration === 0) {
      setCurrentTextIndex(0);
      return;
    }
    
    // Encontrar el texto correspondiente al tiempo actual
    let foundIndex = -1;
    for (let i = 0; i < textTimings.length; i++) {
      const timing = textTimings[i];
      if (currentTime >= timing.startTime && currentTime < timing.endTime) {
        foundIndex = i;
        break;
      }
    }
    
    // Si estamos después del último texto, mostrar el último
    if (foundIndex === -1 && textTimings.length > 0) {
      const lastTiming = textTimings[textTimings.length - 1];
      if (currentTime >= lastTiming.endTime) {
        foundIndex = textTimings.length - 1;
      } else if (currentTime < textTimings[0].startTime) {
        foundIndex = 0;
      }
    }
    
    setCurrentTextIndex(foundIndex);
  }, [currentTime, duration, textTimings, validTextos.length]);
  
  // Función auxiliar para actualizar la posición del timeline usando useRef para evitar dependencias
  const updateTimelinePositionRef = useRef((tl, relativeTime, timing, hadPreviousText) => {
    if (!tl) return;
    
    if (relativeTime < 0) {
      tl.pause(0);
      return;
    }
    
    // Calcular tiempos del timeline
    const fadeOutDuration = timing.scaledFadeOutTime * 0.6;
    const collapseDuration = timing.scaledFadeOutTime * 0.4;
    const collapseStart = timing.scaledFadeOutTime * 0.2; // Solapado con fade out
    
    const fadeOutEnd = fadeOutDuration;
    const collapseEnd = collapseStart + collapseDuration;
    const pauseEnd = collapseEnd + timing.scaledPauseTime;
    const expandEnd = pauseEnd + timing.scaledHeightTime;
    const fadeInEnd = expandEnd + timing.scaledFadeInTime;
    
    // Mapear tiempo relativo a tiempo del timeline
    let timelineTime = 0;
    
    if (relativeTime < timing.scaledHeightTime + timing.scaledFadeInTime) {
      // Fase de entrada
      const entryProgress = relativeTime / (timing.scaledHeightTime + timing.scaledFadeInTime);
      if (hadPreviousText) {
        timelineTime = pauseEnd + (expandEnd - pauseEnd) * entryProgress;
        if (relativeTime > timing.scaledHeightTime) {
          const fadeInProgress = (relativeTime - timing.scaledHeightTime) / timing.scaledFadeInTime;
          timelineTime = expandEnd + (fadeInEnd - expandEnd) * fadeInProgress;
        }
      } else {
        timelineTime = (expandEnd - pauseEnd) * entryProgress;
        if (relativeTime > timing.scaledHeightTime) {
          const fadeInProgress = (relativeTime - timing.scaledHeightTime) / timing.scaledFadeInTime;
          timelineTime = expandEnd + (fadeInEnd - expandEnd) * fadeInProgress;
        }
      }
    } else if (relativeTime < timing.readingEndTime) {
      // Fase de lectura (mantener visible)
      timelineTime = fadeInEnd;
    } else {
      // Fase de salida (fade out + colapso)
      const exitProgress = (relativeTime - timing.readingEndTime) / (timing.scaledFadeOutTime + timing.scaledPauseTime);
      if (exitProgress < 0.6) {
        // Fade out del texto (60% del tiempo)
        const textFadeProgress = exitProgress / 0.6;
        timelineTime = fadeInEnd - (fadeInEnd - fadeOutEnd) * textFadeProgress;
      } else {
        // Colapsar el div (40% del tiempo) - pero solo hasta altura mínima
        const collapseProgress = (exitProgress - 0.6) / 0.4;
        timelineTime = collapseStart + (collapseEnd - collapseStart) * collapseProgress;
        // Asegurar que la altura no baje de la mínima
        if (promptRef.current && minHeightRef.current > 0) {
          const currentHeight = promptRef.current.offsetHeight || promptRef.current.scrollHeight;
          if (currentHeight < minHeightRef.current) {
            gsap.set(promptRef.current, { height: minHeightRef.current });
          }
        }
      }
    }
    
    tl.seek(Math.max(0, Math.min(timelineTime, tl.duration())));
    tl.play();
  });
  
  // Crear timeline de GSAP cuando cambia el índice del texto
  useEffect(() => {
    if (currentTextIndex === -1) {
      // Ocultar prompt si no hay texto
      if (timelineRef.current) {
        timelineRef.current.kill();
        timelineRef.current = null;
      }
      if (promptRef.current && textContainerRef.current) {
        gsap.to([promptRef.current, textContainerRef.current], {
          opacity: 0,
          height: 0,
          duration: 0.3,
          ease: 'power2.in',
          onComplete: () => {
            setDisplayText('');
          }
        });
      }
      return;
    }
    
    if (!promptRef.current || !textContainerRef.current) {
      return;
    }
    
    const timing = textTimings[currentTextIndex];
    if (!timing) {
      return;
    }
    
    const text = timing.text;
    const isNewText = currentTextIndex !== lastTextIndexRef.current;
    const wasVisible = lastTextIndexRef.current >= 0;
    
    // Si es un texto nuevo, crear un nuevo timeline
    if (isNewText) {
      // Matar timeline anterior si existe
      if (timelineRef.current) {
        timelineRef.current.kill();
        timelineRef.current = null;
      }
      
      // Si había un texto visible, ocultarlo completamente primero
      if (wasVisible && previousTextRef.current && textContainerRef.current) {
        // Ocultar texto anterior inmediatamente
        gsap.to(textContainerRef.current, {
          opacity: 0,
          duration: 0.3,
          ease: 'power2.in',
          overwrite: true
        });
        
        // Colapsar a altura mínima
        const collapseHeight = Math.max(minHeightRef.current || 0, 0);
        gsap.to(promptRef.current, {
          height: collapseHeight,
          y: '100%',
          duration: 0.3,
          ease: 'power2.in',
          overwrite: true,
          onComplete: () => {
            // Después de ocultar, crear el nuevo timeline
            createNewTimeline();
          }
        });
      } else {
        // No había texto visible, crear timeline directamente
        createNewTimeline();
      }
      
      function createNewTimeline() {
        if (!promptRef.current || !textContainerRef.current) return;
        
        // Guardar el texto anterior
        const previousText = previousTextRef.current;
        
        // Establecer el nuevo texto
        setDisplayText(text);
        
        // Esperar a que React renderice el nuevo texto
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!promptRef.current || !textContainerRef.current) return;
            
            // Renderizar fuera de la vista para calcular altura real
            gsap.set(promptRef.current, {
              height: 'auto',
              opacity: 1,
              y: '100%',
              visibility: 'visible'
            });
            gsap.set(textContainerRef.current, { opacity: 0 });
            
            // Forzar reflow para calcular altura real
            const targetHeight = promptRef.current.offsetHeight || promptRef.current.scrollHeight;
            targetHeightRef.current = targetHeight;
            
            // Calcular altura mínima si es la primera vez
            if (minHeightRef.current === 0) {
              const testText = text.split('\n')[0] || text;
              const originalText = textContainerRef.current.textContent;
              const originalDisplay = textContainerRef.current.style.display;
              
              textContainerRef.current.textContent = testText;
              textContainerRef.current.style.display = 'block';
              
              const measureHeight = () => {
                if (promptRef.current) {
                  gsap.set(promptRef.current, { height: 'auto', visibility: 'visible' });
                  const singleLineHeight = promptRef.current.offsetHeight || promptRef.current.scrollHeight;
                  minHeightRef.current = singleLineHeight;
                  
                  textContainerRef.current.textContent = originalText;
                  textContainerRef.current.style.display = originalDisplay;
                }
              };
              
              requestAnimationFrame(() => {
                requestAnimationFrame(measureHeight);
              });
            }
            
            // Crear nuevo timeline
            const tl = gsap.timeline({ paused: true });
            
            // Pausa entre textos (si había texto anterior)
            if (wasVisible && previousText && timing.scaledPauseTime > 0) {
              tl.to({}, { duration: timing.scaledPauseTime });
            }
            
            // Expandir el div
            const finalHeight = Math.max(targetHeightRef.current, minHeightRef.current || 0);
            tl.set(promptRef.current, {
              height: minHeightRef.current || 0,
              y: '100%',
              opacity: 1,
              visibility: 'visible'
            }, '>0');
            
            tl.to(promptRef.current, {
              height: finalHeight,
              y: 0,
              duration: timing.scaledHeightTime,
              ease: 'power2.out'
            }, '>0');
            
            // Fade in del texto
            tl.to(textContainerRef.current, {
              opacity: 1,
              duration: timing.scaledFadeInTime,
              ease: 'power2.out'
            }, '>0');
            
            // Guardar referencia al timeline
            timelineRef.current = tl;
            lastTextIndexRef.current = currentTextIndex;
            previousTextRef.current = text;
            
            // Actualizar progreso según el tiempo actual
            const relativeTime = currentTime - timing.startTime;
            updateTimelinePositionRef.current(tl, relativeTime, timing, wasVisible);
          });
        });
      }
    } else {
      // Mismo texto, solo actualizar posición del timeline
      if (timelineRef.current) {
        const relativeTime = currentTime - timing.startTime;
        const wasVisible = lastTextIndexRef.current >= 0;
        updateTimelinePositionRef.current(timelineRef.current, relativeTime, timing, wasVisible);
      }
    }
  }, [currentTextIndex, currentTime, textTimings, validTextos]);
  
  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
        timelineRef.current = null;
      }
    };
  }, []);
  
  if (currentTextIndex === -1 && !displayText) {
    return null;
  }

  return (
    <div ref={promptRef} className={MAINCLASS} style={{ minHeight: minHeightRef.current > 0 ? `${minHeightRef.current}px` : 'auto' }}>
      {analyser && (
        <div ref={kittRef} className={`${MAINCLASS}__kitt`}>
          <KITT analyser={analyser} />
        </div>
      )}
      <div ref={textContainerRef} className={`${MAINCLASS}__text`}>
        {displayText}
      </div>
    </div>
  );
};

export default Prompt;
