import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { IMAGE_SIZES } from './variables';
import './Background.scss';
import Diagonales from './components/Diagonales/Diagonales';
import BorderSquaresSynthesizer from './components/BorderSquaresSynthesizer/BorderSquaresSynthesizer';
import DiagonalSynthesizer from './components/DiagonalSynthesizer/DiagonalSynthesizer';
import { useGallery } from '../Gallery/Gallery';

const MAINCLASS = 'background';

const Background = ({ onTriggerCallbackRef, analyserRef, dataArrayRef, isInitialized, onVoiceCallbackRef, selectedTrack, showOnlyDiagonales = false, currentAudioIndex = null, onAllComplete = null, pause = null, isPlaying = true }) => {
  const [squares, setSquares] = useState([]);
  // Estado para forzar recálculo cuando cambian las dimensiones
  const [viewportDimensions, setViewportDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080
  }));
  const squareRefs = useRef({});
  const animationTimelinesRef = useRef({});
  const lastProgressRef = useRef(0);
  const colorIndexRef = useRef(0);
  const recentImagePositionsRef = useRef([]); // Track de posiciones recientes para evitar solapamientos
  const { getNextImage, allImages, isLoading, preloadNextImages, isLastImageRef } = useGallery(selectedTrack, null, onAllComplete, currentAudioIndex, !showOnlyDiagonales);
  const MAX_SQUARES = 50;
  
  // Detectar si es Nachitos de Nochevieja (para no pausar animaciones)
  const isMainCroqueta = selectedTrack && (
    selectedTrack.name?.toLowerCase().includes('nachitos de nochevieja') ||
    selectedTrack.name?.toLowerCase().includes('nachitos-de-nochevieja') ||
    selectedTrack.id?.toLowerCase().includes('nachitos-de-nochevieja')
  );
  
  // Pre-cargar imágenes próximas cuando cambian las imágenes disponibles
  useEffect(() => {
    if (!isLoading && allImages.length > 0) {
      preloadNextImages();
    }
  }, [isLoading, allImages.length, preloadNextImages]);
  
  const lastImageTimeRef = useRef(0);
  
  // Manejar resize y fullscreen changes para recalcular dimensiones
  useEffect(() => {
    const updateDimensions = () => {
      setViewportDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    // Actualizar dimensiones inmediatamente
    updateDimensions();

    // Listeners para resize y cambios de orientación
    window.addEventListener('resize', updateDimensions);
    window.addEventListener('orientationchange', updateDimensions);

    // Listeners para cambios de fullscreen
    const handleFullscreenChange = () => {
      // Pequeño delay para asegurar que las dimensiones se hayan actualizado
      setTimeout(updateDimensions, 100);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('orientationchange', updateDimensions);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);
  
  useEffect(() => {
    if (!onTriggerCallbackRef || showOnlyDiagonales) return;
    
    const createCallback = () => {
      onTriggerCallbackRef.current = (type, data = {}) => {
        const now = Date.now();
        const shouldHaveBackground = data.shouldBeSolid || false;
        
        // Si NO tiene imagen (cuadrado con borde), el sintetizador se encarga de generarlo
        // No crear nada en el estado para cuadrados con borde
        if (!shouldHaveBackground) {
          return; // El sintetizador procedural generará el cuadrado con borde
        }
        
        // Solo procesar cuadrados con imagen
        // Para Nachitos: más sensible (menos tiempo entre imágenes)
        const MIN_TIME_BETWEEN_IMAGES = isMainCroqueta ? 1000 : 2500; // 1 segundo para Nachitos, 2.5 para otras
        // Si es una imagen y no ha pasado el tiempo mínimo, ignorar
        if (now - lastImageTimeRef.current < MIN_TIME_BETWEEN_IMAGES) {
          return;
        }
        
        // Actualizar el tiempo para la próxima imagen
        lastImageTimeRef.current = now;
        
      const id = `square-${Date.now()}-${Math.random()}`;
      const lgtbColors = [
        '#FF0080', '#FF8000', '#FFFF00', '#00FF00', '#0080FF', '#8000FF',
        '#00FFFF', '#FF00FF', '#FFFFFF', '#FFB347', '#FFD700', '#C0C0C0',
      ];
      
      const intensity = data?.intensity ?? 0.5;
      
      // Para cuadrados con imagen, usar gradiente
      let color1 = null;
      let color2 = null;
      
        // Para cuadrados con imagen, mantener el gradiente
        color1 = lgtbColors[colorIndexRef.current % lgtbColors.length];
        color2 = lgtbColors[(colorIndexRef.current + 1) % lgtbColors.length];
        colorIndexRef.current++;
      
      // Solo obtener imagen si está lista (pre-cargada)
      let imageUrl = null;
      let isLastImage = false;
      if (shouldHaveBackground) {
        // Verificar si la próxima imagen será la última ANTES de obtenerla
        isLastImage = isLastImageRef?.current || false;
        const nextImage = getNextImage();
        
        // getNextImage ya verifica que la imagen esté en estado 'ready' y completamente cargada
        // Si devuelve null, significa que no hay imágenes listas
        if (!nextImage) {
          // No hay imagen lista, no crear cuadrado
          return;
        }
        
        imageUrl = nextImage;
      }
      
      // Calcular posición evitando la zona central inferior donde está el prompt
      let imagePosition = null;
      if (shouldHaveBackground && imageUrl) {
        // Zona a evitar: central inferior (donde está el prompt)
        // En landscape: bottom 10%, width 60%, left 20% (zona 20%-80% x, 0%-15% y desde abajo)
        // En portrait: bottom 4%, width 90%, left 5% (zona 5%-95% x, 0%-20% y desde abajo)
        
        // Detectar orientación usando las dimensiones actualizadas
        const isPortrait = viewportDimensions.height > viewportDimensions.width;
        const viewportWidth = viewportDimensions.width;
        const viewportHeight = viewportDimensions.height;
        
        // Calcular tamaño máximo de imagen según CSS
        // Desktop: max-width y max-height = 120dvh (120% del viewport height para landscape)
        // Portrait: max-width y max-height = 100dvh, pero con scale(0.5), así que tamaño efectivo = 50dvh
        // Tamaño fijo independiente de la velocidad de la música
        let maxImageWidth, maxImageHeight;
        if (isPortrait) {
          // En portrait, el scale(0.5) hace que el tamaño efectivo sea la mitad
          maxImageWidth = viewportHeight * 0.5; // 50% del viewport height
          maxImageHeight = viewportHeight * 0.5;
        } else {
          // En desktop/landscape, usar 120% del viewport height (tamaño fijo)
          maxImageWidth = viewportHeight * 1.2; // 120% del viewport height
          maxImageHeight = viewportHeight * 1.2;
        }
        
        // Calcular márgenes necesarios para mantener imagen completa dentro de límites
        // Como la imagen está centrada (translate(-50%, -50%)), necesitamos la mitad del tamaño como margen
        const marginXPercent = (maxImageWidth / 2) / viewportWidth * 100;
        const marginYPercent = (maxImageHeight / 2) / viewportHeight * 100;
        
        // Área válida considerando márgenes (para que la imagen completa quede dentro)
        // Reducir desplazamiento horizontal (X) para limitar el rango de lanzamiento
        const sideExpansion = isPortrait ? 8 : 10; // Reducido para limitar desplazamiento horizontal
        const topExpansion = isPortrait ? 25 : 30; // Aumentado significativamente
        const bottomExpansion = isPortrait ? 5 : 10; // Aumentado para centrar mejor en Y
        // Limitar más el rango horizontal: reducir el área disponible en X
        const xLimit = 30; // Límite adicional en porcentaje (30% desde cada lado = 40% del centro disponible)
        const minX = Math.max(xLimit, marginXPercent - sideExpansion); // Limitar desplazamiento a los lados
        const maxX = Math.min(100 - xLimit, 100 - marginXPercent + sideExpansion); // Limitar desplazamiento a los lados
        // Centrar mejor en Y: más espacio arriba y abajo para que no se corte
        const minY = Math.max(0, marginYPercent - topExpansion); // Mucho más espacio arriba
        const maxY = Math.min(100, 100 - marginYPercent + bottomExpansion); // Más espacio abajo también
        
        // Zona a evitar (prompt) en coordenadas
        let avoidMinX, avoidMaxX, avoidMinY, avoidMaxY;
        if (isPortrait) {
          avoidMinX = 5;
          avoidMaxX = 95;
          avoidMinY = 80; // Desde arriba (100% - 20%)
          avoidMaxY = 100;
        } else {
          avoidMinX = 20;
          avoidMaxX = 80;
          avoidMinY = 85; // Desde arriba (100% - 15%)
          avoidMaxY = 100;
        }
        
        // Limpiar posiciones antiguas (más de 2 segundos)
        const now = Date.now();
        recentImagePositionsRef.current = recentImagePositionsRef.current.filter(pos => now - pos.timestamp < 2000);
        
        let x, y;
        let attempts = 0;
        const maxAttempts = 100; // Aumentar intentos para mejor distribución
        
        // Distribución mejorada: usar toda la altura y ancho, especialmente arriba y los lados
        // Dividir el área válida en zonas para mejor distribución
        const availableHeight = avoidMinY - minY; // Altura disponible (sin prompt)
        const topZone = availableHeight * 0.5; // 50% superior (más espacio arriba)
        const midZone = availableHeight * 0.3; // 30% medio
        const bottomZone = availableHeight * 0.2; // 20% inferior (cerca del prompt)
        
        // Dividir horizontalmente en zonas también - priorizar más los lados
        const availableWidth = maxX - minX;
        const leftZone = availableWidth * 0.35; // 35% izquierda (aumentado)
        const centerZone = availableWidth * 0.3; // 30% centro (reducido)
        const rightZone = availableWidth * 0.35; // 35% derecha (aumentado)
        
        do {
          // Priorizar zonas superiores y laterales para usar todo el espacio
          const zoneRandomY = Math.random();
          const zoneRandomX = Math.random();
          let targetY, targetX;
          
          // Distribución vertical: priorizar mucho más arriba
          if (zoneRandomY < 0.7) {
            // 70% de probabilidad: zona superior (aumentado de 60%)
            targetY = minY + Math.random() * topZone;
          } else if (zoneRandomY < 0.9) {
            // 20% de probabilidad: zona media
            targetY = minY + topZone + Math.random() * midZone;
          } else {
            // 10% de probabilidad: zona inferior (reducido de 15%)
            targetY = minY + topZone + midZone + Math.random() * bottomZone;
          }
          
          // Distribución horizontal: priorizar mucho más los lados
          if (zoneRandomX < 0.4) {
            // 40% de probabilidad: zona izquierda (aumentado de 35%)
            targetX = minX + Math.random() * leftZone;
          } else if (zoneRandomX < 0.6) {
            // 20% de probabilidad: zona centro (reducido de 30%)
            targetX = minX + leftZone + Math.random() * centerZone;
          } else {
            // 40% de probabilidad: zona derecha (aumentado de 35%)
            targetX = minX + leftZone + centerZone + Math.random() * rightZone;
          }
          
          x = targetX;
          y = targetY;
          
          // Asegurar que esté dentro de los límites válidos
          x = Math.max(minX, Math.min(maxX, x));
          y = Math.max(minY, Math.min(y, maxY));
          
          // Verificar que no esté en zona del prompt
          const inPromptZone = x >= avoidMinX && x <= avoidMaxX && y >= avoidMinY && y <= avoidMaxY;
          
          // Verificar que no esté muy cerca de posiciones recientes
          const minDistance = 8; // Mínimo 8% de distancia entre imágenes
          const tooClose = recentImagePositionsRef.current.some(pos => {
            const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
            return distance < minDistance;
          });
          
          // Verificar que esté dentro de límites válidos (con márgenes)
          const withinBounds = x >= minX && x <= maxX && y >= minY && y <= maxY;
          
          if (!inPromptZone && withinBounds && !tooClose) {
            // Guardar posición reciente
            recentImagePositionsRef.current.push({
              x,
              y,
              timestamp: now,
              direction: -1 // Sin dirección específica (usamos distribución por zonas)
            });
            break;
          }
          
          attempts++;
          
          // Si falla, intentar con distribución más amplia (priorizando arriba y los lados)
          if (attempts > 50) {
            // Usar distribución más amplia, priorizando arriba y los lados
            const sideBias = Math.random();
            const topBias = Math.random();
            
            if (isPortrait) {
              // Portrait: distribución más amplia horizontalmente
              x = minX + Math.random() * (maxX - minX);
              // Priorizar arriba (80% de probabilidad)
              y = topBias < 0.8 
                ? minY + Math.random() * ((avoidMinY - minY) * 0.6) // 60% del área superior
                : minY + ((avoidMinY - minY) * 0.6) + Math.random() * ((avoidMinY - minY) * 0.4);
            } else {
              // Desktop: distribución más amplia, priorizando lados y arriba
              if (sideBias < 0.4) {
                // 40% probabilidad: lado izquierdo
                x = minX + Math.random() * ((maxX - minX) * 0.35);
              } else if (sideBias > 0.6) {
                // 40% probabilidad: lado derecho
                x = minX + (maxX - minX) * 0.65 + Math.random() * ((maxX - minX) * 0.35);
              } else {
                // 20% probabilidad: centro (menos probable)
                x = minX + (maxX - minX) * 0.3 + Math.random() * ((maxX - minX) * 0.4);
              }
              // Priorizar arriba (80% de probabilidad)
              y = topBias < 0.8 
                ? minY + Math.random() * ((avoidMinY - minY) * 0.6) // 60% del área superior
                : minY + ((avoidMinY - minY) * 0.6) + Math.random() * ((avoidMinY - minY) * 0.4);
            }
            
            const inPromptZoneRetry = x >= avoidMinX && x <= avoidMaxX && y >= avoidMinY && y <= avoidMaxY;
            const tooCloseRetry = recentImagePositionsRef.current.some(pos => {
              const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
              return distance < minDistance;
            });
            
            if (!inPromptZoneRetry && !tooCloseRetry) {
              recentImagePositionsRef.current.push({
                x,
                y,
                timestamp: now,
                direction: -1 // Sin dirección específica
              });
              break;
            }
          }
        } while (attempts < maxAttempts);
        
        // Si después de los intentos sigue en zona prohibida, usar posición alternativa segura
        if (attempts >= maxAttempts) {
          if (isPortrait) {
            // Forzar posición en zona superior segura (respetando márgenes)
            x = minX + Math.random() * (maxX - minX);
            y = minY + Math.random() * Math.min(avoidMinY - marginYPercent - minY, maxY - minY);
          } else {
            // Desktop: posición alternativa más cerca del centro (respetando márgenes)
            const centerRange = 20;
            x = Math.max(minX, Math.min(maxX, 50 - centerRange + Math.random() * (centerRange * 2)));
            y = minY + Math.random() * Math.min(avoidMinY - marginYPercent - minY, maxY - minY);
          }
        }
        
        imagePosition = {
          x: `${x}%`,
          y: `${y}%`
        };
      }
      
      // Si no hay imagen disponible, el cuadro será sólido
      
      // Pre-cargar próximas imágenes de forma proactiva
      if (shouldHaveBackground) {
        preloadNextImages();
      }
      
      // Rotación aleatoria entre -10 y +10 grados (solo si hay imagen)
      const imageRotation = imagePosition ? (Math.random() - 0.5) * 20 : undefined; // -10 a +10 grados
      
      const squareData = { 
        id, 
        type,
        data,
        timestamp: Date.now(),
        isTarget: true, // Siempre true porque solo creamos cuadrados con imagen
        imageUrl: imageUrl,
        imagePosition: imagePosition,
        imageRotation: imageRotation,
        isLastImage: isLastImage, // Marcar si es la última imagen
        gradient: color1 && color2 ? {
          color1: color1,
          color2: color2,
          angle: Math.floor(Math.random() * 360)
        } : null
      };
      
      setSquares(prev => {
        let newSquares = [...prev, squareData];
        if (newSquares.length > MAX_SQUARES) {
          newSquares.sort((a, b) => b.timestamp - a.timestamp);
          const toRemove = newSquares.slice(MAX_SQUARES);
          toRemove.forEach(square => {
            if (animationTimelinesRef.current[square.id]) {
              animationTimelinesRef.current[square.id].kill();
              delete animationTimelinesRef.current[square.id];
            }
            if (squareRefs.current[square.id]) {
              const el = squareRefs.current[square.id];
              if (el) {
                const img = el.querySelector(`.${MAINCLASS}__squareImage`);
                if (img) {
                  img.src = '';
                // NO eliminar img del DOM - React lo hará automáticamente
                }
              }
              delete squareRefs.current[square.id];
            }
          });
          newSquares = newSquares.slice(0, MAX_SQUARES);
        }
        return newSquares;
      });
    };
    };
    
    createCallback();
  }, [onTriggerCallbackRef, getNextImage, preloadNextImages, viewportDimensions]);

  useEffect(() => {
    squares.forEach(square => {
      const el = squareRefs.current[square.id];
      
      if (el && !el.animated) {
        el.animated = true;
        
        const intensity = square.data?.intensity ?? 0.5;
        // Todos los cuadrados ahora son con imagen (el sintetizador maneja los de borde)
        const isTarget = true;
        
        // Duración para cuadros con imagen
        // Para Nachitos: más rápido y sin parar
        // Para otras colecciones: más lento (18/15 segundos)
        const baseDuration = isMainCroqueta 
          ? (square.type === 'beat' ? 5 : 4)  // Nachitos: mucho más rápido (5/4 segundos)
          : (square.type === 'beat' ? 18 : 15); // Otras: más lento
        const duration = baseDuration - (intensity * (isMainCroqueta ? 0.3 : 1.5)); // Factor de intensidad ajustado (menos variación para Nachitos)
        
        try {
          const timeline = gsap.timeline();
          
          animationTimelinesRef.current[square.id] = timeline;
          
          const cleanupSquare = () => {
            // Matar la animación primero
            if (animationTimelinesRef.current[square.id]) {
              animationTimelinesRef.current[square.id].kill();
              delete animationTimelinesRef.current[square.id];
            }
            
            // Limpiar imagen si existe (solo limpiar src, no eliminar del DOM)
            if (el) {
              const img = el.querySelector(`.${MAINCLASS}__squareImage`);
              if (img) {
                img.src = '';
                // NO eliminar img del DOM - React lo hará automáticamente
              }
              // NO eliminar el div del DOM - React lo hará automáticamente cuando lo removamos del estado
            }
            
            // Limpiar referencias
            delete squareRefs.current[square.id];
            
            // Eliminar del estado - usar setTimeout para evitar conflictos con el ciclo de renderizado
            setTimeout(() => {
            setSquares(prev => prev.filter(s => s.id !== square.id));
            }, 0);
          };
          
          // Todos los cuadrados son con imagen ahora
            // isMainCroqueta ya está definido arriba en el componente
            
            const zStart = -600;
            const zEnd = 400;
            const zAtScale1 = 50;
            const scaleAt1 = 1.0; // Cambiado de 0.85 a 1.0 para que ocupe toda la pantalla
            
            const zTotal = zEnd - zStart;
            const zProgressToScale1 = (zAtScale1 - zStart) / zTotal;
            
            // Calcular posición final desde imagePosition (porcentajes) usando dimensiones actualizadas
            const viewportWidth = viewportDimensions.width;
            const viewportHeight = viewportDimensions.height;
            let finalX = 0;
            let finalY = 0;
            
            if (square.imagePosition) {
              const xPercent = parseFloat(square.imagePosition.x) || 50;
              const yPercent = parseFloat(square.imagePosition.y) || 50;
              finalX = (xPercent / 100) * viewportWidth - viewportWidth / 2; // Desplazamiento desde el centro
              finalY = (yPercent / 100) * viewportHeight - viewportHeight / 2;
            }
            
            // Inicializar posición en el centro absoluto (0, 0 en transform) y scale 0
            // Asegurar que el transformOrigin esté en el centro para que el scale funcione correctamente
            gsap.set(el, { 
              x: 0, 
              y: 0, 
              scale: 0, 
              opacity: 1,
              transformOrigin: '50% 50%'
            });
            
            if (isMainCroqueta) {
              // Para Nachitos de Nochevieja: animación continua sin detención, de largo hasta el final
              // El fade out empieza antes del final del desplazamiento usando posicionamiento relativo
              // Fase 1: Crecer y moverse hasta el final (100% del tiempo)
              timeline.fromTo(el, 
                { 
                  scale: 0, 
                  z: zStart,
                  x: 0, // Empezar en el centro absoluto
                  y: 0,
                  opacity: 1
                },
                {
                  scale: scaleAt1 * 1.5, // Llegar directamente al tamaño final de desaparición
                  z: zEnd, // Continuar hacia adelante
                  x: finalX, // Mover a la posición final
                  y: finalY,
                  opacity: 1, // Mantener opacidad durante todo el movimiento
                  duration: duration, // 100% del tiempo para crecer y moverse
                  ease: 'linear', // Ease linear para movimiento constante
                  force3D: true
                }
              );
              
              // Fase 2: Fade out que empieza ANTES del final del desplazamiento (usando posicionamiento relativo)
              // "-=X" hace que empiece X segundos antes del final de la animación anterior
              // Esto crea un solapamiento donde el fade out ocurre mientras aún se está moviendo
              const fadeOutDuration = duration * 0.2; // 20% del tiempo para desaparecer
              const fadeOutStart = `-=${fadeOutDuration}`; // Empezar 20% antes del final del desplazamiento
              timeline.to(el, {
                opacity: 0, // Desaparecer completamente
                duration: fadeOutDuration,
                ease: 'linear', // Ease linear para el fade out
                force3D: true,
                  onComplete: async () => {
                    // Si es la última imagen, hacer fade out del volumen y luego volver al menú
                    if (square.isLastImage && onAllComplete && pause) {
                      try {
                        // Resetear el flag antes de hacer el fade out
                        if (isLastImageRef?.current) {
                          isLastImageRef.current = false;
                        }
                        console.log('[Background] Última imagen completada, iniciando fade out del volumen');
                        console.log('[Background] pause es función:', typeof pause === 'function');
                        // Hacer fade out del volumen (igual que el botón de volver)
                        // pause() retorna una promesa que se resuelve cuando el fade out termina
                        if (typeof pause === 'function') {
                          await pause();
                          console.log('[Background] Fade out del volumen completado, volviendo al menú');
                        } else {
                          console.warn('[Background] pause no es una función, saltando fade out');
                        }
                        // Llamar a onAllComplete para volver al menú
                        await onAllComplete();
                      } catch (error) {
                        console.error('[Background] Error en fade out y navegación:', error);
                        // Si hay error, limpiar el square de todas formas
                        cleanupSquare();
                      }
                    } else {
                      // Limpiar inmediatamente sin delay
                      cleanupSquare();
                    }
                  }
              }, fadeOutStart); // Posicionamiento relativo: empezar antes del final
            } else {
              // Para otras colecciones: animación con dos fases (con detención y pausable)
              const timeToScale1 = duration * 0.5; // 50% del tiempo para llegar a scale 1
              const holdDuration = duration * 0.1; // 10% del tiempo para mantener (detención)
              const fadeOutDuration = duration * 0.4; // 40% del tiempo para desaparecer
              
              // Fase 1: Crecer desde el centro hasta la posición final
              timeline.fromTo(el, 
                { 
                  scale: 0, 
                  z: zStart,
                  x: 0, // Empezar en el centro absoluto
                  y: 0,
                  opacity: 1
                },
                {
                  scale: scaleAt1,
                  z: zAtScale1,
                  x: finalX, // Mover a la posición final
                  y: finalY,
                  opacity: 1,
                  duration: timeToScale1,
                  ease: 'power3.out', // Más suave al inicio, como si viniera de un largo viaje
                  force3D: true
                }
              );
              
              // Fase 2: Mantener (detención) - solo para colecciones normales
              timeline.to(el, {
                scale: scaleAt1,
                z: zAtScale1,
                x: finalX,
                y: finalY,
                opacity: 1,
                duration: holdDuration,
                ease: 'none', // Sin animación, solo mantener
                force3D: true
              });
              
              // Fase 3: Agrandarse mientras desaparece (hacia adelante)
              // Continuar aumentando el scale mientras se hace opaco
              timeline.to(el, {
                opacity: 0,
                scale: scaleAt1 * 1.5, // Agrandarse más mientras desaparece (aumentado para que sea más visible)
                z: zEnd, // Continuar hacia adelante
                x: finalX, // Mantener posición durante fade out
                y: finalY,
                duration: fadeOutDuration,
                ease: 'power2.out', // Acelerar mientras desaparece
                force3D: true,
                onComplete: async () => {
                // Si es la última imagen, hacer fade out del volumen y luego volver al menú
                if (square.isLastImage && onAllComplete && pause) {
                  try {
                    // Resetear el flag antes de hacer el fade out
                    if (isLastImageRef?.current) {
                      isLastImageRef.current = false;
                    }
                    console.log('[Background] Última imagen completada, iniciando fade out del volumen');
                    console.log('[Background] pause es función:', typeof pause === 'function');
                    // Hacer fade out del volumen (igual que el botón de volver)
                    // pause() retorna una promesa que se resuelve cuando el fade out termina
                    if (typeof pause === 'function') {
                      await pause();
                      console.log('[Background] Fade out del volumen completado, volviendo al menú');
                    } else {
                      console.warn('[Background] pause no es una función, saltando fade out');
                    }
                    // Llamar a onAllComplete para volver al menú
                    await onAllComplete();
                  } catch (error) {
                    console.error('[Background] Error en fade out y navegación:', error);
                    // Si hay error, limpiar el square de todas formas
                    cleanupSquare();
                  }
                } else {
                  // Limpiar inmediatamente cuando termine la animación
                  cleanupSquare();
                }
              }
            });
            }
          // Los cuadrados sin imagen ahora los maneja el sintetizador procedural
          // No necesitamos animarlos aquí
        } catch (error) {
          console.error(`[Background] Animation error: ${error.message}`);
          if (squareRefs.current[square.id]) {
            const el = squareRefs.current[square.id];
            if (el) {
              const img = el.querySelector(`.${MAINCLASS}__squareImage`);
              if (img) {
                img.src = '';
                img.remove();
              }
              // NO eliminar el div del DOM - React lo hará automáticamente cuando lo removamos del estado
            }
            delete squareRefs.current[square.id];
          }
          if (animationTimelinesRef.current[square.id]) {
            animationTimelinesRef.current[square.id].kill();
          delete animationTimelinesRef.current[square.id];
          }
          // Eliminar del estado - usar setTimeout para evitar conflictos con el ciclo de renderizado
          setTimeout(() => {
          setSquares(prev => prev.filter(s => s.id !== square.id));
          }, 0);
        }
      }
    });
  }, [squares, viewportDimensions]);

  // Pausar/reanudar animaciones cuando el audio se pausa/reanuda
  // IMPORTANTE: Para Nachitos de Nochevieja, NO pausar las animaciones
  useEffect(() => {
    // Si es Nachitos, no pausar animaciones
    if (isMainCroqueta) {
      return;
    }
    
    // Cuando isPlaying cambia, pausar/reanudar animaciones GSAP (solo para colecciones normales)
    if (!isPlaying) {
      // Pausar todas las animaciones
      Object.values(animationTimelinesRef.current).forEach(timeline => {
        if (timeline) timeline.pause();
      });
    } else {
      // Reanudar todas las animaciones
      Object.values(animationTimelinesRef.current).forEach(timeline => {
        if (timeline) timeline.resume();
      });
    }
  }, [isPlaying, isMainCroqueta]);

  useEffect(() => {
    return () => {
      Object.values(animationTimelinesRef.current).forEach(timeline => {
        if (timeline) timeline.kill();
      });
      animationTimelinesRef.current = {};
      
      Object.values(squareRefs.current).forEach(el => {
        if (el) {
          const img = el.querySelector(`.${MAINCLASS}__squareImage`);
          if (img) {
            img.src = '';
            // NO eliminar img del DOM - React lo hará automáticamente
          }
          // NO eliminar el div del DOM - React lo hará automáticamente
        }
      });
      squareRefs.current = {};
      
      // Limpiar estado - usar setTimeout para evitar conflictos con el ciclo de renderizado
      setTimeout(() => {
      setSquares([]);
      }, 0);
    };
  }, [selectedTrack]);

  // Limpiar squares fuera de pantalla y limitar número máximo (unificado)
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      setSquares(prev => {
        const viewportWidth = viewportDimensions.width;
        const viewportHeight = viewportDimensions.height;
        const margin = 200;
        
        // Primero, limpiar squares fuera de pantalla o invisibles
        let visibleSquares = prev.filter(square => {
          const el = squareRefs.current[square.id];
          if (!el) return false;
          
          const rect = el.getBoundingClientRect();
          const isOutOfBounds = 
            rect.right < -margin ||
            rect.left > viewportWidth + margin ||
            rect.bottom < -margin ||
            rect.top > viewportHeight + margin;
          
          const computedStyle = window.getComputedStyle(el);
          const opacity = parseFloat(computedStyle.opacity) || 0;
          
          if (isOutOfBounds || opacity <= 0.01) {
            // Limpiar animación y referencias
            if (animationTimelinesRef.current[square.id]) {
              animationTimelinesRef.current[square.id].kill();
              delete animationTimelinesRef.current[square.id];
            }
            
            // Limpiar imagen (solo limpiar src, no eliminar del DOM)
            const img = el.querySelector(`.${MAINCLASS}__squareImage`);
            if (img) {
              img.src = '';
              // NO eliminar img del DOM - React lo hará automáticamente
            }
            
            // NO eliminar el div del DOM - React lo hará automáticamente cuando lo removamos del estado
            delete squareRefs.current[square.id];
            return false;
          }
          
          return true;
        });
        
        // Luego, limitar número máximo si es necesario
        if (visibleSquares.length > MAX_SQUARES) {
          const squaresToRemoveCount = visibleSquares.length - MAX_SQUARES;
          for (let i = 0; i < squaresToRemoveCount; i++) {
            const square = visibleSquares[i];
            if (animationTimelinesRef.current[square.id]) {
              animationTimelinesRef.current[square.id].kill();
              delete animationTimelinesRef.current[square.id];
            }
            if (squareRefs.current[square.id]) {
              const el = squareRefs.current[square.id];
              if (el) {
                const img = el.querySelector(`.${MAINCLASS}__squareImage`);
                if (img) {
                  img.src = '';
                  // NO eliminar img del DOM - React lo hará automáticamente
                }
                // NO eliminar el div del DOM - React lo hará automáticamente cuando lo removamos del estado
              }
              delete squareRefs.current[square.id];
            }
          }
          visibleSquares = visibleSquares.slice(squaresToRemoveCount);
        }
        
        return visibleSquares;
      });
    }, 2000); // Verificar cada 2 segundos (unificado con limpieza)
    
    return () => clearInterval(cleanupInterval);
  }, [viewportDimensions]);

  return (
    <div className={MAINCLASS}>
      {/* Diagonales fijas en DOM (solo las fijas, las dinámicas van en canvas) */}
      <Diagonales 
        squares={showOnlyDiagonales ? [] : squares}
        analyserRef={analyserRef}
        dataArrayRef={dataArrayRef}
        isInitialized={showOnlyDiagonales ? (analyserRef?.current ? true : false) : isInitialized}
        onVoiceCallbackRef={showOnlyDiagonales ? null : null} // No pasar callback - las dinámicas van en sintetizador
        onlyFixed={true} // Solo renderizar diagonales fijas
      />
      {/* Sintetizador procedural para diagonales dinámicas - mucho más ligero */}
      {!showOnlyDiagonales && (
        <DiagonalSynthesizer
          analyserRef={analyserRef}
          dataArrayRef={dataArrayRef}
          onVoiceCallbackRef={onVoiceCallbackRef}
          squares={squares}
          currentAudioIndex={currentAudioIndex}
        />
      )}
      {/* Sintetizador procedural para cuadrados con borde - mucho más ligero */}
      {!showOnlyDiagonales && (
        <BorderSquaresSynthesizer
          analyserRef={analyserRef}
          dataArrayRef={dataArrayRef}
          onTriggerCallbackRef={onTriggerCallbackRef}
          onVoiceCallbackRef={onVoiceCallbackRef}
          currentAudioIndex={currentAudioIndex}
          key="synthesizer" // Forzar re-render cuando cambie el callback
        />
      )}
        {/* CanvasRenderer eliminado - todas las imágenes se renderizan en DOM */}
      {/* Blur overlay permanente sobre las diagonales - backdrop-filter difumina lo que está detrás */}
      <div className={`${MAINCLASS}__blurOverlay`} />
      {!showOnlyDiagonales && squares.map(square => {
        // Todos los cuadrados ahora son con imagen (el sintetizador maneja los de borde)
        // Todas las imágenes se renderizan en DOM (no canvas) para evitar problemas con resize
        const style = {};
        const color1 = square.gradient?.color1 || '#00ffff';
        const color2 = square.gradient?.color2 || '#00ffff';
        const angle = square.gradient?.angle || 45;
        style['--square-color-1'] = color1;
        style['--square-color-2'] = color2;
        style['--square-gradient-angle'] = `${angle}deg`;
        
        // Detectar si es JPEG o GIF para aplicar sombra (el CSS ya tiene drop-shadow y box-shadow)
        const imageUrlLower = square.imageUrl?.toLowerCase() || '';
        const isJpeg = imageUrlLower.endsWith('.jpg') || imageUrlLower.endsWith('.jpeg');
        const isGif = imageUrlLower.endsWith('.gif');
        const shouldHaveShadow = isJpeg || isGif;
        
        return (
          <div
            key={square.id}
            ref={el => squareRefs.current[square.id] = el}
            className={`${MAINCLASS}__square ${MAINCLASS}__square--target`}
            data-square-id={square.id}
            style={style}
          >
            {square.imageUrl && (
              <img 
                src={square.imageUrl} 
                alt="Gallery"
                className={`${MAINCLASS}__squareImage`}
                style={{
                  left: square.imagePosition?.x ?? '50%',
                  top: square.imagePosition?.y ?? '50%',
                  transform: `translate(-50%, -50%) rotate(${square.imageRotation ?? 0}deg)`,
                  // Asegurar que la sombra se aplique (el CSS ya tiene filter y box-shadow)
                  filter: shouldHaveShadow ? 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.6)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4))' : 'none',
                  boxShadow: shouldHaveShadow ? '0 4px 20px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)' : 'none'
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Background;
