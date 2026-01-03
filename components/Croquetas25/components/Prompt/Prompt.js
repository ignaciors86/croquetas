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
  const lastDurationRef = useRef(0); // Para detectar cambios de duración (cambio de tramo)
  
  // Filtrar textos vacíos
  const validTextos = useMemo(() => {
    return textos.filter(text => text && text.trim() !== '');
  }, [textos]);
  
  // Resetear cuando cambia la duración (cambio de tramo de audio) o los textos
  const lastTextosLengthRef = useRef(validTextos.length);
  useEffect(() => {
    // Si cambian los textos, resetear todo
    if (validTextos.length !== lastTextosLengthRef.current) {
      console.log('[Prompt] Cambio de textos detectado, reseteando');
      setCurrentTextIndex(-1);
      lastTextIndexRef.current = -1;
      setDisplayText('');
      if (timelineRef.current) {
        timelineRef.current.kill();
        timelineRef.current = null;
      }
      lastTextosLengthRef.current = validTextos.length;
    }
    
    // Si cambia la duración (cambio de tramo), resetear
    if (duration !== lastDurationRef.current) {
      if (duration > 0 && lastDurationRef.current > 0) {
        console.log('[Prompt] Cambio de duración detectado (cambio de tramo):', lastDurationRef.current, '->', duration);
        // Resetear el índice de texto cuando cambia el tramo
        setCurrentTextIndex(-1);
        lastTextIndexRef.current = -1;
        setDisplayText('');
        if (timelineRef.current) {
          timelineRef.current.kill();
          timelineRef.current = null;
        }
      }
      lastDurationRef.current = duration;
    }
  }, [duration, validTextos.length]);
  
  // Calcular tiempos para cada texto
  const textTimings = useMemo(() => {
    if (validTextos.length === 0) {
      console.log('[Prompt] No hay textos válidos para calcular timings');
      return [];
    }
    
    if (!duration || duration === 0) {
      console.log('[Prompt] Duration es 0, no se pueden calcular timings');
      return [];
    }
    
    console.log('[Prompt] Calculando timings para', validTextos.length, 'textos, duration:', duration.toFixed(2));
    
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
    console.log('[Prompt] Tiempo total necesario:', totalTimeNeeded.toFixed(2), 'scaleFactor:', scaleFactor.toFixed(4));
    
    // Calcular tiempos de inicio y fin para cada texto
    let accumulatedTime = 0;
    const result = timings.map((timing, index) => {
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
    
    console.log('[Prompt] Timings calculados:', result.map((t, i) => ({
      index: i,
      text: t.text.substring(0, 30),
      start: t.startTime.toFixed(2),
      end: t.endTime.toFixed(2)
    })));
    
    return result;
  }, [validTextos, duration]);
  
  // Determinar qué texto mostrar según el tiempo actual
  useEffect(() => {
    if (textTimings.length === 0) {
      if (validTextos.length > 0) {
        console.log('[Prompt] textTimings vacío pero hay textos válidos, estableciendo índice 0');
        setCurrentTextIndex(0);
      } else {
        console.log('[Prompt] No hay textos válidos');
        setCurrentTextIndex(-1);
      }
      return;
    }
    
    if (!duration || duration === 0) {
      console.log('[Prompt] duration es 0, estableciendo índice 0');
      setCurrentTextIndex(0);
      return;
    }
    
    // Encontrar el texto correspondiente al tiempo actual
    let foundIndex = -1;
    
    // Buscar el texto que corresponde al tiempo actual
    for (let i = 0; i < textTimings.length; i++) {
      const timing = textTimings[i];
      // Incluir el endTime en el rango para evitar gaps
      if (currentTime >= timing.startTime && currentTime <= timing.endTime) {
        foundIndex = i;
        break;
      }
    }
    
    // Si no se encontró ningún texto, verificar si estamos antes del primero o después del último
    if (foundIndex === -1 && textTimings.length > 0) {
      const firstTiming = textTimings[0];
      const lastTiming = textTimings[textTimings.length - 1];
      
      if (currentTime < firstTiming.startTime) {
        // Aún no ha empezado el primer texto
        foundIndex = -1;
      } else if (currentTime > lastTiming.endTime) {
        // Ya pasó el último texto - verificar si han pasado más de 10 segundos
        const timeSinceEnd = currentTime - lastTiming.endTime;
        if (timeSinceEnd > 10) {
          foundIndex = -1; // Ocultar después de 10 segundos
        } else {
          // Mantener el último texto visible hasta que pasen 10 segundos
          foundIndex = textTimings.length - 1;
        }
      } else {
        // Estamos en un gap entre textos
        // Si hay un texto visible actualmente, mantenerlo visible hasta que aparezca el siguiente
        // Solo ocultar si no hay texto visible y estamos en un gap
        if (currentTextIndex >= 0) {
          // Hay un texto visible, mantenerlo hasta que aparezca el siguiente
          // Buscar el siguiente texto que debe aparecer
          let nextTextIndex = -1;
          for (let i = 0; i < textTimings.length; i++) {
            const timing = textTimings[i];
            if (currentTime < timing.startTime) {
              nextTextIndex = i;
              break;
            }
          }
          
          // Mantener el texto actual visible hasta que aparezca el siguiente
          // No ocultar en gaps - el timeline se encargará de la animación de salida
          if (nextTextIndex >= 0) {
            const nextTiming = textTimings[nextTextIndex];
            const timeUntilNext = nextTiming.startTime - currentTime;
            // Si el siguiente texto está a menos de 10 segundos, mantener el actual visible
            // Si está a más de 10 segundos, ocultar el actual
            if (timeUntilNext <= 10) {
              // Mantener el texto actual visible
              foundIndex = currentTextIndex;
            } else {
              // Han pasado más de 10 segundos sin que aparezca el siguiente, ocultar
              foundIndex = -1;
            }
          } else {
            // No hay siguiente texto, mantener el actual visible
            foundIndex = currentTextIndex;
          }
        } else {
          // No hay texto visible, buscar el siguiente
          for (let i = 0; i < textTimings.length; i++) {
            const timing = textTimings[i];
            if (currentTime < timing.startTime) {
              // Este es el siguiente texto que aparecerá, pero aún no ha empezado
              foundIndex = -1;
              break;
            }
          }
        }
      }
    }
    
    // Actualizar solo si cambió el índice
    if (foundIndex !== currentTextIndex) {
      console.log('[Prompt] Cambiando texto:', {
        from: currentTextIndex,
        to: foundIndex,
        currentTime: currentTime.toFixed(2),
        duration: duration.toFixed(2)
      });
      setCurrentTextIndex(foundIndex);
    }
  }, [currentTime, duration, textTimings, validTextos.length]);
  
  // Función auxiliar para actualizar la posición del timeline usando useRef para evitar dependencias
  const updateTimelinePositionRef = useRef((tl, relativeTime, timing, hadPreviousText) => {
    if (!tl) return;
    
    // Si el tiempo relativo es negativo, empezar desde el principio
    if (relativeTime < 0) {
      tl.seek(0);
      if (tl.paused()) {
        tl.play();
      }
      return;
    }
    
    // Calcular tiempos del timeline (en orden cronológico)
    const pauseTime = hadPreviousText ? timing.scaledPauseTime : 0;
    const expandStart = pauseTime;
    const expandEnd = expandStart + timing.scaledHeightTime;
    const fadeInEnd = expandEnd + timing.scaledFadeInTime;
    const readingEnd = fadeInEnd + timing.scaledReadingTime;
    const fadeOutEnd = readingEnd + (timing.scaledFadeOutTime * 0.6);
    const collapseEnd = fadeOutEnd + (timing.scaledFadeOutTime * 0.4);
    
    // Mapear tiempo relativo a tiempo del timeline
    let timelineTime = 0;
    
    if (relativeTime < pauseTime) {
      // Aún en pausa
      timelineTime = (relativeTime / pauseTime) * pauseTime;
    } else if (relativeTime < expandEnd) {
      // Fase de expansión
      const expandProgress = (relativeTime - pauseTime) / timing.scaledHeightTime;
      timelineTime = expandStart + (expandEnd - expandStart) * expandProgress;
    } else if (relativeTime < fadeInEnd) {
      // Fase de fade in
      const fadeInProgress = (relativeTime - expandEnd) / timing.scaledFadeInTime;
      timelineTime = expandEnd + (fadeInEnd - expandEnd) * fadeInProgress;
    } else if (relativeTime < readingEnd) {
      // Fase de lectura (mantener visible) - mantener en fadeInEnd para que se vea el texto
      timelineTime = fadeInEnd;
    } else if (relativeTime < fadeOutEnd) {
      // Fase de fade out del texto
      const fadeOutProgress = (relativeTime - readingEnd) / (timing.scaledFadeOutTime * 0.6);
      // El fade out va desde fadeInEnd hacia fadeOutEnd (el texto se desvanece)
      timelineTime = fadeInEnd + (fadeOutEnd - fadeInEnd) * fadeOutProgress;
    } else {
      // Fase de colapso
      const collapseProgress = (relativeTime - fadeOutEnd) / (timing.scaledFadeOutTime * 0.4);
      timelineTime = fadeOutEnd + (collapseEnd - fadeOutEnd) * collapseProgress;
    }
    
    const seekTime = Math.max(0, Math.min(timelineTime, tl.duration()));
    tl.seek(seekTime);
    // Asegurar que el timeline esté reproduciéndose
    if (tl.paused()) {
      tl.play();
    }
  });
  
  // Crear timeline de GSAP cuando cambia el índice del texto
  useEffect(() => {
    console.log('[Prompt] useEffect timeline - currentTextIndex:', currentTextIndex, 'lastTextIndex:', lastTextIndexRef.current, 'textTimings.length:', textTimings.length);
    
    if (currentTextIndex === -1) {
      // Ocultar prompt si no hay texto
      // IMPORTANTE: Solo ocultar si realmente no hay texto que mostrar
      // No interrumpir animaciones en curso
      if (timelineRef.current) {
        // Si el timeline está activo, dejar que termine su animación de salida
        if (!timelineRef.current.isActive()) {
          timelineRef.current.kill();
          timelineRef.current = null;
        }
      }
      if (promptRef.current && textContainerRef.current && lastTextIndexRef.current >= 0) {
        // Solo ocultar si había un texto visible anteriormente
        console.log('[Prompt] Ocultando prompt (currentTextIndex === -1)');
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
      lastTextIndexRef.current = -1;
      return;
    }
    
    if (!promptRef.current || !textContainerRef.current) {
      console.log('[Prompt] Refs no disponibles, esperando...');
      return;
    }
    
    const timing = textTimings[currentTextIndex];
    if (!timing) {
      console.log('[Prompt] No hay timing para índice:', currentTextIndex);
      return;
    }
    
    const text = timing.text;
    const isNewText = currentTextIndex !== lastTextIndexRef.current;
    const wasVisible = lastTextIndexRef.current >= 0;
    
    console.log('[Prompt] Procesando texto:', {
      currentTextIndex,
      isNewText,
      wasVisible,
      text: text.substring(0, 30),
      timingStart: timing.startTime.toFixed(2),
      timingEnd: timing.endTime.toFixed(2)
    });
    
    // Si es un texto nuevo, crear un nuevo timeline
    if (isNewText) {
      console.log('[Prompt] Creando nuevo timeline para texto:', currentTextIndex);
      // Matar timeline anterior si existe
      if (timelineRef.current) {
        console.log('[Prompt] Matando timeline anterior');
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
            
            // Crear nuevo timeline con TODAS las fases
            // Pausado para sincronizarlo con el tiempo del audio mediante seek
            const tl = gsap.timeline({ paused: true });
            
            const finalHeight = Math.max(targetHeightRef.current, minHeightRef.current || 0);
            
            // FASE 1: Pausa entre textos (si había texto anterior)
            if (wasVisible && previousText && timing.scaledPauseTime > 0) {
              tl.to({}, { duration: timing.scaledPauseTime });
            }
            
            // FASE 2: Expandir el div (entrada)
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
            
            // FASE 3: Fade in del texto
            tl.to(textContainerRef.current, {
              opacity: 1,
              duration: timing.scaledFadeInTime,
              ease: 'power2.out'
            }, '>0');
            
            // FASE 4: Mantener visible durante el tiempo de lectura
            // (no añadir animación, solo tiempo)
            tl.to({}, { duration: timing.scaledReadingTime }, '>0');
            
            // FASE 5: Fade out del texto
            tl.to(textContainerRef.current, {
              opacity: 0,
              duration: timing.scaledFadeOutTime * 0.6,
              ease: 'power2.in'
            }, '>0');
            
            // FASE 6: Colapsar el div (pero mantener altura mínima)
            tl.to(promptRef.current, {
              height: minHeightRef.current || 0,
              y: '100%',
              duration: timing.scaledFadeOutTime * 0.4,
              ease: 'power2.in'
            }, '>0');
            
            // Guardar referencia al timeline
            timelineRef.current = tl;
            lastTextIndexRef.current = currentTextIndex;
            previousTextRef.current = text;
            
            // Sincronizar el timeline con el tiempo actual del audio
            const relativeTime = currentTime - timing.startTime;
            if (relativeTime >= 0) {
              // Calcular el tiempo del timeline correspondiente
              const pauseTime = wasVisible ? timing.scaledPauseTime : 0;
              const expandStart = pauseTime;
              const expandEnd = expandStart + timing.scaledHeightTime;
              const fadeInEnd = expandEnd + timing.scaledFadeInTime;
              const readingEnd = fadeInEnd + timing.scaledReadingTime;
              const fadeOutEnd = readingEnd + (timing.scaledFadeOutTime * 0.6);
              const collapseEnd = fadeOutEnd + (timing.scaledFadeOutTime * 0.4);
              
              let timelineTime = 0;
              if (relativeTime < pauseTime) {
                timelineTime = (relativeTime / pauseTime) * pauseTime;
              } else if (relativeTime < expandEnd) {
                const expandProgress = (relativeTime - pauseTime) / timing.scaledHeightTime;
                timelineTime = expandStart + (expandEnd - expandStart) * expandProgress;
              } else if (relativeTime < fadeInEnd) {
                const fadeInProgress = (relativeTime - expandEnd) / timing.scaledFadeInTime;
                timelineTime = expandEnd + (fadeInEnd - expandEnd) * fadeInProgress;
              } else if (relativeTime < readingEnd) {
                timelineTime = fadeInEnd;
              } else if (relativeTime < fadeOutEnd) {
                const fadeOutProgress = (relativeTime - readingEnd) / (timing.scaledFadeOutTime * 0.6);
                timelineTime = fadeInEnd + (fadeOutEnd - fadeInEnd) * fadeOutProgress;
              } else {
                const collapseProgress = (relativeTime - fadeOutEnd) / (timing.scaledFadeOutTime * 0.4);
                timelineTime = fadeOutEnd + (collapseEnd - fadeOutEnd) * collapseProgress;
              }
              
              const seekTime = Math.max(0, Math.min(timelineTime, tl.duration()));
              tl.seek(seekTime);
              // Reproducir el timeline para que las animaciones funcionen
              if (tl.paused()) {
                tl.play();
              }
            } else {
              tl.seek(0);
              if (tl.paused()) {
                tl.play();
              }
            }
          });
        });
      }
    } else {
      // Mismo texto, solo actualizar posición del timeline
      if (timelineRef.current && timing) {
        const relativeTime = currentTime - timing.startTime;
        const wasVisible = lastTextIndexRef.current >= 0;
        updateTimelinePositionRef.current(timelineRef.current, relativeTime, timing, wasVisible);
      }
    }
  }, [currentTextIndex, currentTime, textTimings, validTextos]);
  
  // Sincronizar el timeline con el tiempo actual del audio
  useEffect(() => {
    if (timelineRef.current && currentTextIndex !== -1) {
      const timing = textTimings[currentTextIndex];
      if (timing) {
        const relativeTime = currentTime - timing.startTime;
        const wasVisible = lastTextIndexRef.current >= 0; // Asumir que si había un texto anterior, estaba visible
        updateTimelinePositionRef.current(timelineRef.current, relativeTime, timing, wasVisible);
      }
    }
  }, [currentTime, currentTextIndex, textTimings]);
  
  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
        timelineRef.current = null;
      }
    };
  }, []);
  
  // Log de depuración eliminado - innecesario en producción

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
