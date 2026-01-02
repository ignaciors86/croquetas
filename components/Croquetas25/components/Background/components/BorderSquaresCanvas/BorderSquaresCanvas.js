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
          const targetScale = 0.85;
          data.scale = targetScale * progress;
          data.z = -600 + (400 - (-600)) * progress;
          
          // Calcular opacidad
          const fadeStartProgress = 0.6;
          if (progress >= fadeStartProgress) {
            const fadeProgress = (progress - fadeStartProgress) / (1.0 - fadeStartProgress);
            data.opacity = 0.5 * (1 - fadeProgress);
          } else {
            data.opacity = 0.5;
          }
          
          // Calcular opacidad basada en tamaño
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const currentSize = 50 + (300 - 50) * progress;
          const maxRatio = Math.max(currentSize / viewportWidth, currentSize / viewportHeight);
          if (maxRatio > 0.7) {
            data.opacity *= Math.max(0, 1 - ((maxRatio - 0.7) / 0.3));
          }
        }
      });
    };
    
    // Actualizar más frecuentemente para mayor reactividad (cada 8ms = ~120fps)
    const interval = setInterval(updateProgress, 8);
    
    return () => clearInterval(interval);
  }, [borderSquares, animationTimelinesRef]);
  
  // Calcular color basado en música (más sensible y reactivo)
  const calculateColorFromMusic = useCallback((squareData) => {
    if (!dataArrayRef?.current || !analyserRef?.current) {
      // Fallback: color basado en tiempo
      const timeBasedHue = (Date.now() / 50) % 360; // Más rápido
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
      
      // Calcular métricas de audio con mayor sensibilidad
      let sum = 0;
      let bassSum = 0;
      let trebleSum = 0;
      let midSum = 0;
      const bassRange = Math.floor(dataArray.length * 0.15); // Aumentado de 10% a 15%
      const midRange = Math.floor(dataArray.length * 0.5);
      const trebleRange = Math.floor(dataArray.length * 0.7); // Aumentado de 80% a 70%
      
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = dataArray[i] / 255;
        sum += normalized;
        if (i < bassRange) bassSum += normalized;
        if (i >= midRange && i < trebleRange) midSum += normalized;
        if (i >= trebleRange) trebleSum += normalized;
      }
      
      const average = sum / dataArray.length;
      const bassEnergy = bassRange > 0 ? bassSum / bassRange : 0;
      const midEnergy = (trebleRange - midRange) > 0 ? midSum / (trebleRange - midRange) : 0;
      const trebleEnergy = (dataArray.length - trebleRange) > 0 ? trebleSum / (dataArray.length - trebleRange) : 0;
      
      // Calcular spectral centroid con mayor peso en frecuencias altas
      let weightedSum = 0;
      let magnitudeSum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const magnitude = dataArray[i] / 255;
        // Dar más peso a frecuencias altas para mayor reactividad
        const weight = i * (1 + magnitude * 0.5);
        weightedSum += weight * magnitude;
        magnitudeSum += magnitude;
      }
      const spectralCentroid = magnitudeSum > 0 ? weightedSum / magnitudeSum / dataArray.length : 0;
      
      // Calcular color con mayor sensibilidad y variación
      // Hue: más variación basada en spectral centroid
      const hue = (spectralCentroid * 400) % 360; // Aumentado de 360 a 400 para más variación
      
      // Saturation: más reactiva a la energía total
      const totalEnergy = (bassEnergy + midEnergy + trebleEnergy) / 3;
      const saturation = Math.min(100, Math.max(60, 60 + totalEnergy * 60)); // Rango más amplio: 60-100%
      
      // Lightness: más reactiva a la intensidad y energía
      const energyFactor = (bassEnergy * 0.4 + midEnergy * 0.3 + trebleEnergy * 0.3);
      const lightness = Math.min(85, Math.max(45, 45 + (energyFactor + squareData.intensity) * 50)); // Rango más amplio
      
      return {
        hue: Math.round(hue),
        saturation: Math.round(saturation),
        lightness: Math.round(lightness)
      };
    } catch (error) {
      const timeBasedHue = (Date.now() / 50) % 360;
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
  
  // Calcular grosor dinámico del borde basado en frecuencias de audio
  const calculateDynamicLineWidth = useCallback((squareData) => {
    if (!dataArrayRef?.current || !analyserRef?.current) {
      return 1.5; // Grosor base si no hay audio
    }
    
    try {
      const dataArray = dataArrayRef.current;
      const analyser = analyserRef.current;
      
      analyser.getByteFrequencyData(dataArray);
      
      // Dividir el espectro en rangos de frecuencia para ecualización dinámica
      const bassRange = Math.floor(dataArray.length * 0.1); // 0-10%: graves
      const lowMidRange = Math.floor(dataArray.length * 0.3); // 10-30%: medios-bajos
      const midRange = Math.floor(dataArray.length * 0.6); // 30-60%: medios
      const highMidRange = Math.floor(dataArray.length * 0.8); // 60-80%: medios-altos
      // 80-100%: agudos
      
      // Calcular energía en cada rango
      let bassEnergy = 0;
      let lowMidEnergy = 0;
      let midEnergy = 0;
      let highMidEnergy = 0;
      let trebleEnergy = 0;
      
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = dataArray[i] / 255;
        if (i < bassRange) {
          bassEnergy += normalized;
        } else if (i < lowMidRange) {
          lowMidEnergy += normalized;
        } else if (i < midRange) {
          midEnergy += normalized;
        } else if (i < highMidRange) {
          highMidEnergy += normalized;
        } else {
          trebleEnergy += normalized;
        }
      }
      
      // Normalizar energías (evitar división por cero)
      bassEnergy = bassRange > 0 ? bassEnergy / bassRange : 0;
      lowMidEnergy = (lowMidRange - bassRange) > 0 ? lowMidEnergy / (lowMidRange - bassRange) : 0;
      midEnergy = (midRange - lowMidRange) > 0 ? midEnergy / (midRange - lowMidRange) : 0;
      highMidEnergy = (highMidRange - midRange) > 0 ? highMidEnergy / (highMidRange - midRange) : 0;
      trebleEnergy = (dataArray.length - highMidRange) > 0 ? trebleEnergy / (dataArray.length - highMidRange) : 0;
      
      // Combinar energías con pesos diferentes para crear un ecualizador dinámico
      // Los graves y agudos tienen más impacto visual
      const combinedEnergy = (
        bassEnergy * 0.3 +      // Graves: 30%
        lowMidEnergy * 0.15 +   // Medios-bajos: 15%
        midEnergy * 0.2 +       // Medios: 20%
        highMidEnergy * 0.15 +  // Medios-altos: 15%
        trebleEnergy * 0.2      // Agudos: 20%
      );
      
      // Grosor base más fino
      const baseLineWidth = 1.5;
      // Rango dinámico: de 1.5 a 8 píxeles
      const minLineWidth = 1.5;
      const maxLineWidth = 8;
      
      // Aplicar curva de respuesta no lineal para más dinamismo
      // Usar exponencial para que los picos sean más pronunciados
      const energyPower = Math.pow(combinedEnergy, 0.6); // Exponente < 1 para más sensibilidad
      
      // Calcular grosor dinámico
      const dynamicLineWidth = minLineWidth + (maxLineWidth - minLineWidth) * energyPower;
      
      // Aplicar suavizado para evitar cambios bruscos
      if (!squareData.currentLineWidth) {
        squareData.currentLineWidth = dynamicLineWidth;
      } else {
        // Interpolación suave pero rápida para mantener dinamismo
        const smoothingFactor = 0.3; // Más bajo = más rápido (más dinámico)
        squareData.currentLineWidth = squareData.currentLineWidth * (1 - smoothingFactor) + dynamicLineWidth * smoothingFactor;
      }
      
      return squareData.currentLineWidth;
    } catch (error) {
      return 1.5; // Fallback a grosor base
    }
  }, [analyserRef, dataArrayRef]);
  
  // Dibujar un cuadrado con borde
  const drawBorderSquare = useCallback((ctx, square, squareData) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;
    
    // Calcular tamaño base (igual que GSAP: desde 0 hasta targetScale * viewport)
    // Los cuadros deben ocupar toda la ventana cuando están a escala completa
    const targetScale = 0.85;
    const scale = squareData.scale;
    
    // El tamaño base es el viewport completo
    // Cuando scale = targetScale (0.85), debe ocupar el 100% del viewport
    // Por lo tanto: finalSize = viewportSize * (scale / targetScale)
    const finalWidth = (viewportWidth / targetScale) * scale;
    const finalHeight = (viewportHeight / targetScale) * scale;
    
    // Calcular color desde música con interpolación suave
    const now = Date.now();
    const timeSinceLastUpdate = now - squareData.lastColorUpdate;
    
    // Actualizar color objetivo cada 16ms (60fps)
    if (timeSinceLastUpdate >= 16) {
      const newColor = calculateColorFromMusic(squareData);
      
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
    
    // Interpolar suavemente hacia el color objetivo
    if (squareData.targetColor && squareData.currentColorHSL) {
      const interpolationSpeed = 0.15; // Velocidad de interpolación (0-1)
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
    
    // Calcular grosor dinámico del borde basado en frecuencias
    const dynamicLineWidth = calculateDynamicLineWidth(squareData);
    
    ctx.save();
    ctx.globalAlpha = squareData.opacity;
    ctx.translate(centerX, centerY);
    
    // Dibujar borde rectangular con grosor dinámico que ecualiza la música
    ctx.strokeStyle = color;
    ctx.lineWidth = dynamicLineWidth;
    ctx.lineCap = 'round'; // Bordes redondeados para mejor apariencia
    ctx.lineJoin = 'round';
    ctx.strokeRect(-finalWidth / 2, -finalHeight / 2, finalWidth, finalHeight);
    
    ctx.restore();
  }, [calculateColorFromMusic, calculateDynamicLineWidth]);
  
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
