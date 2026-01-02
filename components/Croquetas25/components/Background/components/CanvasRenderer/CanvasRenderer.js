import React, { useRef, useEffect, useCallback } from 'react';
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
  diagonalRotationsRef = null // Ref que contiene las rotaciones actuales de las diagonales
}) => {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const imageCacheRef = useRef(new Map()); // Cache de imágenes cargadas
  const offscreenCanvasRef = useRef(null); // Canvas offscreen para imágenes
  const lastFrameTimeRef = useRef(0);
  const squareProgressRef = useRef(new Map()); // Progreso de animación de cada cuadrado
  
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
  useEffect(() => {
    squares.forEach(square => {
      if (square.imageUrl && !imageCacheRef.current.has(square.imageUrl)) {
        preloadImage(square.imageUrl);
      }
    });
  }, [squares, preloadImage]);
  
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
      
      // Dibujar cuadrados
      squares.forEach(square => {
        const progress = getSquareProgress(square);
        if (progress < 1) {
          drawSquare(ctx, square, progress);
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
  }, [squares, diagonales, drawSquare, drawDiagonal, getSquareProgress]);
  
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
        zIndex: 9 // Mismo nivel que las diagonales DOM, debajo del blur overlay (z-index: 10) para que el backdrop-filter funcione
      }}
    />
  );
};

export default CanvasRenderer;

