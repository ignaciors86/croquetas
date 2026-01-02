import React, { useEffect, useRef, useState, useMemo } from 'react';
import './Prompt.scss';
import { gsap } from 'gsap';
import KITT from '../KITT/KITT';

const MAINCLASS = 'prompt';

// Calcular tiempo de lectura basado en longitud del texto
// Velocidad de lectura promedio: 200-250 palabras por minuto
// Asumimos ~5 caracteres por palabra en español
const calculateReadingTime = (text) => {
  if (!text || text.trim() === '') return 0;
  const words = text.trim().split(/\s+/).length;
  const readingSpeed = 200; // palabras por minuto
  const timeInSeconds = (words / readingSpeed) * 60;
  // Mínimo 2 segundos, máximo 8 segundos para textos muy largos
  return Math.max(2, Math.min(8, timeInSeconds));
};

// Calcular tiempo de escritura basado en longitud
const calculateTypingTime = (text) => {
  if (!text || text.trim() === '') return 0;
  const chars = text.length;
  const typingSpeed = 15; // caracteres por segundo (velocidad más lenta para evitar parpadeos)
  return chars / typingSpeed;
};

const Prompt = ({ textos = [], currentTime = 0, duration = 0, typewriterInstanceRef: externalTypewriterRef, isPaused = false, analyser = null }) => {
  const promptRef = useRef(null);
  const [currentTextIndex, setCurrentTextIndex] = useState(-1);
  const [isVisible, setIsVisible] = useState(false);
  const [displayText, setDisplayText] = useState('');
  const fadeAnimationRef = useRef(null);
  
  // Filtrar textos vacíos
  const validTextos = useMemo(() => {
    return textos.filter(text => text && text.trim() !== '');
  }, [textos]);
  
  // Calcular tiempos para cada texto
  const textTimings = useMemo(() => {
    if (validTextos.length === 0) {
      return [];
    }
    
    // Si no hay duración aún, retornar array vacío (se manejará en el efecto)
    if (!duration || duration === 0) {
      return [];
    }
    
    // Calcular tiempo total necesario para todos los textos
    let totalTimeNeeded = 0;
    const timings = validTextos.map((text, index) => {
      const typingTime = calculateTypingTime(text);
      const readingTime = calculateReadingTime(text);
      const fadeTime = 0.5; // tiempo de fade out
      const totalTime = typingTime + readingTime + fadeTime;
      totalTimeNeeded += totalTime;
      
      return {
        text,
        index,
        typingTime,
        readingTime,
        fadeTime,
        totalTime,
        startTime: 0, // se calculará después
        endTime: 0 // se calculará después
      };
    });
    
    // Si el tiempo necesario es mayor que la duración, escalar proporcionalmente
    const scaleFactor = duration / totalTimeNeeded;
    
    // Calcular tiempos de inicio y fin para cada texto
    let accumulatedTime = 0;
    return timings.map(timing => {
      const scaledTypingTime = timing.typingTime * scaleFactor;
      const scaledReadingTime = timing.readingTime * scaleFactor;
      const scaledFadeTime = timing.fadeTime * scaleFactor;
      const scaledTotalTime = scaledTypingTime + scaledReadingTime + scaledFadeTime;
      
      const startTime = accumulatedTime;
      const typingEndTime = startTime + scaledTypingTime;
      const readingStartTime = typingEndTime;
      const readingEndTime = readingStartTime + scaledReadingTime;
      const endTime = readingEndTime + scaledFadeTime;
      
      accumulatedTime = endTime;
      
      return {
        ...timing,
        startTime,
        typingEndTime,
        readingStartTime,
        readingEndTime,
        endTime,
        scaledTypingTime,
        scaledReadingTime,
        scaledFadeTime
      };
    });
  }, [validTextos, duration]);
  
  // Determinar qué texto mostrar según el tiempo actual
  useEffect(() => {
    console.log('[Prompt] Determining text index:', { 
      textTimingsLength: textTimings.length, 
      currentTime, 
      duration,
      validTextosLength: validTextos.length 
    });
    
    if (textTimings.length === 0) {
      // Si no hay timings calculados pero hay textos, mostrar el primero
      if (validTextos.length > 0) {
        console.log('[Prompt] No timings but have texts, showing first');
        setCurrentTextIndex(0);
      } else {
        setCurrentTextIndex(-1);
      }
      return;
    }
    
    // Si no hay duración aún, mostrar el primer texto
    if (!duration || duration === 0) {
      console.log('[Prompt] No duration yet, showing first text');
      setCurrentTextIndex(0);
      return;
    }
    
    // Encontrar el texto correspondiente al tiempo actual
    let foundIndex = -1;
    for (let i = 0; i < textTimings.length; i++) {
      const timing = textTimings[i];
      if (currentTime >= timing.startTime && currentTime < timing.endTime) {
        foundIndex = i;
        console.log('[Prompt] Found text index:', i, 'for time:', currentTime);
        break;
      }
    }
    
    // Si estamos después del último texto, mostrar el último
    if (foundIndex === -1 && textTimings.length > 0) {
      const lastTiming = textTimings[textTimings.length - 1];
      if (currentTime >= lastTiming.endTime) {
        foundIndex = textTimings.length - 1;
        console.log('[Prompt] After last text, showing last');
      } else if (currentTime < textTimings[0].startTime) {
        // Si estamos antes del primer texto, mostrar el primero
        foundIndex = 0;
        console.log('[Prompt] Before first text, showing first');
      }
    }
    
    setCurrentTextIndex(foundIndex);
  }, [currentTime, duration, textTimings, validTextos.length]);
  
  // Actualizar texto mostrado y animaciones según el índice actual
  useEffect(() => {
    if (currentTextIndex === -1) {
      // Si no hay índice válido pero hay textos, mostrar el primero
      if (validTextos.length > 0 && textTimings.length === 0) {
        setDisplayText(validTextos[0]);
        if (!isVisible && promptRef.current) {
          setIsVisible(true);
          if (fadeAnimationRef.current) {
            fadeAnimationRef.current.kill();
          }
          gsap.set(promptRef.current, { opacity: 1, y: 0 });
        }
        return;
      }
      
      if (isVisible && promptRef.current) {
        // Fade out
        if (fadeAnimationRef.current) {
          fadeAnimationRef.current.kill();
        }
        fadeAnimationRef.current = gsap.to(promptRef.current, {
          opacity: 0,
          y: 50,
          duration: 0.5,
          ease: 'power2.in',
          onComplete: () => {
            setIsVisible(false);
            setDisplayText('');
          }
        });
      }
      return;
    }
    
    if (!promptRef.current) {
      return;
    }
    
    // Si no hay timings calculados pero hay índice válido, mostrar el texto directamente
    if (textTimings.length === 0 && currentTextIndex >= 0 && currentTextIndex < validTextos.length) {
      setDisplayText(validTextos[currentTextIndex]);
      if (!isVisible) {
        setIsVisible(true);
        if (fadeAnimationRef.current) {
          fadeAnimationRef.current.kill();
        }
        gsap.set(promptRef.current, { opacity: 1, y: 0 });
      }
      return;
    }
    
    const timing = textTimings[currentTextIndex];
    if (!timing) {
      return;
    }
    
    const text = timing.text;
    const relativeTime = currentTime - timing.startTime;
    
    // Determinar qué parte del texto mostrar
    if (relativeTime < 0) {
      // Aún no ha empezado este texto, pero si es el primer texto, mostrarlo
      if (currentTextIndex === 0) {
        setDisplayText(text.substring(0, 1)); // Mostrar al menos un carácter
        if (!isVisible && promptRef.current) {
          setIsVisible(true);
          gsap.set(promptRef.current, { opacity: 1, y: 0 });
        }
      } else {
        setDisplayText('');
      }
      return;
    } else if (relativeTime < timing.scaledTypingTime) {
      // Estamos en la fase de escritura - usar requestAnimationFrame para animación suave letra por letra
      const typingProgress = Math.max(0, Math.min(1, relativeTime / timing.scaledTypingTime));
      const charsToShow = Math.floor(text.length * typingProgress);
      setDisplayText(text.substring(0, charsToShow));
      
      // Fade in si no está visible
      if (!isVisible && promptRef.current) {
        setIsVisible(true);
        if (fadeAnimationRef.current) {
          fadeAnimationRef.current.kill();
        }
        gsap.set(promptRef.current, { opacity: 0, y: 50 });
        fadeAnimationRef.current = gsap.to(promptRef.current, {
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: 'power2.out'
        });
      }
    } else if (relativeTime < timing.readingEndTime) {
      // Estamos en la fase de lectura (texto completo visible)
      setDisplayText(text);
      
      // Asegurar que está visible
      if (!isVisible && promptRef.current) {
        setIsVisible(true);
        if (fadeAnimationRef.current) {
          fadeAnimationRef.current.kill();
        }
        gsap.set(promptRef.current, { opacity: 1, y: 0 });
      }
    } else {
      // Estamos en la fase de fade out
      const fadeProgress = (relativeTime - timing.readingEndTime) / timing.scaledFadeTime;
      if (fadeProgress < 1 && promptRef.current) {
        setDisplayText(text);
        if (fadeAnimationRef.current) {
          fadeAnimationRef.current.kill();
        }
        fadeAnimationRef.current = gsap.to(promptRef.current, {
          opacity: 1 - fadeProgress,
          y: 50 * fadeProgress,
          duration: 0.1,
          ease: 'power2.in'
        });
      } else if (fadeProgress >= 1) {
        // Fade out completado
        setIsVisible(false);
        setDisplayText('');
      }
    }
  }, [currentTextIndex, currentTime, textTimings, isVisible, validTextos]);
  
  // Animación suave de máquina de escribir usando requestAnimationFrame para actualización letra por letra
  const typingAnimationRef = useRef(null);
  const lastCharsShownRef = useRef(0);
  const lastTextIndexRef = useRef(-1);
  const startTimeRef = useRef(null);
  const lastUpdateTimeRef = useRef(0);
  
  useEffect(() => {
    // Limpiar animación si cambió el índice de texto
    if (currentTextIndex !== lastTextIndexRef.current) {
      if (typingAnimationRef.current) {
        cancelAnimationFrame(typingAnimationRef.current);
        typingAnimationRef.current = null;
      }
      lastCharsShownRef.current = 0;
      lastTextIndexRef.current = currentTextIndex;
      startTimeRef.current = null;
      lastUpdateTimeRef.current = 0;
    }
    
    if (currentTextIndex === -1 || textTimings.length === 0) {
      if (typingAnimationRef.current) {
        cancelAnimationFrame(typingAnimationRef.current);
        typingAnimationRef.current = null;
      }
      return;
    }
    
    const timing = textTimings[currentTextIndex];
    if (!timing) return;
    
    const text = timing.text;
    const relativeTime = currentTime - timing.startTime;
    
    // Solo animar durante la fase de escritura
    if (relativeTime >= 0 && relativeTime < timing.scaledTypingTime) {
      // Inicializar tiempo de inicio si es la primera vez
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now() - (relativeTime * 1000);
        lastCharsShownRef.current = 0;
      }
      
      // Calcular tiempo transcurrido desde el inicio de la escritura
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const typingProgress = Math.max(0, Math.min(1, elapsed / timing.scaledTypingTime));
      const targetChars = Math.floor(text.length * typingProgress);
      
      // Solo actualizar si el número de caracteres ha aumentado (nunca disminuir)
      if (targetChars > lastCharsShownRef.current && targetChars <= text.length) {
        lastCharsShownRef.current = targetChars;
        setDisplayText(text.substring(0, targetChars));
      }
      
      // Continuar animando con requestAnimationFrame para suavidad (60fps)
      if (!typingAnimationRef.current) {
        const animate = () => {
          if (currentTextIndex === -1 || textTimings.length === 0 || currentTextIndex !== lastTextIndexRef.current) {
            typingAnimationRef.current = null;
            return;
          }
          
          const currentTiming = textTimings[currentTextIndex];
          if (!currentTiming) {
            typingAnimationRef.current = null;
            return;
          }
          
          if (startTimeRef.current === null) {
            typingAnimationRef.current = null;
            return;
          }
          
          const now = Date.now();
          // Limitar actualizaciones a ~60fps (cada ~16ms)
          if (now - lastUpdateTimeRef.current < 16) {
            typingAnimationRef.current = requestAnimationFrame(animate);
            return;
          }
          lastUpdateTimeRef.current = now;
          
          const currentElapsed = (now - startTimeRef.current) / 1000;
          
          if (currentElapsed >= 0 && currentElapsed < currentTiming.scaledTypingTime) {
            const currentProgress = Math.max(0, Math.min(1, currentElapsed / currentTiming.scaledTypingTime));
            const currentTargetChars = Math.floor(currentTiming.text.length * currentProgress);
            
            // Solo actualizar si el número de caracteres ha aumentado (nunca disminuir)
            if (currentTargetChars > lastCharsShownRef.current && currentTargetChars <= currentTiming.text.length) {
              lastCharsShownRef.current = currentTargetChars;
              setDisplayText(currentTiming.text.substring(0, currentTargetChars));
            }
            
            typingAnimationRef.current = requestAnimationFrame(animate);
          } else {
            // Fuera de la fase de escritura, mostrar texto completo solo si no está completo
            if (lastCharsShownRef.current < currentTiming.text.length) {
              setDisplayText(currentTiming.text);
              lastCharsShownRef.current = currentTiming.text.length;
            }
            typingAnimationRef.current = null;
          }
        };
        
        typingAnimationRef.current = requestAnimationFrame(animate);
      }
    } else {
      // Fuera de la fase de escritura, limpiar animación
      if (typingAnimationRef.current) {
        cancelAnimationFrame(typingAnimationRef.current);
        typingAnimationRef.current = null;
      }
      // Solo resetear si realmente cambió de texto
      if (relativeTime >= timing.scaledTypingTime) {
        // Asegurar que el texto completo esté mostrado
        if (lastCharsShownRef.current < text.length) {
          setDisplayText(text);
          lastCharsShownRef.current = text.length;
        }
      } else {
        lastCharsShownRef.current = 0;
        startTimeRef.current = null;
        lastUpdateTimeRef.current = 0;
      }
    }
    
    return () => {
      if (typingAnimationRef.current) {
        cancelAnimationFrame(typingAnimationRef.current);
        typingAnimationRef.current = null;
      }
    };
  }, [currentTextIndex, currentTime, textTimings]);
  
  // Limpiar animaciones al desmontar
  useEffect(() => {
    return () => {
      if (fadeAnimationRef.current) {
        fadeAnimationRef.current.kill();
      }
    };
  }, []);
  
  if (!validTextos || validTextos.length === 0) {
    console.log('[Prompt] No valid texts');
    return null;
  }
  
  // Si no hay displayText pero hay textos válidos y no hay timings, asegurar que se muestre
  const shouldShow = displayText || (validTextos.length > 0 && textTimings.length === 0);
  
  if (!shouldShow && !isVisible) {
    return null;
  }
  
  // Asegurar que el prompt esté visible si hay texto para mostrar
  if (shouldShow && !isVisible && promptRef.current) {
    setIsVisible(true);
    gsap.set(promptRef.current, { opacity: 1, y: 0 });
  }
  
  return (
    <div className={MAINCLASS} ref={promptRef}>
      {analyser && (
        <div className={`${MAINCLASS}__kitt`}>
          <KITT analyser={analyser} />
        </div>
      )}
      <div className={`${MAINCLASS}__text`}>
        {displayText || (validTextos.length > 0 && textTimings.length === 0 ? validTextos[0] : '')}
        {currentTextIndex >= 0 && 
         textTimings.length > 0 &&
         textTimings[currentTextIndex] && 
         currentTime >= textTimings[currentTextIndex].startTime && 
         currentTime < textTimings[currentTextIndex].typingEndTime && (
          <span className={`${MAINCLASS}__cursor`}>|</span>
        )}
      </div>
    </div>
  );
};

export default Prompt;
