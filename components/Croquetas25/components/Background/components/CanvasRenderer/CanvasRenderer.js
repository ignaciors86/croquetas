import React, { useRef, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import { IMAGE_SIZES } from '../../variables';
import './CanvasRenderer.scss';

/**
 * Componente Canvas optimizado para renderizar cuadrados, diagonales e imágenes
 * de forma más eficiente que elementos DOM individuales.
 * 
 * Ventajas:
 * - Un solo elemento canvas en lugar de múltiples divs
 * - Renderizado batch más eficiente
 * - Mejor control sobre el dibujado individual
 * - Menor sobrecarga del navegador
 * - Renderizado más firme y limpio de elementos individuales
 */
const CanvasRenderer = ({ 
  squares = [], 
  diagonales = [], 
  analyserRef, 
  dataArrayRef,
  selectedTrack,
  diagonalRotationsRef = null, // Ref que contiene las rotaciones actuales de las diagonales
  animationTimelinesRef = null, // Ref que contiene las timelines de GSAP para cuadrados con borde
  squareRefs = null // Ref a los elementos DOM de los cuadrados para leer valores de GSAP
}) => {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const imageCacheRef = useRef(new Map()); // Cache de imágenes cargadas
  const offscreenCanvasRef = useRef(null); // Canvas offscreen para imágenes
  const lastFrameTimeRef = useRef(0);
  const borderSquareDataRef = useRef(new Map()); // Datos de animación de cuadrados con borde (desde GSAP)
  const imageSquareDataRef = useRef(new Map()); // Datos de animación de cuadrados con imagen (desde GSAP)
  const colorUpdateFrameRef = useRef(0);
  
  // Guardar squareRefs para poder leer valores de GSAP
  useEffect(() => {
    if (squareRefs) {
      // squareRefs es un objeto con refs a elementos DOM
      // No necesitamos hacer nada aquí, solo usarlo en el render
    }
  }, [squareRefs]);
  
  // Inicializar canvas y contexto
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', { 
      alpha: true,
      desynchronized: true, // Mejora rendimiento en algunos navegadores
      willReadFrequently: false // Optimización para no leer píxeles frecuentemente
    });
    
    // Configurar tamaño del canvas
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Crear canvas offscreen para imágenes
    offscreenCanvasRef.current = document.createElement('canvas');
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);
  
  // Precargar imágenes en cache
  const preloadImage = useCallback((url) => {
    if (imageCacheRef.current.has(url)) {
      return imageCacheRef.current.get(url);
    }
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const promise = new Promise((resolve, reject) => {
      img.onload = () => {
        imageCacheRef.current.set(url, img);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
    
    return promise;
  }, []);
  
  // Precargar todas las imágenes de los cuadrados
  const preloadImageRef = React.useRef(preloadImage);
  React.useEffect(() => {
    preloadImageRef.current = preloadImage;
  }, [preloadImage]);

  useEffect(() => {
    squares.forEach(square => {
      if (square.imageUrl && !imageCacheRef.current.has(square.imageUrl)) {
        preloadImageRef.current(square.imageUrl);
      }
    });
  }, [squares]);
  
  // Filtrar cuadrados con borde (sin imagen) y con imagen
  const borderSquares = squares.filter(square => !square.isTarget);
  const imageSquares = squares.filter(square => square.isTarget);
  
  // Detectar GIFs - estos deben renderizarse en DOM porque canvas no soporta animación de GIFs
  const isGif = useCallback((url) => {
    if (!url) return false;
    const urlLower = url.toLowerCase();
    return urlLower.endsWith('.gif');
  }, []);
  
  const gifSquares = imageSquares.filter(square => square.imageUrl && isGif(square.imageUrl));
  const canvasImageSquares = imageSquares.filter(square => !square.imageUrl || !isGif(square.imageUrl));
  
  // Inicializar datos de animación para cuadrados con imagen (desde GSAP) - solo los que van en canvas
  useEffect(() => {
    canvasImageSquares.forEach(square => {
      if (!imageSquareDataRef.current.has(square.id)) {
        imageSquareDataRef.current.set(square.id, {
          x: 0,
          y: 0,
          scale: 0,
          z: -600,
          rotation: square.imageRotation ?? 0,
          opacity: 1,
          imageUrl: square.imageUrl
        });
      } else {
        // Actualizar imageUrl si cambió
        const data = imageSquareDataRef.current.get(square.id);
        if (data.imageUrl !== square.imageUrl) {
          data.imageUrl = square.imageUrl;
        }
      }
    });
    
    // Limpiar cuadros que ya no existen
    const existingIds = new Set(canvasImageSquares.map(s => s.id));
    imageSquareDataRef.current.forEach((data, id) => {
      if (!existingIds.has(id)) {
        imageSquareDataRef.current.delete(id);
      }
    });
  }, [canvasImageSquares]);
  
  // Actualizar datos de animación desde GSAP para cuadrados con imagen (solo canvas)
  useEffect(() => {
    const updateImageSquareData = () => {
      canvasImageSquares.forEach(square => {
        const el = squareRefs?.current?.[square.id];
        const data = imageSquareDataRef.current.get(square.id);
        
        if (el && data) {
          // Leer valores de transformación desde GSAP directamente
          const scale = gsap.getProperty(el, 'scale') || 0;
          const z = gsap.getProperty(el, 'z') || -600;
          const opacity = gsap.getProperty(el, 'opacity') !== undefined ? gsap.getProperty(el, 'opacity') : 1;
          
          // Leer posición actual desde GSAP (x, y) - GSAP anima desde el centro absoluto (50%, 50%) a la posición final
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          
          // GSAP anima el elemento desde el centro absoluto, así que leer la posición transformada
          const gsapX = gsap.getProperty(el, 'x') || 0;
          const gsapY = gsap.getProperty(el, 'y') || 0;
          
          // Calcular posición final desde imagePosition (porcentajes)
          let finalX = viewportWidth / 2; // Por defecto centro
          let finalY = viewportHeight / 2;
          
          if (square.imagePosition) {
            const xPercent = parseFloat(square.imagePosition.x) || 50;
            const yPercent = parseFloat(square.imagePosition.y) || 50;
            finalX = (xPercent / 100) * viewportWidth;
            finalY = (yPercent / 100) * viewportHeight;
          }
          
          // La posición actual es el centro absoluto + el desplazamiento de GSAP
          const x = viewportWidth / 2 + gsapX;
          const y = viewportHeight / 2 + gsapY;
          
          // Leer rotación
          const rotation = square.imageRotation ?? 0;
          
          // Actualizar datos
          data.x = x;
          data.y = y;
          data.scale = scale;
          data.z = z;
          data.rotation = rotation;
          data.opacity = opacity;
        }
      });
    };
    
    // Actualizar frecuentemente para sincronización suave
    const interval = setInterval(updateImageSquareData, 16); // ~60fps
    
    return () => clearInterval(interval);
  }, [canvasImageSquares, squareRefs]);
  
  // Inicializar datos de animación para cuadrados con borde (desde GSAP)
  useEffect(() => {
    borderSquares.forEach(square => {
      if (!borderSquareDataRef.current.has(square.id)) {
        borderSquareDataRef.current.set(square.id, {
          progress: 0,
          scale: 0,
          z: -600,
          opacity: 0.5,
          lastOpacity: 0.5,
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
    borderSquareDataRef.current.forEach((data, id) => {
      if (!existingIds.has(id)) {
        borderSquareDataRef.current.delete(id);
      }
    });
  }, [borderSquares]);
  
  // Actualizar progreso desde GSAP para cuadrados con borde
  useEffect(() => {
    const updateProgress = () => {
      borderSquares.forEach(square => {
        const timeline = animationTimelinesRef?.current?.[square.id];
        const data = borderSquareDataRef.current.get(square.id);
        
        if (timeline && data) {
          const progress = timeline.progress();
          data.progress = progress;
          
          // Calcular scale y z desde el progreso (igual que GSAP)
          const targetScale = 1.0;
          data.scale = targetScale * progress;
          data.z = -600 + (400 - (-600)) * progress;
          
          // Calcular opacidad objetivo
          const fadeStartProgress = 0.6;
          let targetOpacity = 0.5;
          if (progress >= fadeStartProgress) {
            const fadeProgress = (progress - fadeStartProgress) / (1.0 - fadeStartProgress);
            targetOpacity = 0.5 * (1 - fadeProgress);
          }
          
          // Suavizar cambios de opacidad
          if (data.lastOpacity === undefined) {
            data.lastOpacity = targetOpacity;
          }
          const opacitySmoothing = 0.2;
          data.opacity = data.lastOpacity * (1 - opacitySmoothing) + targetOpacity * opacitySmoothing;
          data.lastOpacity = data.opacity;
        }
      });
    };
    
    // Actualizar más frecuentemente para mayor suavidad (cada 4ms)
    const interval = setInterval(updateProgress, 4);
    
    return () => clearInterval(interval);
  }, [borderSquares, animationTimelinesRef]);
  
  // Calcular color basado en música para cuadrados con borde
  const calculateColorFromMusic = useCallback(() => {
    if (!dataArrayRef?.current || !analyserRef?.current) {
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
      const hue = (spectralCentroid * 300) % 360;
      const saturation = 70;
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
  
  // Grosor fijo de 1px para cuadrados con borde
  const LINE_WIDTH = 1;
  
  // Dibujar un cuadrado con borde (usando datos de GSAP)
  const drawBorderSquare = useCallback((ctx, square, squareData) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;
    
    // Calcular tamaño base (igual que GSAP: desde 0 hasta targetScale * viewport)
    const targetScale = 1.0;
    const scale = squareData.scale;
    
    // El tamaño base es el viewport completo
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
    
    // Interpolar suavemente hacia el color objetivo
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
  
  // Dibujar un cuadrado con imagen (usando datos de GSAP)
  const drawImageSquare = useCallback((ctx, square, squareData) => {
    if (!squareData || !squareData.imageUrl) return;
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    const currentX = squareData.x;
    const currentY = squareData.y;
    const currentScale = squareData.scale;
    const rotation = squareData.rotation;
    const opacity = squareData.opacity;
    
    // Calcular tamaño basado en scale (igual que GSAP: scale de 0 a 1.0)
    // En DOM: el elemento tiene width: 100% y height: 100%, y la imagen tiene max-width/max-height definidos en variables
    // El scale se aplica al elemento completo, pero la imagen está limitada por max-width/max-height
    // Cuando scale = 1.0, la imagen tiene maxViewportSizeForImage de tamaño
    const isLandscape = viewportWidth > viewportHeight;
    // Usar valores de variables para mantener consistencia
    const maxViewportSizeForImage = isLandscape 
      ? viewportHeight * IMAGE_SIZES.MAX_SIZE_LANDSCAPE 
      : viewportHeight * IMAGE_SIZES.MAX_SIZE_PORTRAIT;
    
    // El tamaño de la imagen es proporcional al scale, limitado por maxViewportSizeForImage
    // Cuando scale = 1.0, la imagen tiene maxViewportSizeForImage de tamaño
    const currentSize = maxViewportSizeForImage * currentScale;
    
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(currentX, currentY);
    ctx.rotate((rotation * Math.PI) / 180);
    
    // Dibujar imagen
    const img = imageCacheRef.current.get(squareData.imageUrl);
    if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      // Calcular tamaño manteniendo proporción de la imagen (object-fit: contain)
      const imgAspectRatio = img.naturalWidth / img.naturalHeight;
      let imgWidth, imgHeight;
      
      // currentSize ya está limitado a maxViewportSizeForImage
      if (imgAspectRatio > 1) {
        // Imagen horizontal
        imgWidth = currentSize;
        imgHeight = imgWidth / imgAspectRatio;
      } else {
        // Imagen vertical
        imgHeight = currentSize;
        imgWidth = imgHeight * imgAspectRatio;
      }
      
      // Detectar tipo de imagen para aplicar sombra (JPEG y GIF tienen sombra, PNG no)
      const imageUrlLower = squareData.imageUrl.toLowerCase();
      const isJpeg = imageUrlLower.endsWith('.jpg') || imageUrlLower.endsWith('.jpeg');
      const isGif = imageUrlLower.endsWith('.gif');
      const shouldHaveShadow = isJpeg || isGif;
      
      // Aplicar sombra si es JPEG o GIF - IMPORTANTE: aplicar sombra ANTES de dibujar
      if (shouldHaveShadow) {
        // Primera sombra (más grande y difusa)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;
        ctx.drawImage(img, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight);
        
        // Segunda sombra (más pequeña y definida)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
        ctx.drawImage(img, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight);
        
        // Resetear sombra para el siguiente dibujado
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      } else {
        // Sin sombra para PNG (tiene transparencia)
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.drawImage(img, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight);
      }
    }
    
    ctx.restore();
  }, [imageCacheRef]);
  
  // Calcular progreso de animación para un cuadrado
  const getSquareProgress = useCallback((square) => {
    if (!squareProgressRef.current.has(square.id)) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Calcular posición inicial desde imagePosition (porcentajes)
      let startX = viewportWidth / 2;
      let startY = viewportHeight / 2;
      
      if (square.imagePosition) {
        const xPercent = parseFloat(square.imagePosition.x) || 50;
        const yPercent = parseFloat(square.imagePosition.y) || 50;
        startX = (xPercent / 100) * viewportWidth;
        startY = (yPercent / 100) * viewportHeight;
      }
      
      // La posición final es la misma que la inicial (no se mueven, solo crecen)
      const endX = startX;
      const endY = startY;
      
      squareProgressRef.current.set(square.id, {
        startTime: Date.now(),
        progress: 0,
        startX,
        startY,
        endX,
        endY
      });
    }
    
    const animData = squareProgressRef.current.get(square.id);
    const now = Date.now();
    const elapsed = (now - animData.startTime) / 1000; // segundos
    
    // Calcular duración basada en el tipo de cuadrado
    const intensity = square.data?.intensity ?? 0.5;
    const isTarget = square.isTarget;
    let baseDuration;
    if (isTarget) {
      baseDuration = square.type === 'beat' ? 10 : 8;
    } else {
      baseDuration = square.type === 'beat' ? 15 : 12;
    }
    const duration = baseDuration - (intensity * 2);
    
    const progress = Math.min(1, elapsed / duration);
    animData.progress = progress;
    
    // Si el progreso es 1, limpiar después de un delay
    if (progress >= 1) {
      setTimeout(() => {
        squareProgressRef.current.delete(square.id);
      }, 200);
    }
    
    return progress;
  }, []);
  
  // Dibujar un cuadrado
  const drawSquare = useCallback((ctx, square, progress) => {
    const isTarget = square.isTarget;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Obtener datos de animación guardados
    const animData = squareProgressRef.current.get(square.id);
    if (!animData) return;
    
    // Calcular posición y tamaño basado en el progreso
    const startX = animData.startX;
    const startY = animData.startY;
    const endX = animData.endX;
    const endY = animData.endY;
    
    const currentX = startX + (endX - startX) * progress;
    const currentY = startY + (endY - startY) * progress;
    
    // Calcular tamaño (crece con el progreso, usando escala similar a GSAP)
    const minSize = 50;
    const maxSize = isTarget ? 400 : 300;
    // Usar ease similar a GSAP power1.out
    const easedProgress = 1 - Math.pow(1 - progress, 1);
    const currentSize = minSize + (maxSize - minSize) * easedProgress;
    
    // Calcular rotación
    const baseRotation = square.imageRotation ?? 0;
    const rotation = baseRotation; // Rotación base del cuadrado
    
    // Calcular opacidad (fade out al final)
    let opacity = 1;
    if (isTarget) {
      // Para cuadrados con imagen: fade out al 70%
      if (progress > 0.7) {
        opacity = 1 - ((progress - 0.7) / 0.3);
      }
    } else {
      // Para cuadrados sin imagen: opacidad base 0.5 y fade out al 60%
      opacity = 0.5;
      if (progress > 0.6) {
        const fadeProgress = (progress - 0.6) / 0.4;
        opacity = 0.5 * (1 - fadeProgress);
      }
      
      // Reducir opacidad si se acerca al tamaño completo de la ventana
      const maxRatio = Math.max(currentSize / viewportWidth, currentSize / viewportHeight);
      if (maxRatio > 0.7) {
        opacity *= Math.max(0, 1 - ((maxRatio - 0.7) / 0.3));
      }
    }
    
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(currentX, currentY);
    ctx.rotate((rotation * Math.PI) / 180);
    
    if (isTarget && square.imageUrl) {
      // Dibujar cuadrado con imagen
      const img = imageCacheRef.current.get(square.imageUrl);
      if (img) {
        // Dibujar borde con gradiente
        const gradient = ctx.createLinearGradient(
          -currentSize / 2, -currentSize / 2,
          currentSize / 2, currentSize / 2
        );
        const color1 = square.gradient?.color1 || '#00ffff';
        const color2 = square.gradient?.color2 || '#00ffff';
        gradient.addColorStop(0, color1);
        gradient.addColorStop(1, color2);
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4;
        ctx.strokeRect(-currentSize / 2, -currentSize / 2, currentSize, currentSize);
        
        // Dibujar imagen
        const imgSize = currentSize * 0.9; // Imagen ligeramente más pequeña que el borde
        ctx.drawImage(
          img,
          -imgSize / 2,
          -imgSize / 2,
          imgSize,
          imgSize
        );
      }
    } else {
      // Dibujar cuadrado solo con borde (color sólido)
      const borderColor = square.borderColor || square.data?.borderColor || '#00ffff';
      
      // Actualizar color basado en música si hay datos disponibles
      let finalColor = borderColor;
      if (dataArrayRef?.current && analyserRef?.current && square.data) {
        const data = square.data;
        const spectralCentroid = data.spectralCentroid ?? 0;
        const bassEnergy = data.bassEnergy ?? 0;
        const trebleEnergy = data.trebleEnergy ?? 0;
        const rhythmEnergy = data.rhythmEnergy ?? 0;
        const intensity = data.intensity ?? 0.5;
        
        const hue = (spectralCentroid * 360) % 360;
        const saturation = Math.min(100, Math.max(50, 50 + (bassEnergy + trebleEnergy) * 50));
        const lightness = Math.min(90, Math.max(40, 40 + (rhythmEnergy + intensity) * 30));
        
        finalColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      }
      
      ctx.strokeStyle = finalColor;
      ctx.lineWidth = 4;
      ctx.strokeRect(-currentSize / 2, -currentSize / 2, currentSize, currentSize);
    }
    
    ctx.restore();
  }, [analyserRef, dataArrayRef, imageCacheRef]);
  
  // Dibujar una diagonal
  const drawDiagonal = useCallback((ctx, diag, rotation) => {
    if (diag.isFixed) {
      // Diagonales fijas
      const width = window.innerWidth;
      const height = window.innerHeight;
      const diagonal = Math.sqrt(width * width + height * height);
      const lineWidth = diagonal * 1.5;
      
      let angle = 0;
      if (diag.id === 'diag-fixed-1') {
        angle = Math.atan2(height, width) * (180 / Math.PI);
      } else if (diag.id === 'diag-fixed-2') {
        angle = Math.atan2(height, -width) * (180 / Math.PI);
      }
      
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate((angle * Math.PI) / 180);
      
      // Calcular color basado en música
      let color = '#00ffff';
      if (dataArrayRef?.current && analyserRef?.current) {
        // Usar datos de audio para color dinámico
        const spectralCentroid = 0.5; // Valor por defecto
        const hue = (spectralCentroid * 360) % 360;
        color = `hsl(${hue}, 70%, 60%)`;
      }
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-lineWidth / 2, 0);
      ctx.lineTo(lineWidth / 2, 0);
      ctx.stroke();
      
      ctx.restore();
    } else {
      // Diagonales dinámicas
      const width = window.innerWidth;
      const height = window.innerHeight;
      const centerX = width / 2;
      const centerY = height / 2;
      
      // Calcular posición basada en tiempo y velocidad
      const now = Date.now();
      const elapsed = (now - diag.createdAt) / 1000;
      const speed = diag.speed || 1;
      const distance = elapsed * speed * 100; // píxeles por segundo
      
      const currentAngle = (diag.baseAngle + rotation) % 360;
      const angleRad = (currentAngle * Math.PI) / 180;
      
      const lineLength = 200 + (distance * 0.5);
      
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(angleRad);
      
      // Calcular opacidad (fade out con distancia)
      let opacity = diag.opacity ?? 1;
      const maxDistance = Math.sqrt(width * width + height * height);
      if (distance > maxDistance * 0.3) {
        opacity *= Math.max(0, 1 - ((distance - maxDistance * 0.3) / (maxDistance * 0.7)));
      }
      
      ctx.globalAlpha = opacity;
      
      // Calcular color basado en música
      let color = '#00ffff';
      if (dataArrayRef?.current && analyserRef?.current) {
        const spectralCentroid = 0.5;
        const hue = (spectralCentroid * 360) % 360;
        color = `hsl(${hue}, 70%, 60%)`;
      }
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-lineLength / 2, 0);
      ctx.lineTo(lineLength / 2, 0);
      ctx.stroke();
      
      ctx.restore();
    }
  }, [analyserRef, dataArrayRef]);
  
  // Loop principal de renderizado
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
      
      // Limpiar canvas
      ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
      
      // Dibujar diagonales
      diagonales.forEach(diag => {
        let rotation = 0;
        if (diagonalRotationsRef?.current?.[diag.id]) {
          rotation = diagonalRotationsRef.current[diag.id].current || 0;
        }
        drawDiagonal(ctx, diag, rotation);
      });
      
      // Dibujar cuadrados con borde PRIMERO (detrás)
      borderSquares.forEach(square => {
        const squareData = borderSquareDataRef.current.get(square.id);
        if (squareData && squareData.progress < 1) {
          drawBorderSquare(ctx, square, squareData);
        }
      });
      
      // Dibujar cuadrados con imagen DESPUÉS (delante de los bordes) - solo los que NO son GIFs
      canvasImageSquares.forEach(square => {
        const squareData = imageSquareDataRef.current.get(square.id);
        if (squareData && squareData.opacity > 0) {
          drawImageSquare(ctx, square, squareData);
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
  }, [borderSquares, canvasImageSquares, diagonales, drawDiagonal, drawBorderSquare, drawImageSquare]);
  
  return (
    <canvas 
      ref={canvasRef} 
      className="canvas-renderer"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 20 // Mismo nivel que tenía BorderSquaresCanvas, sobre las diagonales
      }}
    />
  );
};

export default CanvasRenderer;

