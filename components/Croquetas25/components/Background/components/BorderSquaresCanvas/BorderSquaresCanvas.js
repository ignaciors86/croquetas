import React, { useRef, useEffect, useCallback } from 'react';
import './BorderSquaresCanvas.scss';

/**
 * Canvas único para renderizar todos los cuadros con borde
 * Animaciones fluidas y suaves, altamente reactivas a la música
 */
const BorderSquaresCanvas = ({
  squares = [],
  analyserRef,
  dataArrayRef,
  animationTimelinesRef
}) => {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const squareDataRef = useRef(new Map()); // Almacenar datos de animación de cada cuadrado
  const lastFrameTimeRef = useRef(0);
  const colorUpdateFrameRef = useRef(0);
  
  // Filtrar solo cuadros sin imagen (con borde)
  const borderSquares = squares.filter(square => !square.isTarget);
  
  // Inicializar canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', {
      alpha: true,
      desynchronized: true,
      willReadFrequently: false
    });
    
    // Configurar calidad
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
  
  // Sincronizar datos de animación desde GSAP
  useEffect(() => {
    borderSquares.forEach(square => {
      if (!squareDataRef.current.has(square.id)) {
        // Inicializar datos de animación
        squareDataRef.current.set(square.id, {
          progress: 0,
          scale: 0,
          z: -600,
          opacity: 0.5,
          lastOpacity: 0.5, // Para suavizar cambios de opacidad
          startTime: Date.now(),
          intensity: square.data?.intensity ?? 0.5,
          type: square.type,
          borderColor: square.borderColor || square.data?.borderColor || '#00ffff',
          lastColorUpdate: 0,
          targetColor: null,
          currentColorHSL: null
        });
      }
    });
    
    // Limpiar cuadros que ya no existen
    const existingIds = new Set(borderSquares.map(s => s.id));
    squareDataRef.current.forEach((data, id) => {
      if (!existingIds.has(id)) {
        squareDataRef.current.delete(id);
      }
    });
  }, [borderSquares]);
  
  // Actualizar progreso desde GSAP en cada frame
  useEffect(() => {
    const updateProgress = () => {
      borderSquares.forEach(square => {
        const timeline = animationTimelinesRef.current?.[square.id];
        const data = squareDataRef.current.get(square.id);
        
        if (timeline && data) {
          const progress = timeline.progress();
          data.progress = progress;
          
          // Calcular scale y z desde el progreso (igual que GSAP)
          // targetScale = 1.0 significa que cuando scale = 1.0, el cuadrado ocupa el 100% del viewport
          const targetScale = 1.0;
          data.scale = targetScale * progress;
          data.z = -600 + (400 - (-600)) * progress;
          
          // Calcular opacidad objetivo (sin cambios basados en tamaño)
          const fadeStartProgress = 0.6;
          let targetOpacity = 0.5;
          if (progress >= fadeStartProgress) {
            const fadeProgress = (progress - fadeStartProgress) / (1.0 - fadeStartProgress);
            targetOpacity = 0.5 * (1 - fadeProgress);
          }
          
          // Suavizar cambios de opacidad para evitar parpadeo
          if (data.lastOpacity === undefined) {
            data.lastOpacity = targetOpacity;
          }
          const opacitySmoothing = 0.2; // Suavizar cambios de opacidad
          data.opacity = data.lastOpacity * (1 - opacitySmoothing) + targetOpacity * opacitySmoothing;
          data.lastOpacity = data.opacity;
        }
      });
    };
    
    // Actualizar más frecuentemente para mayor suavidad (cada 4ms = ~250fps para movimiento más fluido)
    const interval = setInterval(updateProgress, 4);
    
    return () => clearInterval(interval);
  }, [borderSquares, animationTimelinesRef]);
  
  // Calcular color basado en música (simple y suave, solo cambio de color)
  const calculateColorFromMusic = useCallback(() => {
    if (!dataArrayRef?.current || !analyserRef?.current) {
      // Fallback: color basado en tiempo (muy lento para cambio suave)
      const timeBasedHue = (Date.now() / 200) % 360;
      return {
        hue: Math.round(timeBasedHue),
        saturation: 70,
        lightness: 60
      };
    }
    
    try {
      const dataArray = dataArrayRef.current;
      const analyser = analyserRef.current;
      
      analyser.getByteFrequencyData(dataArray);
      
      // Calcular métricas básicas de audio
      let sum = 0;
      let bassSum = 0;
      let trebleSum = 0;
      const bassRange = Math.floor(dataArray.length * 0.15);
      const trebleRange = Math.floor(dataArray.length * 0.7);
      
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = dataArray[i] / 255;
        sum += normalized;
        if (i < bassRange) bassSum += normalized;
        if (i >= trebleRange) trebleSum += normalized;
      }
      
      const average = sum / dataArray.length;
      const bassEnergy = bassRange > 0 ? bassSum / bassRange : 0;
      const trebleEnergy = (dataArray.length - trebleRange) > 0 ? trebleSum / (dataArray.length - trebleRange) : 0;
      
      // Calcular spectral centroid simple
      let weightedSum = 0;
      let magnitudeSum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const magnitude = dataArray[i] / 255;
        weightedSum += i * magnitude;
        magnitudeSum += magnitude;
      }
      const spectralCentroid = magnitudeSum > 0 ? weightedSum / magnitudeSum / dataArray.length : 0;
      
      // Calcular color simple y suave
      // Hue: variación suave basada en spectral centroid
      const hue = (spectralCentroid * 300) % 360;
      
      // Saturation: fija para consistencia
      const saturation = 70;
      
      // Lightness: variación muy suave basada en energía promedio
      const lightness = Math.min(70, Math.max(50, 50 + average * 20));
      
      return {
        hue: Math.round(hue),
        saturation: Math.round(saturation),
        lightness: Math.round(lightness)
      };
    } catch (error) {
      const timeBasedHue = (Date.now() / 200) % 360;
      return {
        hue: Math.round(timeBasedHue),
        saturation: 70,
        lightness: 60
      };
    }
  }, [analyserRef, dataArrayRef]);
  
  // Interpolar suavemente entre colores
  const interpolateColor = useCallback((fromColor, toColor, progress) => {
    const hue = fromColor.hue + (toColor.hue - fromColor.hue) * progress;
    // Manejar el wrap-around del hue (0-360)
    let finalHue = hue;
    if (Math.abs(toColor.hue - fromColor.hue) > 180) {
      if (toColor.hue > fromColor.hue) {
        finalHue = fromColor.hue - (360 - (toColor.hue - fromColor.hue)) * progress;
      } else {
        finalHue = fromColor.hue + (360 - (fromColor.hue - toColor.hue)) * progress;
      }
    }
    finalHue = ((finalHue % 360) + 360) % 360;
    
    const saturation = fromColor.saturation + (toColor.saturation - fromColor.saturation) * progress;
    const lightness = fromColor.lightness + (toColor.lightness - fromColor.lightness) * progress;
    
    return `hsl(${Math.round(finalHue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`;
  }, []);
  
  // Grosor fijo de 1px (sin lógica compleja)
  const LINE_WIDTH = 1;
  
  // Dibujar un cuadrado con borde
  const drawBorderSquare = useCallback((ctx, square, squareData) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;
    
    // Calcular tamaño base (igual que GSAP: desde 0 hasta targetScale * viewport)
    // Los cuadros deben ocupar toda la ventana cuando están a escala completa
    // targetScale = 1.0 significa que cuando scale = 1.0, el cuadrado ocupa el 100% del viewport
    const targetScale = 1.0;
    const scale = squareData.scale;
    
    // El tamaño base es el viewport completo
    // Cuando scale = targetScale (1.0), debe ocupar el 100% del viewport
    // Por lo tanto: finalSize = viewportSize * (scale / targetScale)
    const finalWidth = (viewportWidth / targetScale) * scale;
    const finalHeight = (viewportHeight / targetScale) * scale;
    
    // Calcular color desde música con interpolación suave
    const now = Date.now();
    const timeSinceLastUpdate = now - squareData.lastColorUpdate;
    
    // Actualizar color objetivo cada 100ms (10fps) para cambios más suaves
    if (timeSinceLastUpdate >= 100) {
      const newColor = calculateColorFromMusic();
      
      // Si no hay color anterior, inicializar
      if (!squareData.targetColor) {
        squareData.targetColor = newColor;
        squareData.currentColorHSL = newColor;
      } else {
        // Actualizar color objetivo
        squareData.targetColor = newColor;
      }
      
      squareData.lastColorUpdate = now;
    }
    
    // Interpolar suavemente hacia el color objetivo (muy suave para cambio gradual)
    if (squareData.targetColor && squareData.currentColorHSL) {
      const interpolationSpeed = 0.03; // Velocidad de interpolación muy lenta para cambio suave
      const hueDiff = Math.abs(squareData.targetColor.hue - squareData.currentColorHSL.hue);
      const hueDiffWrapped = Math.min(hueDiff, 360 - hueDiff);
      
      // Interpolar hue (manejar wrap-around)
      let newHue = squareData.currentColorHSL.hue;
      if (hueDiffWrapped < 180) {
        newHue = squareData.currentColorHSL.hue + (squareData.targetColor.hue - squareData.currentColorHSL.hue) * interpolationSpeed;
      } else {
        if (squareData.targetColor.hue > squareData.currentColorHSL.hue) {
          newHue = squareData.currentColorHSL.hue - (360 - (squareData.targetColor.hue - squareData.currentColorHSL.hue)) * interpolationSpeed;
        } else {
          newHue = squareData.currentColorHSL.hue + (360 - (squareData.currentColorHSL.hue - squareData.targetColor.hue)) * interpolationSpeed;
        }
      }
      newHue = ((newHue % 360) + 360) % 360;
      
      // Interpolar saturation y lightness
      const newSaturation = squareData.currentColorHSL.saturation + (squareData.targetColor.saturation - squareData.currentColorHSL.saturation) * interpolationSpeed;
      const newLightness = squareData.currentColorHSL.lightness + (squareData.targetColor.lightness - squareData.currentColorHSL.lightness) * interpolationSpeed;
      
      squareData.currentColorHSL = {
        hue: newHue,
        saturation: newSaturation,
        lightness: newLightness
      };
    } else if (squareData.targetColor) {
      squareData.currentColorHSL = squareData.targetColor;
    }
    
    const color = squareData.currentColorHSL 
      ? `hsl(${Math.round(squareData.currentColorHSL.hue)}, ${Math.round(squareData.currentColorHSL.saturation)}%, ${Math.round(squareData.currentColorHSL.lightness)}%)`
      : '#00ffff';
    
    ctx.save();
    ctx.globalAlpha = squareData.opacity;
    ctx.translate(centerX, centerY);
    
    // Dibujar borde rectangular con grosor fijo de 1px
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeRect(-finalWidth / 2, -finalHeight / 2, finalWidth, finalHeight);
    
    ctx.restore();
  }, [calculateColorFromMusic]);
  
  // Loop principal de renderizado
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const render = (currentTime) => {
      // Limitar a 60fps pero permitir actualizaciones más frecuentes de color
      const deltaTime = currentTime - lastFrameTimeRef.current;
      if (deltaTime < 16.67) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameTimeRef.current = currentTime;
      
      // Asegurar que el canvas esté en la resolución correcta
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
      }
      
      // Limpiar canvas
      ctx.clearRect(0, 0, rect.width, rect.height);
      
      // Dibujar todos los cuadros con borde (el grosor dinámico se calcula en drawBorderSquare)
      borderSquares.forEach(square => {
        const squareData = squareDataRef.current.get(square.id);
        if (squareData && squareData.progress < 1) {
          drawBorderSquare(ctx, square, squareData);
        }
      });
      
      animationFrameRef.current = requestAnimationFrame(render);
    };
    
    animationFrameRef.current = requestAnimationFrame(render);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [borderSquares, drawBorderSquare]);
  
  return (
    <canvas
      ref={canvasRef}
      className="border-squares-canvas"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 20
      }}
    />
  );
};

export default BorderSquaresCanvas;
