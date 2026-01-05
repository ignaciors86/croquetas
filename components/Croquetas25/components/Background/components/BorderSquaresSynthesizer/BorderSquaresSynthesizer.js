import React, { useRef, useEffect, useCallback } from 'react';
import './BorderSquaresSynthesizer.scss';

/**
 * Sintetizador procedural para generar cuadrados con borde
 * En lugar de crear múltiples elementos individuales, genera el patrón visual
 * de forma procedural basado en eventos de audio y tiempo.
 * 
 * Ventajas:
 * - Mucho más ligero: un solo canvas en lugar de múltiples elementos
 * - Generación procedural: no necesita crear/eliminar objetos
 * - Mismo efecto visual que múltiples cuadrados individuales
 * - Reacción suave a la música
 */
const BorderSquaresSynthesizer = ({
  analyserRef,
  dataArrayRef,
  onTriggerCallbackRef,
  onVoiceCallbackRef,
  currentAudioIndex = null, // Para detectar cambios de tramo
  isMainCroqueta = false // Para hacer los cuadrados redondos en la colección principal
}) => {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const waveEventsRef = useRef([]); // Eventos de "ondas" de cuadrados
  const lastFrameTimeRef = useRef(0);
  const lastSquareTimeRef = useRef(0); // Tiempo del último cuadrado generado (beats)
  const lastVoiceTimeRef = useRef(0); // Tiempo del último cuadrado generado (voz)
  const currentAudioIntensityRef = useRef(0); // Intensidad actual del audio para reactividad continua
  const lastAudioIndexRef = useRef(null); // Para detectar cambios de tramo
  // Color base de las croquetas: #00ffff (cyan) = HSL(180, 100%, 50%)
  const BASE_CYAN_HUE = 180;
  const BASE_CYAN_SATURATION = 100;
  const BASE_CYAN_LIGHTNESS = 50;
  
  const colorStateRef = useRef({
    baseHue: BASE_CYAN_HUE, // Color base que cambia según la música
    baseSaturation: BASE_CYAN_SATURATION,
    baseLightness: BASE_CYAN_LIGHTNESS,
    targetBaseHue: BASE_CYAN_HUE,
    targetBaseSaturation: BASE_CYAN_SATURATION,
    targetBaseLightness: BASE_CYAN_LIGHTNESS
  });

  // Configuración de ondas
  // Duración basada en intensidad: más intensidad = más rápida (igual que el código original)
  // Rango: 12-15 segundos (invertido: más intensidad = menos duración)
  const BASE_DURATION = 15000; // 15 segundos base
  const MIN_DURATION = 12000; // 12 segundos mínimo
  const WAVE_FADE_START = 0.6; // Empezar fade out al 60%
  const MAX_WAVES = 200; // Máximo número de ondas simultáneas (aumentado para permitir que crezcan completamente)
  const BASE_OPACITY = 0.5;
  
  // Configuración de sensibilidad (reducir frecuencia de generación)
  const MIN_INTENSITY_THRESHOLD = 0.2; // Solo generar cuadrados si la intensidad es mayor a este valor
  const MIN_TIME_BETWEEN_SQUARES = 300; // Tiempo mínimo en ms entre cuadrados (300ms = menos sensibles)
  const FADE_IN_DURATION = 500; // 500ms para fade in cuando el audio alcanza el umbral
  const FADE_OUT_DURATION = 1000; // 1 segundo para fade out cuando el audio está por debajo del umbral

  // Detectar cambios de tramo y reconectar el callback
  useEffect(() => {
    if (currentAudioIndex === null) {
      lastAudioIndexRef.current = null;
      return;
    }
    
    // Si cambió el tramo, limpiar ondas del tramo anterior y resetear intensidad
    if (lastAudioIndexRef.current !== null && lastAudioIndexRef.current !== currentAudioIndex) {
      // Limpiar ondas del tramo anterior (mantener solo las del tramo actual)
      waveEventsRef.current = waveEventsRef.current.filter(wave => {
        // Si la onda no tiene audioIndex asignado, mantenerla (son ondas antiguas sin índice)
        if (wave.audioIndex === undefined || wave.audioIndex === null) {
          return false; // Eliminar ondas sin índice (son del tramo anterior)
        }
        // Mantener solo las del tramo actual
        return wave.audioIndex === currentAudioIndex;
      });
      
      // Resetear intensidad para el nuevo tramo
      currentAudioIntensityRef.current = 0;
      
      // Forzar reconexión de los callbacks desenrollándolos y volviéndolos a envolver
      // Esto asegura que capturen los callbacks actuales de Background.js
      if (onTriggerCallbackRef?.current?.__synthesizerWrapped) {
        // El callback está envuelto, necesitamos desenrollarlo
        // Pero no podemos hacerlo aquí porque no tenemos acceso al callback original
        // En su lugar, forzamos que el useEffect que envuelve los callbacks se ejecute de nuevo
        // añadiendo currentAudioIndex a las dependencias
      }
      if (onVoiceCallbackRef?.current?.__synthesizerWrapped) {
        // Similar para onVoiceCallbackRef
      }
    }
    
    lastAudioIndexRef.current = currentAudioIndex;
  }, [currentAudioIndex, onTriggerCallbackRef, onVoiceCallbackRef]);

  // Escuchar eventos de audio para generar nuevas ondas
  // El sintetizador debe ejecutarse DESPUÉS de que Background.js establezca su callback
  // Usar un efecto que se ejecute después del render para envolver el callback
  useEffect(() => {
    if (!onTriggerCallbackRef) return;

    // Función para procesar eventos del sintetizador
    const handleSynthesizerEvent = (type, data = {}) => {
      // Solo procesar eventos de tipo 'beat' para cuadrados con borde (sin imagen)
      if (type === 'beat' && !data.shouldBeSolid) {
        const now = Date.now();
        const intensity = data?.intensity ?? 0.5;
        
        // Actualizar intensidad actual para reactividad continua
        currentAudioIntensityRef.current = intensity;
        
        // Filtrar por umbral de intensidad mínimo
        if (intensity < MIN_INTENSITY_THRESHOLD) {
          // No generar nueva onda, pero la reactividad continua se encargará de desvanecer las existentes
          return;
        }
        
        // Filtrar por tiempo mínimo entre cuadrados
        if (now - lastSquareTimeRef.current < MIN_TIME_BETWEEN_SQUARES) {
          return; // Ignorar si no ha pasado el tiempo mínimo
        }
        
        // Actualizar el tiempo del último cuadrado generado
        lastSquareTimeRef.current = now;
        
        // Primero, limpiar ondas que ya terminaron antes de agregar nueva
        const currentTime = Date.now();
        waveEventsRef.current = waveEventsRef.current.filter(wave => {
          const elapsed = currentTime - wave.startTime;
          const duration = BASE_DURATION - (wave.intensity * (BASE_DURATION - MIN_DURATION));
          return elapsed < duration; // Mantener solo las que aún están activas
        });
        
        // Agregar nueva onda
        waveEventsRef.current.push({
          startTime: now,
          intensity: intensity,
          type: 'beat'
        });

        // Si aún hay demasiadas ondas activas después de limpiar, eliminar las más antiguas
        if (waveEventsRef.current.length > MAX_WAVES) {
          // Ordenar por tiempo (más antiguas primero) y mantener solo las más recientes
          waveEventsRef.current.sort((a, b) => a.startTime - b.startTime);
          waveEventsRef.current = waveEventsRef.current.slice(-MAX_WAVES);
        }
      }
    };

    // Usar un intervalo continuo para verificar y envolver el callback
    // IMPORTANTE: El intervalo debe ejecutarse continuamente porque Background.js puede recrear el callback
    // cuando cambia currentAudioIndex o cuando se actualizan getNextImage/preloadNextImages
    const setupInterval = setInterval(() => {
      if (!onTriggerCallbackRef.current) return;

      // Si ya está envuelto, no hacer nada (el wrapper sigue funcionando)
      if (onTriggerCallbackRef.current.__synthesizerWrapped) {
        return; // Continuar verificando por si Background.js recrea el callback
      }
      
      // Si no está envuelto, Background.js puede haber recreado el callback
      // Necesitamos envolverlo de nuevo

      // Guardar el callback original de Background.js
      const originalCallback = onTriggerCallbackRef.current;
      
      // Crear wrapper que llame tanto al original como al sintetizador
      const wrapperCallback = (type, data = {}) => {
        // Llamar al callback original primero (para que Background.js procese las imágenes)
        if (typeof originalCallback === 'function') {
          try {
            originalCallback(type, data);
          } catch (error) {
            console.error('[BorderSquaresSynthesizer] Error en callback original:', error);
          }
        }
        
        // Llamar al handler del sintetizador
        handleSynthesizerEvent(type, data);
      };

      // Marcar como envuelto
      wrapperCallback.__synthesizerWrapped = true;

      // Reemplazar el callback con nuestro wrapper
      onTriggerCallbackRef.current = wrapperCallback;
    }, 100); // Verificar cada 100ms continuamente

    // Manejar eventos de voz de manera similar - intervalo continuo
    let voiceSetupInterval;
    if (onVoiceCallbackRef) {
      voiceSetupInterval = setInterval(() => {
        if (!onVoiceCallbackRef.current) return;

        // Si ya está envuelto, no hacer nada (el wrapper sigue funcionando)
        if (onVoiceCallbackRef.current.__synthesizerWrapped) {
          return; // Continuar verificando por si Background.js recrea el callback
        }
        
        // Si no está envuelto, Background.js puede haber recreado el callback
        // Necesitamos envolverlo de nuevo

        const originalVoiceCallback = onVoiceCallbackRef.current;
        
        const voiceHandler = (intensity = 0.5, voiceEnergy = 0) => {
          // Llamar al callback original
          if (originalVoiceCallback) {
            originalVoiceCallback(intensity, voiceEnergy);
          }

          // Procesar para el sintetizador (con filtros de sensibilidad)
          const now = Date.now();
          
          // Actualizar intensidad actual para reactividad continua
          currentAudioIntensityRef.current = intensity;
          
          // Filtrar por umbral de intensidad mínimo
          if (intensity < MIN_INTENSITY_THRESHOLD) {
            // No generar nueva onda, pero la reactividad continua se encargará de desvanecer las existentes
            return;
          }
          
          // Filtrar por tiempo mínimo entre cuadrados
          if (now - lastVoiceTimeRef.current < MIN_TIME_BETWEEN_SQUARES) {
            return; // Ignorar si no ha pasado el tiempo mínimo
          }
          
          // Actualizar el tiempo del último cuadrado generado
          lastVoiceTimeRef.current = now;
          
          // Primero, limpiar ondas que ya terminaron antes de agregar nueva
          const currentTime = Date.now();
          waveEventsRef.current = waveEventsRef.current.filter(wave => {
            const elapsed = currentTime - wave.startTime;
            const duration = BASE_DURATION - (wave.intensity * (BASE_DURATION - MIN_DURATION));
            return elapsed < duration; // Mantener solo las que aún están activas
          });
          
          waveEventsRef.current.push({
            startTime: now,
            intensity: intensity,
            type: 'voice',
            audioIndex: currentAudioIndex // Guardar el índice de audio para limpiar cuando cambie
          });

          // Si aún hay demasiadas ondas activas después de limpiar, eliminar las más antiguas
          if (waveEventsRef.current.length > MAX_WAVES) {
            // Ordenar por tiempo (más antiguas primero) y mantener solo las más recientes
            waveEventsRef.current.sort((a, b) => a.startTime - b.startTime);
            waveEventsRef.current = waveEventsRef.current.slice(-MAX_WAVES);
          }
        };

        voiceHandler.__synthesizerWrapped = true;
        onVoiceCallbackRef.current = voiceHandler;
      }, 100); // Verificar cada 100ms continuamente
    }

    return () => {
      clearInterval(setupInterval);
      if (voiceSetupInterval) {
        clearInterval(voiceSetupInterval);
      }
    };
  }, [onTriggerCallbackRef, onVoiceCallbackRef, currentAudioIndex]); // Añadir currentAudioIndex para forzar reconexión cuando cambia el tramo

  // Calcular color base basado en música (intensidad de las partes más intensas)
  // Este color base se usa para generar la escala de azules
  const calculateBaseColorFromMusic = useCallback(() => {
    if (!dataArrayRef?.current || !analyserRef?.current) {
      // Sin audio, usar el color base de las croquetas
      return {
        baseHue: BASE_CYAN_HUE,
        baseSaturation: BASE_CYAN_SATURATION,
        baseLightness: BASE_CYAN_LIGHTNESS
      };
    }

    try {
      const dataArray = dataArrayRef.current;
      const analyser = analyserRef.current;

      analyser.getByteFrequencyData(dataArray);

      // Calcular métricas de audio
      let sum = 0;
      let maxValue = 0;
      let bassSum = 0;
      let trebleSum = 0;
      const bassRange = Math.floor(dataArray.length * 0.1);
      const trebleRange = Math.floor(dataArray.length * 0.8);

      for (let i = 0; i < dataArray.length; i++) {
        const normalized = dataArray[i] / 255;
        sum += normalized;
        maxValue = Math.max(maxValue, normalized);
        if (i < bassRange) bassSum += normalized;
        if (i > trebleRange) trebleSum += normalized;
      }

      const average = sum / dataArray.length;
      const bassEnergy = bassRange > 0 ? bassSum / bassRange : 0;
      const trebleEnergy = (dataArray.length - trebleRange) > 0 ? trebleSum / (dataArray.length - trebleRange) : 0;
      
      // Usar la intensidad máxima y promedio para determinar el color base
      // Más intensidad = variar más el color base dentro de la gama de azules
      const intensity = Math.max(maxValue, average);
      
      // Variar el hue alrededor del cyan (180) en un rango de ±30 grados (azules)
      // Más intensidad = más variación
      const hueVariation = (intensity - 0.5) * 60; // Rango: -30 a +30 grados
      const baseHue = BASE_CYAN_HUE + hueVariation;
      
      // Mantener saturación alta pero variarla ligeramente según la música
      const baseSaturation = Math.min(100, Math.max(80, BASE_CYAN_SATURATION - (bassEnergy * 20)));
      
      // Variar lightness según la intensidad
      const baseLightness = Math.min(70, Math.max(40, BASE_CYAN_LIGHTNESS + (intensity * 20) - 10));

      return {
        baseHue: Math.round(baseHue),
        baseSaturation: Math.round(baseSaturation),
        baseLightness: Math.round(baseLightness)
      };
    } catch (error) {
      // En caso de error, usar el color base de las croquetas
      return {
        baseHue: BASE_CYAN_HUE,
        baseSaturation: BASE_CYAN_SATURATION,
        baseLightness: BASE_CYAN_LIGHTNESS
      };
    }
  }, [analyserRef, dataArrayRef]);
  
  // Generar un color de la escala de azules para una onda específica
  // Cada onda tiene un índice único que determina su variación en la escala
  const getColorFromScale = useCallback((baseHue, baseSaturation, baseLightness, waveIndex) => {
    // Crear variaciones sutiles en la escala de azules
    // Usar el índice de la onda para generar variaciones consistentes
    const hueVariation = (waveIndex % 7) * 5 - 15; // Variación de -15 a +15 grados
    const saturationVariation = (waveIndex % 5) * 3 - 6; // Variación de -6 a +6%
    const lightnessVariation = (waveIndex % 9) * 4 - 16; // Variación de -16 a +16%
    
    const hue = ((baseHue + hueVariation) % 360 + 360) % 360;
    const saturation = Math.min(100, Math.max(70, baseSaturation + saturationVariation));
    const lightness = Math.min(80, Math.max(30, baseLightness + lightnessVariation));
    
    return {
      hue: Math.round(hue),
      saturation: Math.round(saturation),
      lightness: Math.round(lightness)
    };
  }, []);

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
      // Usar window.innerWidth/innerHeight como fallback si getBoundingClientRect falla
      const rect = canvas.getBoundingClientRect();
      const width = rect.width || window.innerWidth;
      const height = rect.height || window.innerHeight;
      
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    resizeCanvas();
    
    // Escuchar múltiples eventos de resize
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);
    document.addEventListener('fullscreenchange', resizeCanvas);
    document.addEventListener('webkitfullscreenchange', resizeCanvas);
    document.addEventListener('mozfullscreenchange', resizeCanvas);
    document.addEventListener('MSFullscreenChange', resizeCanvas);
    
    // Escuchar el evento personalizado de resize de Croquetas25
    const handleCroquetasResize = () => {
      // Usar requestAnimationFrame para asegurar que el DOM se haya actualizado
      requestAnimationFrame(() => {
        resizeCanvas();
      });
    };
    window.addEventListener('croquetas-resize', handleCroquetasResize);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('orientationchange', resizeCanvas);
      document.removeEventListener('fullscreenchange', resizeCanvas);
      document.removeEventListener('webkitfullscreenchange', resizeCanvas);
      document.removeEventListener('mozfullscreenchange', resizeCanvas);
      document.removeEventListener('MSFullscreenChange', resizeCanvas);
      window.removeEventListener('croquetas-resize', handleCroquetasResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

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
      // Usar window.innerWidth/innerHeight como fallback si getBoundingClientRect falla o devuelve 0
      const canvasWidth = rect.width || window.innerWidth;
      const canvasHeight = rect.height || window.innerHeight;
      
      if (canvas.width !== canvasWidth * dpr || canvas.height !== canvasHeight * dpr) {
        canvas.width = canvasWidth * dpr;
        canvas.height = canvasHeight * dpr;
        ctx.scale(dpr, dpr);
      }

      // Limpiar canvas
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      const now = Date.now();
      const viewportWidth = canvasWidth;
      const viewportHeight = canvasHeight;
      const centerX = viewportWidth / 2;
      const centerY = viewportHeight / 2;

      // Actualizar color base objetivo cada 100ms según la música
      if (currentTime % 100 < 16.67) {
        const newBaseColor = calculateBaseColorFromMusic();
        colorStateRef.current.targetBaseHue = newBaseColor.baseHue;
        colorStateRef.current.targetBaseSaturation = newBaseColor.baseSaturation;
        colorStateRef.current.targetBaseLightness = newBaseColor.baseLightness;
      }

      // Interpolar color base suavemente
      const colorState = colorStateRef.current;
      const interpolationSpeed = 0.03;
      
      // Interpolar hue base (manejar wrap-around)
      let hueDiff = Math.abs(colorState.targetBaseHue - colorState.baseHue);
      hueDiff = Math.min(hueDiff, 360 - hueDiff);
      
      if (hueDiff < 180) {
        colorState.baseHue += (colorState.targetBaseHue - colorState.baseHue) * interpolationSpeed;
      } else {
        if (colorState.targetBaseHue > colorState.baseHue) {
          colorState.baseHue -= (360 - (colorState.targetBaseHue - colorState.baseHue)) * interpolationSpeed;
        } else {
          colorState.baseHue += (360 - (colorState.baseHue - colorState.targetBaseHue)) * interpolationSpeed;
        }
      }
      colorState.baseHue = ((colorState.baseHue % 360) + 360) % 360;
      
      colorState.baseSaturation += (colorState.targetBaseSaturation - colorState.baseSaturation) * interpolationSpeed;
      colorState.baseLightness += (colorState.targetBaseLightness - colorState.baseLightness) * interpolationSpeed;

      // Calcular si el audio actual está por encima del umbral
      const audioAboveThreshold = currentAudioIntensityRef.current >= MIN_INTENSITY_THRESHOLD;
      
      // Dibujar todas las ondas activas
      const activeWaves = waveEventsRef.current.filter(wave => {
        const elapsed = now - wave.startTime;
        // Calcular duración basada en intensidad
        const duration = BASE_DURATION - (wave.intensity * (BASE_DURATION - MIN_DURATION));
        return elapsed < duration;
      });

      // Actualizar waveEventsRef para mantener solo ondas activas
      waveEventsRef.current = activeWaves;

      activeWaves.forEach((wave, waveIndex) => {
        const elapsed = now - wave.startTime;
        // Calcular duración basada en intensidad (igual que el código original)
        // Más intensidad = menos duración (más rápido)
        const duration = BASE_DURATION - (wave.intensity * (BASE_DURATION - MIN_DURATION));
        const progress = elapsed / duration;

        if (progress >= 1) return;

        // Calcular escala (de 0 a 1.0, igual que GSAP)
        // El cuadrado debe crecer desde 0 hasta ocupar toda la pantalla (scale = 1.0)
        const targetScale = 1.0;
        const scale = targetScale * progress; // scale va de 0 a 1.0 según el progress

        // Calcular opacidad basada en reactividad al audio
        // Si el audio está por encima del umbral, usar opacidad normal
        // Si está por debajo, hacer fade out
        let baseOpacity = BASE_OPACITY;
        
        // Aplicar fade basado en progreso de la onda (fade out al final)
        if (progress >= WAVE_FADE_START) {
          const fadeProgress = (progress - WAVE_FADE_START) / (1.0 - WAVE_FADE_START);
          baseOpacity = BASE_OPACITY * (1 - fadeProgress);
        }
        
        // Aplicar reactividad al audio: si el audio está por debajo del umbral, hacer fade out adicional
        let opacity = baseOpacity;
        if (!audioAboveThreshold && (wave.audioIndex === currentAudioIndex || wave.audioIndex === null)) {
          // Si el audio está por debajo del umbral, hacer fade out adicional
          // Inicializar fadeStartTime si no existe
          if (wave.fadeStartTime === undefined) {
            wave.fadeStartTime = now;
          }
          const fadeElapsed = now - wave.fadeStartTime;
          const fadeProgress = Math.min(fadeElapsed / FADE_OUT_DURATION, 1);
          opacity = baseOpacity * (1 - fadeProgress);
        } else {
          // Si el audio está por encima del umbral, hacer fade in si estaba desvanecida
          if (wave.fadeStartTime !== undefined) {
            const fadeElapsed = now - wave.fadeStartTime;
            const fadeProgress = Math.min(fadeElapsed / FADE_IN_DURATION, 1);
            const previousOpacity = wave.lastOpacity || 0;
            opacity = previousOpacity + (baseOpacity - previousOpacity) * fadeProgress;
          }
          // Resetear fadeStartTime cuando el audio vuelve a estar por encima del umbral
          wave.fadeStartTime = undefined;
        }
        
        // Guardar opacidad actual para el siguiente frame
        wave.lastOpacity = opacity;

        // Calcular tamaño final: el cuadrado debe ocupar toda la pantalla cuando scale = 1.0
        // Usar viewportWidth y viewportHeight directamente multiplicados por scale
        // Cuando scale = 1.0, el cuadrado debe ser exactamente del tamaño del viewport
        const finalWidth = viewportWidth * scale;
        const finalHeight = viewportHeight * scale;
        
        // Debug: verificar que el tamaño sea correcto cuando está cerca de 1.0 (solo en desarrollo)
        if (process.env.NODE_ENV === 'development' && progress > 0.95 && progress < 1.0) {
          console.log('[BorderSquaresSynthesizer] Cuadrado cerca del final:', {
            progress,
            scale,
            finalWidth,
            finalHeight,
            viewportWidth,
            viewportHeight,
            ratio: finalWidth / viewportWidth
          });
        }
        const widthRatio = finalWidth / viewportWidth;
        const heightRatio = finalHeight / viewportHeight;
        const maxRatio = Math.max(widthRatio, heightRatio);

        let sizeBasedOpacity = opacity;
        if (maxRatio > 0.7) {
          const fadeStart = 0.7;
          const fadeEnd = 1.0;
          const fadeProgress = (maxRatio - fadeStart) / (fadeEnd - fadeStart);
          sizeBasedOpacity = opacity * (1 - Math.min(1, fadeProgress));
        }

        // Generar color único para esta onda basado en la escala de azules
        const waveColor = getColorFromScale(
          colorState.baseHue,
          colorState.baseSaturation,
          colorState.baseLightness,
          waveIndex
        );
        const waveColorString = `hsl(${waveColor.hue}, ${waveColor.saturation}%, ${waveColor.lightness}%)`;
        
        // Dibujar cuadrado o círculo según la colección
        ctx.save();
        ctx.globalAlpha = sizeBasedOpacity;
        ctx.translate(centerX, centerY);
        ctx.strokeStyle = waveColorString;
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (isMainCroqueta) {
          // Para la colección principal, dibujar círculo
          const radius = Math.max(finalWidth, finalHeight) / 2;
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Para otras colecciones, dibujar cuadrado
          ctx.strokeRect(-finalWidth / 2, -finalHeight / 2, finalWidth, finalHeight);
        }
        
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
  }, [calculateBaseColorFromMusic, getColorFromScale]);

  return (
    <canvas
      ref={canvasRef}
      className="border-squares-synthesizer"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '100%',
        height: '100%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 20
      }}
    />
  );
};

export default BorderSquaresSynthesizer;

