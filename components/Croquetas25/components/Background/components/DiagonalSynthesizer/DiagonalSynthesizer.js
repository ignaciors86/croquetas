import React, { useRef, useEffect, useCallback } from 'react';
import './DiagonalSynthesizer.scss';

/**
 * Sintetizador procedural para generar diagonales en movimiento
 * En lugar de crear múltiples elementos DOM con animaciones GSAP, genera el patrón visual
 * de forma procedural basado en eventos de audio y tiempo en un canvas.
 * 
 * Ventajas:
 * - Mucho más ligero: un solo canvas en lugar de múltiples elementos DOM
 * - Generación procedural: no necesita crear/eliminar objetos DOM
 * - Mismo efecto visual que múltiples diagonales individuales
 * - Reacción suave a la música
 * - Mejor rendimiento al evitar animaciones GSAP en muchos elementos
 */
const DiagonalSynthesizer = ({
  analyserRef,
  dataArrayRef,
  onVoiceCallbackRef,
  squares = [], // Para obtener colores de los cuadrados
  currentAudioIndex = null // Para limpiar cuando cambia de tramo
}) => {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const diagonalEventsRef = useRef([]); // Eventos de diagonales dinámicas
  const lastFrameTimeRef = useRef(0);
  const lastDiagonalTimeRef = useRef(0); // Tiempo del último cuadrado generado
  const colorStateRef = useRef({
    color1: '#00ffff',
    color2: '#00ffff',
    lastUpdate: 0
  });
  const lastDiagonalAngleRef = useRef(-45);
  const isInitializedRef = useRef(false);
  const currentAudioIntensityRef = useRef(0); // Intensidad actual del audio para reactividad continua
  const currentVoiceEnergyRef = useRef(0); // Energía de voz actual para reactividad continua
  const lastAudioIndexRef = useRef(null); // Para detectar cambios de tramo

  // Configuración de diagonales
  const BASE_DURATION = 120; // Duración base de rotación (en segundos)
  const MIN_INTENSITY_THRESHOLD = 0.05; // Umbral mínimo de intensidad para generar diagonales
  const MIN_TIME_BETWEEN_DIAGONALS = 100; // Tiempo mínimo en ms entre diagonales
  const FADE_IN_DURATION = 500; // 500ms para fade in cuando el audio alcanza el umbral
  const FADE_OUT_DURATION = 1000; // 1 segundo para fade out cuando el audio está por debajo del umbral

  // Detectar cambios de tramo y reconectar el callback
  useEffect(() => {
    if (currentAudioIndex === null) {
      lastAudioIndexRef.current = null;
      return;
    }
    
    // Si cambió el tramo, limpiar diagonales del tramo anterior y reconectar callback
    if (lastAudioIndexRef.current !== null && lastAudioIndexRef.current !== currentAudioIndex) {
      // Limpiar diagonales del tramo anterior (mantener solo las del tramo actual)
      // PERO mantener las diagonales iniciales siempre (audioIndex === null)
      diagonalEventsRef.current = diagonalEventsRef.current.filter(diag => {
        // Si la diagonal no tiene audioIndex asignado, mantenerla SIEMPRE (son las iniciales)
        if (diag.audioIndex === undefined || diag.audioIndex === null) {
          return true; // Mantener diagonales iniciales siempre
        }
        // Mantener solo las del tramo actual
        return diag.audioIndex === currentAudioIndex;
      });
      
      // Resetear intensidad para el nuevo tramo
      currentAudioIntensityRef.current = 0;
      currentVoiceEnergyRef.current = 0;
      
      // Forzar reconexión del callback envolviéndolo de nuevo
      // Si el callback está envuelto, necesitamos desenrollarlo y volver a envolverlo
      // para asegurarnos de que capture el callback actual
      if (onVoiceCallbackRef && onVoiceCallbackRef.current) {
        if (onVoiceCallbackRef.current.__diagonalSynthesizerWrapped) {
          // El callback está envuelto, pero necesitamos desenrollarlo y volver a envolverlo
          // para capturar cualquier callback nuevo que pueda haber sido establecido
          // Por ahora, solo resetear los refs - el wrapper debería seguir funcionando
          // pero el useEffect que envuelve el callback se ejecutará de nuevo cuando cambie currentAudioIndex
        }
      }
    }
    
    lastAudioIndexRef.current = currentAudioIndex;
  }, [currentAudioIndex, onVoiceCallbackRef]);

  // Inicializar diagonales iniciales (similar a Diagonales.js)
  useEffect(() => {
    if (isInitializedRef.current) return;
    
    const now = Date.now();
    // Crear diagonales iniciales (sin audioIndex para que no se eliminen al cambiar de tramo)
    const initialDiagonales = [
      {
        id: `diag-initial-1-${now}`,
        startTime: now,
        baseAngle: 45,
        speed: 1,
        initialOpacity: 1,
        creationIntensity: 0.5,
        audioIndex: null // Sin audioIndex para que sean persistentes
      },
      {
        id: `diag-initial-2-${now}`,
        startTime: now,
        baseAngle: -45,
        speed: 1.2,
        initialOpacity: 1,
        creationIntensity: 0.5,
        audioIndex: null
      },
      {
        id: `diag-initial-3-${now}`,
        startTime: now,
        baseAngle: 90,
        speed: 0.9,
        initialOpacity: 1,
        creationIntensity: 0.5,
        audioIndex: null
      },
      {
        id: `diag-initial-4-${now}`,
        startTime: now,
        baseAngle: -90,
        speed: 1.1,
        initialOpacity: 1,
        creationIntensity: 0.5,
        audioIndex: null
      },
      {
        id: `diag-initial-5-${now}`,
        startTime: now,
        baseAngle: 135,
        speed: 1.3,
        initialOpacity: 1,
        creationIntensity: 0.5,
        audioIndex: null
      },
      {
        id: `diag-initial-6-${now}`,
        startTime: now,
        baseAngle: -135,
        speed: 0.8,
        initialOpacity: 1,
        creationIntensity: 0.5,
        audioIndex: null
      }
    ];
    
    diagonalEventsRef.current = initialDiagonales;
    lastDiagonalAngleRef.current = -135;
    isInitializedRef.current = true;
    console.log('[DiagonalSynthesizer] Diagonales iniciales creadas:', initialDiagonales.length);
  }, []);

  // Función para procesar eventos del sintetizador - definida con useCallback para poder usarla como dependencia
  const handleVoiceEvent = useCallback((intensity = 0.5, voiceEnergy = 0) => {
    const now = Date.now();
    
    // Actualizar intensidad y energía de voz actuales para reactividad continua
    currentAudioIntensityRef.current = intensity;
    currentVoiceEnergyRef.current = voiceEnergy;
    
    // Usar voiceEnergy como indicador adicional - si hay energía de voz significativa, ser más permisivo
    const hasSignificantVoice = voiceEnergy > 10;
    const effectiveIntensity = hasSignificantVoice ? Math.max(intensity, 0.15) : intensity;
    
    // DEBUG: Log cuando se generan diagonales o cuando debería pero no hay
    if (effectiveIntensity >= MIN_INTENSITY_THRESHOLD || hasSignificantVoice) {
      if (diagonalEventsRef.current.length === 0 || Math.random() < 0.05) { // Solo 5% de las veces para no saturar
        console.log('[DiagonalSynthesizer] handleVoiceEvent:', {
          intensity,
          voiceEnergy,
          effectiveIntensity,
          threshold: MIN_INTENSITY_THRESHOLD,
          aboveThreshold: effectiveIntensity >= MIN_INTENSITY_THRESHOLD || hasSignificantVoice,
          timeSinceLast: now - lastDiagonalTimeRef.current,
          minTimeBetween: MIN_TIME_BETWEEN_DIAGONALS,
          currentDiagonals: diagonalEventsRef.current.length
        });
      }
    }
    
    // Filtrar por umbral de intensidad mínimo (más permisivo si hay energía de voz)
    if (effectiveIntensity < MIN_INTENSITY_THRESHOLD && !hasSignificantVoice) {
      // No generar nueva diagonal, pero la reactividad continua se encargará de desvanecer las existentes
      return;
    }
    
    // Filtrar por tiempo mínimo entre diagonales
    if (now - lastDiagonalTimeRef.current < MIN_TIME_BETWEEN_DIAGONALS) {
      return; // Ignorar si no ha pasado el tiempo mínimo
    }
    
    // Actualizar el tiempo del último cuadrado generado
    lastDiagonalTimeRef.current = now;
    
    // Obtener el ángulo actual de la última diagonal
    let currentAngle = lastDiagonalAngleRef.current;
    if (diagonalEventsRef.current.length > 0) {
      const lastDiag = diagonalEventsRef.current[diagonalEventsRef.current.length - 1];
      const elapsed = now - lastDiag.startTime;
      const rotationSpeed = 360 / (BASE_DURATION / lastDiag.speed);
      const rotation = (elapsed / 1000) * rotationSpeed;
      currentAngle = (lastDiag.baseAngle + rotation) % 360;
    }
    
    lastDiagonalAngleRef.current = currentAngle;
    
    // Calcular velocidad y opacidad basadas en intensidad
    const speed = 3.0 + (intensity * 5.0); // Rango: 3.0 a 8.0
    const initialOpacity = 0.3 + (intensity * 0.7); // Rango: 0.3 a 1.0
    
    // Agregar nueva diagonal
    const newDiagonal = {
      id: `diag-${now}-${Math.random()}`,
      startTime: now,
      baseAngle: currentAngle,
      speed: speed,
      initialOpacity: initialOpacity,
      creationIntensity: intensity,
      audioIndex: currentAudioIndex, // Guardar el índice de audio para limpiar cuando cambie
      targetOpacity: initialOpacity, // Opacidad objetivo basada en audio
      fadeStartTime: now, // Tiempo de inicio del fade actual
      isFadingIn: true, // Estado del fade
      currentOpacity: initialOpacity // Inicializar opacidad actual
    };
    diagonalEventsRef.current.push(newDiagonal);
    console.log('[DiagonalSynthesizer] Nueva diagonal creada:', {
      id: newDiagonal.id,
      intensity,
      voiceEnergy,
      initialOpacity,
      audioIndex: currentAudioIndex,
      totalDiagonals: diagonalEventsRef.current.length
    });
  }, [currentAudioIndex]);

  // Escuchar eventos de voz para generar nuevas diagonales
  useEffect(() => {
    if (!onVoiceCallbackRef) return;

    // Usar intervalo continuo para envolver el callback - igual que BorderSquaresSynthesizer
    // IMPORTANTE: El intervalo debe ejecutarse continuamente porque el callback puede ser recreado
    const setupInterval = setInterval(() => {
      if (!onVoiceCallbackRef.current) return;

      // Si ya está envuelto, no hacer nada (el wrapper sigue funcionando)
      if (onVoiceCallbackRef.current.__diagonalSynthesizerWrapped) {
        return; // Continuar verificando por si Background.js recrea el callback
      }
      
      // Si no está envuelto, Background.js puede haber recreado el callback
      // Necesitamos envolverlo de nuevo
      console.log('[DiagonalSynthesizer] Callback no envuelto, envolviendo...', typeof onVoiceCallbackRef.current);

      // Guardar el callback original (puede ser el de Diagonales.js o uno nuevo)
      const originalCallback = onVoiceCallbackRef.current;
      
      // Crear wrapper que llame tanto al original como al sintetizador
      const wrapperCallback = (intensity = 0.5, voiceEnergy = 0) => {
        // Llamar al callback original primero (para que Diagonales.js procese las fijas si es necesario)
        if (typeof originalCallback === 'function') {
          try {
            originalCallback(intensity, voiceEnergy);
          } catch (error) {
            console.error('[DiagonalSynthesizer] Error en callback original:', error);
          }
        }
        
        // Llamar al handler del sintetizador (siempre, incluso si el callback original falla)
        try {
          handleVoiceEvent(intensity, voiceEnergy);
        } catch (error) {
          console.error('[DiagonalSynthesizer] Error en handleVoiceEvent:', error);
        }
      };

      // Marcar como envuelto
      wrapperCallback.__diagonalSynthesizerWrapped = true;

      // Reemplazar el callback con nuestro wrapper
      onVoiceCallbackRef.current = wrapperCallback;
      console.log('[DiagonalSynthesizer] Callback envuelto. handleVoiceEvent disponible:', typeof handleVoiceEvent === 'function');
    }, 100); // Verificar cada 100ms continuamente

    return () => {
      clearInterval(setupInterval);
    };
  }, [onVoiceCallbackRef, currentAudioIndex, handleVoiceEvent]); // Añadir handleVoiceEvent a dependencias

  // Inicializar canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', {
      alpha: true,
      desynchronized: true,
      willReadFrequently: false
    });

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Calcular color basado en los cuadrados (similar a Diagonales.js)
  const calculateColorFromSquares = useCallback(() => {
    if (squares && squares.length > 0) {
      const lastSquare = squares[squares.length - 1];
      return {
        color1: lastSquare?.gradient?.color1 || '#00ffff',
        color2: lastSquare?.gradient?.color2 || lastSquare?.gradient?.color1 || '#00ffff'
      };
    }
    return {
      color1: '#00ffff',
      color2: '#00ffff'
    };
  }, [squares]);

  // Loop de renderizado
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = (currentTime) => {
      // Limitar a 60fps
      const deltaTime = currentTime - lastFrameTimeRef.current;
      if (deltaTime < 16.67) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameTimeRef.current = currentTime;

      // Asegurar resolución correcta
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
      }

      // Limpiar canvas
      ctx.clearRect(0, 0, rect.width, rect.height);

      const now = Date.now();
      const viewportWidth = rect.width;
      const viewportHeight = rect.height;
      const centerX = viewportWidth / 2;
      const centerY = viewportHeight / 2;

      // Actualizar color cada 50ms (similar a Diagonales.js)
      if (now - colorStateRef.current.lastUpdate > 50) {
        const colors = calculateColorFromSquares();
        colorStateRef.current.color1 = colors.color1;
        colorStateRef.current.color2 = colors.color2;
        colorStateRef.current.lastUpdate = now;
      }

      const currentColor1 = colorStateRef.current.color1;
      const currentColor2 = colorStateRef.current.color2;

      // Calcular si el audio actual está por encima del umbral
      const hasSignificantVoice = currentVoiceEnergyRef.current > 10;
      const effectiveIntensity = hasSignificantVoice ? Math.max(currentAudioIntensityRef.current, 0.15) : currentAudioIntensityRef.current;
      const audioAboveThreshold = effectiveIntensity >= MIN_INTENSITY_THRESHOLD || hasSignificantVoice;
      
      // Limpiar diagonales que han estado desvanecidas completamente por mucho tiempo
      // Solo limpiar cada ~2 segundos para evitar eliminar diagonales que pueden volver a aparecer
      if (!lastFrameTimeRef.cleanupCounter) lastFrameTimeRef.cleanupCounter = 0;
      lastFrameTimeRef.cleanupCounter++;
      if (lastFrameTimeRef.cleanupCounter >= 120) { // Aproximadamente cada 2 segundos a 60fps
        lastFrameTimeRef.cleanupCounter = 0;
        const cleanupTime = Date.now();
        diagonalEventsRef.current = diagonalEventsRef.current.filter(diag => {
          // Las diagonales iniciales (audioIndex === null) nunca se eliminan
          if (diag.audioIndex === null || diag.audioIndex === undefined) {
            return true; // Mantener diagonales iniciales siempre
          }
          
          // Solo eliminar si ha estado desvanecida (opacidad < 0.01) por más de 10 segundos
          // Esto permite que las diagonales vuelvan a aparecer si el audio vuelve a estar por encima del umbral
          const age = cleanupTime - diag.startTime;
          if (age < 10000) return true; // Mantener diagonales recientes
          
          // Si ha estado desvanecida por más de 10 segundos, eliminarla
          // (solo si realmente está desvanecida, no si está visible)
          return true; // Por ahora mantener todas las diagonales del tramo actual para permitir reactividad
        });
      }
      
      // Calcular propiedades de la línea
      const diagonal = Math.sqrt(viewportWidth * viewportWidth + viewportHeight * viewportHeight);
      const lineLength = diagonal * 3; // 300vh equivalente
      const lineWidth = Math.max(1, viewportWidth * 0.003 * 0.5); // Similar a CSS

      // DEBUG: Log solo cuando hay diagonales pero no se dibujan o cuando no hay diagonales pero debería haberlas
      if (diagonalEventsRef.current.length > 0) {
        const visibleCount = diagonalEventsRef.current.filter(diag => {
          const age = now - diag.startTime;
          const rotationSpeed = 360 / (BASE_DURATION / diag.speed);
          const rotation = (age / 1000) * rotationSpeed;
          const currentAngle = (diag.baseAngle + rotation) % 360;
          let targetOpacity = diag.initialOpacity || diag.targetOpacity || 1;
          if (diag.audioIndex === currentAudioIndex || diag.audioIndex === null) {
            if (audioAboveThreshold) {
              targetOpacity = diag.initialOpacity || 1;
            } else {
              targetOpacity = 0;
            }
          }
          if (diag.targetOpacity === undefined) diag.targetOpacity = diag.initialOpacity || 1;
          if (diag.fadeStartTime === undefined) diag.fadeStartTime = diag.startTime;
          if (diag.isFadingIn === undefined) diag.isFadingIn = true;
          if (diag.currentOpacity === undefined) diag.currentOpacity = diag.initialOpacity || 1;
          const fadeDuration = diag.isFadingIn ? FADE_IN_DURATION : FADE_OUT_DURATION;
          const fadeElapsed = now - diag.fadeStartTime;
          const fadeProgress = Math.min(fadeElapsed / fadeDuration, 1);
          let opacity;
          if (diag.isFadingIn) {
            const startOpacity = diag.currentOpacity;
            opacity = startOpacity + (targetOpacity - startOpacity) * fadeProgress;
          } else {
            const startOpacity = diag.currentOpacity;
            opacity = startOpacity * (1 - fadeProgress);
          }
          diag.targetOpacity = targetOpacity;
          diag.currentOpacity = opacity;
          return opacity > 0.01;
        }).length;
        if (visibleCount === 0 && audioAboveThreshold && Math.random() < 0.1) {
          console.log('[DiagonalSynthesizer] Hay diagonales pero ninguna visible. Total:', diagonalEventsRef.current.length, 'audioAboveThreshold:', audioAboveThreshold);
        }
      } else if (audioAboveThreshold && Math.random() < 0.1) {
        console.log('[DiagonalSynthesizer] No hay diagonales pero audioAboveThreshold es true. effectiveIntensity:', effectiveIntensity);
      }

      // Dibujar todas las diagonales activas
      diagonalEventsRef.current.forEach(diag => {
        const age = now - diag.startTime;
        
        // Calcular rotación actual
        const rotationSpeed = 360 / (BASE_DURATION / diag.speed);
        const rotation = (age / 1000) * rotationSpeed;
        const currentAngle = (diag.baseAngle + rotation) % 360;
        
        // Calcular opacidad basada en reactividad al audio
        // Si el audio está por encima del umbral, hacer fade in
        // Si está por debajo, hacer fade out
        let targetOpacity = diag.initialOpacity || diag.targetOpacity || 1;
        
        // Actualizar targetOpacity basado en el audio actual (solo para diagonales del tramo actual o iniciales)
        if (diag.audioIndex === currentAudioIndex || diag.audioIndex === null) {
          if (audioAboveThreshold) {
            // Audio por encima del umbral: fade in hacia la opacidad objetivo
            targetOpacity = diag.initialOpacity || 1;
            if (!diag.isFadingIn || diag.fadeStartTime === undefined) {
              diag.isFadingIn = true;
              diag.fadeStartTime = now;
            }
          } else {
            // Audio por debajo del umbral: fade out
            targetOpacity = 0;
            if (diag.isFadingIn || diag.fadeStartTime === undefined) {
              diag.isFadingIn = false;
              diag.fadeStartTime = now;
            }
          }
        }
        
        // Calcular opacidad actual con fade suave
        // Inicializar propiedades si no existen
        if (diag.targetOpacity === undefined) {
          diag.targetOpacity = diag.initialOpacity || 1;
        }
        if (diag.fadeStartTime === undefined) {
          diag.fadeStartTime = diag.startTime;
        }
        if (diag.isFadingIn === undefined) {
          diag.isFadingIn = true;
        }
        if (diag.currentOpacity === undefined) {
          diag.currentOpacity = diag.initialOpacity || 1;
        }
        
        const fadeDuration = diag.isFadingIn ? FADE_IN_DURATION : FADE_OUT_DURATION;
        const fadeElapsed = now - diag.fadeStartTime;
        const fadeProgress = Math.min(fadeElapsed / fadeDuration, 1);
        
        // Declarar opacity siempre
        let opacity;
        if (diag.isFadingIn) {
          // Fade in: de opacidad actual a targetOpacity
          const startOpacity = diag.currentOpacity;
          opacity = startOpacity + (targetOpacity - startOpacity) * fadeProgress;
        } else {
          // Fade out: de opacidad actual a 0
          const startOpacity = diag.currentOpacity;
          opacity = startOpacity * (1 - fadeProgress);
        }
        
        // Actualizar valores para el siguiente frame
        diag.targetOpacity = targetOpacity;
        diag.currentOpacity = opacity;
        
        // Si está completamente desvanecida, no dibujar
        if (opacity <= 0.01) return;
        
        // Obtener intensidad de frecuencia para el gradiente (similar a Diagonales.js)
        const diagIndex = diagonalEventsRef.current.indexOf(diag);
        const freqIndex = Math.floor((diagIndex / Math.max(diagonalEventsRef.current.length, 1)) * (dataArrayRef?.current?.length || 1024));
        const freqIntensity = dataArrayRef?.current ? Math.min(dataArrayRef.current[freqIndex] / 255, 1) : 0.5;
        
        // Calcular gradiente (similar a Diagonales.js)
        const centerStart = 30 - freqIntensity * 10;
        const centerEnd = 70 + freqIntensity * 10;
        
        // Convertir ángulo a radianes
        const angleRad = (currentAngle * Math.PI) / 180;
        
        // Calcular puntos de inicio y fin de la línea
        const halfLength = lineLength / 2;
        const startX = centerX - Math.cos(angleRad) * halfLength;
        const startY = centerY - Math.sin(angleRad) * halfLength;
        const endX = centerX + Math.cos(angleRad) * halfLength;
        const endY = centerY + Math.sin(angleRad) * halfLength;
        
        // Crear gradiente lineal
        const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
        
        // Convertir colores hex a rgba para aplicar opacidad
        const hexToRgba = (hex, alpha) => {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };
        
        // Aplicar máscara de gradiente similar a CSS mask-image
        // El gradiente va a lo largo de la línea (0 = inicio, 1 = fin)
        const maskStart = centerStart / 100;
        const maskEnd = centerEnd / 100;
        
        // Crear gradiente a lo largo de la línea con máscara
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(Math.max(0, maskStart - 0.05), 'transparent');
        gradient.addColorStop(maskStart, hexToRgba(currentColor1, opacity));
        gradient.addColorStop(maskStart + 0.05, hexToRgba(currentColor1, opacity));
        // En el centro (0.5) hacer transparente para crear el efecto de máscara
        gradient.addColorStop(0.45, hexToRgba(currentColor1, opacity * 0.5));
        gradient.addColorStop(0.5, 'transparent');
        gradient.addColorStop(0.55, hexToRgba(currentColor2, opacity * 0.5));
        gradient.addColorStop(maskEnd - 0.05, hexToRgba(currentColor2, opacity));
        gradient.addColorStop(maskEnd, hexToRgba(currentColor2, opacity));
        gradient.addColorStop(Math.min(1, maskEnd + 0.05), 'transparent');
        gradient.addColorStop(1, 'transparent');
        
        // Dibujar línea con gradiente y resplandor
        ctx.save();
        ctx.globalAlpha = 1; // La opacidad ya está en el gradiente
        
        // Primero dibujar la línea principal con gradiente
        ctx.strokeStyle = gradient;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        
        // Configurar sombras para el resplandor (box-shadow equivalente)
        ctx.shadowBlur = viewportWidth * 0.01; // 1vw
        ctx.shadowColor = currentColor1;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.stroke(); // Primera pasada con sombra 1vw
        
        ctx.shadowBlur = viewportWidth * 0.02; // 2vw
        ctx.stroke(); // Segunda pasada con sombra 2vw
        
        ctx.shadowBlur = viewportWidth * 0.03; // 3vw
        ctx.shadowColor = currentColor2;
        ctx.stroke(); // Tercera pasada con sombra 3vw y color2
        
        // Dibujar la línea principal sin sombra para que sea más visible
        ctx.shadowBlur = 0;
        ctx.stroke();
        
        ctx.restore();
      });

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [calculateColorFromSquares, dataArrayRef]);

  return (
    <canvas
      ref={canvasRef}
      className="diagonal-synthesizer"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '100%',
        height: '100%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 9 // Mismo z-index que las diagonales originales
      }}
    />
  );
};

export default DiagonalSynthesizer;

