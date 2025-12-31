import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import './Background.scss';
import Diagonales from './components/Diagonales/Diagonales';
import { useGallery } from '../Gallery/Gallery';

const MAINCLASS = 'background';

const Background = ({ onTriggerCallbackRef, analyserRef, dataArrayRef, isInitialized, onVoiceCallbackRef, selectedTrack, showOnlyDiagonales = false, currentAudioIndex = null, onAllComplete = null, pause = null }) => {
  const [squares, setSquares] = useState([]);
  const squareRefs = useRef({});
  const animationTimelinesRef = useRef({});
  const lastProgressRef = useRef(0);
  const colorIndexRef = useRef(0);
  const { getNextImage, allImages, isLoading, preloadNextImages, isLastImageRef } = useGallery(selectedTrack, null, onAllComplete, currentAudioIndex);
  const MAX_SQUARES = 50;
  
  // Pre-cargar imágenes próximas cuando cambian las imágenes disponibles
  useEffect(() => {
    if (!isLoading && allImages.length > 0) {
      preloadNextImages();
    }
  }, [isLoading, allImages.length, preloadNextImages]);
  
  useEffect(() => {
    if (!onTriggerCallbackRef || showOnlyDiagonales) return;
    
    const createCallback = () => {
      onTriggerCallbackRef.current = (type, data = {}) => {
      const id = `square-${Date.now()}-${Math.random()}`;
      const lgtbColors = [
        '#FF0080', '#FF8000', '#FFFF00', '#00FF00', '#0080FF', '#8000FF',
        '#00FFFF', '#FF00FF', '#FFFFFF', '#FFB347', '#FFD700', '#C0C0C0',
      ];
      
      const color1 = lgtbColors[colorIndexRef.current % lgtbColors.length];
      const color2 = lgtbColors[(colorIndexRef.current + 1) % lgtbColors.length];
      colorIndexRef.current++;
      
      const intensity = data?.intensity ?? 0.5;
      const shouldHaveBackground = data?.shouldBeSolid ?? false;
      
      // Solo obtener imagen si está lista (pre-cargada)
      let imageUrl = null;
      let isLastImage = false;
      if (shouldHaveBackground) {
        // Verificar si la próxima imagen será la última ANTES de obtenerla
        isLastImage = isLastImageRef?.current || false;
        imageUrl = getNextImage();
        // El flag se mantiene hasta que se use, así que isLastImage ya está correcto
      }
      
      // Calcular posición evitando la zona central inferior donde está el prompt
      let imagePosition = null;
      if (shouldHaveBackground && imageUrl) {
        // Zona a evitar: central inferior (donde está el prompt)
        // En landscape: bottom 10%, width 60%, left 20% (zona 20%-80% x, 0%-15% y desde abajo)
        // En portrait: bottom 4%, width 90%, left 5% (zona 5%-95% x, 0%-20% y desde abajo)
        
        // Detectar orientación
        const isPortrait = window.innerHeight > window.innerWidth;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Calcular tamaño máximo de imagen según CSS
        // Desktop: max-width y max-height = 100dvh (100% del viewport height)
        // Portrait: max-width y max-height = 100dvh, pero con scale(0.5), así que tamaño efectivo = 50dvh
        let maxImageWidth, maxImageHeight;
        if (isPortrait) {
          // En portrait, el scale(0.5) hace que el tamaño efectivo sea la mitad
          maxImageWidth = viewportHeight * 0.5; // 50% del viewport height
          maxImageHeight = viewportHeight * 0.5;
        } else {
          // En desktop, max-width y max-height = 100dvh
          maxImageWidth = viewportHeight; // 100% del viewport height
          maxImageHeight = viewportHeight;
        }
        
        // Calcular márgenes necesarios para mantener imagen completa dentro de límites
        // Como la imagen está centrada (translate(-50%, -50%)), necesitamos la mitad del tamaño como margen
        const marginXPercent = (maxImageWidth / 2) / viewportWidth * 100;
        const marginYPercent = (maxImageHeight / 2) / viewportHeight * 100;
        
        // Área válida considerando márgenes (para que la imagen completa quede dentro)
        const minX = marginXPercent;
        const maxX = 100 - marginXPercent;
        const minY = marginYPercent;
        const maxY = 100 - marginYPercent;
        
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
        
        let x, y;
        let attempts = 0;
        const maxAttempts = 50;
        
        do {
          // Generar posición aleatoria dentro del área válida
          if (isPortrait) {
            // Portrait: rango limitado por márgenes
            x = minX + Math.random() * (maxX - minX);
            y = minY + Math.random() * (maxY - minY);
          } else {
            // Desktop: más cerca del centro, pero respetando márgenes
            // Centro está en 50%, así que usamos un rango alrededor del centro
            const centerRange = 20; // ±20% del centro
            x = Math.max(minX, Math.min(maxX, 50 - centerRange + Math.random() * (centerRange * 2)));
            y = minY + Math.random() * (maxY - minY);
          }
          
          // Verificar que no esté en zona del prompt
          const inPromptZone = x >= avoidMinX && x <= avoidMaxX && y >= avoidMinY && y <= avoidMaxY;
          
          // Verificar que esté dentro de límites válidos (con márgenes)
          const withinBounds = x >= minX && x <= maxX && y >= minY && y <= maxY;
          
          if (!inPromptZone && withinBounds) {
            break;
          }
          
          attempts++;
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
        isTarget: shouldHaveBackground,
        imageUrl: imageUrl,
        imagePosition: imagePosition,
        imageRotation: imageRotation,
        isLastImage: isLastImage, // Marcar si es la última imagen
        gradient: {
          color1: color1,
          color2: color2,
          angle: Math.floor(Math.random() * 360)
        }
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
                  img.remove();
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
  }, [onTriggerCallbackRef, getNextImage, preloadNextImages]);

  useEffect(() => {
    squares.forEach(square => {
      const el = squareRefs.current[square.id];
      
      if (el && !el.animated) {
        el.animated = true;
        
        const intensity = square.data?.intensity ?? 0.5;
        const isTarget = square.isTarget;
        
        // Duración diferente para cuadros con imagen vs cuadros con borde (sin imagen)
        // Los cuadros con borde son más lentos
        let baseDuration;
        if (isTarget) {
          // Cuadros con imagen: duración normal
          baseDuration = square.type === 'beat' ? 10 : 8;
        } else {
          // Cuadros con borde (sin imagen): duración más larga para desplazamiento más lento
          baseDuration = square.type === 'beat' ? 15 : 12;
        }
        const duration = baseDuration - (intensity * 2); // Factor de intensidad ajustado (menos reducción)
        
        try {
          const timeline = gsap.timeline();
          
          animationTimelinesRef.current[square.id] = timeline;
          
          const cleanupSquare = () => {
            if (el) {
              const img = el.querySelector(`.${MAINCLASS}__squareImage`);
              if (img) {
                img.src = '';
                img.remove();
              }
            }
            delete squareRefs.current[square.id];
            delete animationTimelinesRef.current[square.id];
            setSquares(prev => prev.filter(s => s.id !== square.id));
          };
          
          if (isTarget) {
            // Detectar si es Nachitos de Nochevieja
            const isCroquetas25 = selectedTrack && (
              selectedTrack.name?.toLowerCase().includes('nachitos de nochevieja') ||
              selectedTrack.name?.toLowerCase().includes('nachitos-de-nochevieja') ||
              selectedTrack.id?.toLowerCase().includes('nachitos-de-nochevieja')
            );
            
            const zStart = -600;
            const zEnd = 400;
            const zAtScale85 = 50;
            const scaleAt85 = 0.85;
            
            const zTotal = zEnd - zStart;
            const zProgressToScale85 = (zAtScale85 - zStart) / zTotal;
            
            if (isCroquetas25) {
              // Para Nachitos de Nochevieja: animación continua sin detención, directamente al fade out
              const fadeStartProgress = 0.7; // Empezar fade out al 70% de la animación
              
              timeline.fromTo(el, 
                { 
                  scale: 0, 
                  z: zStart,
                  opacity: 1
                },
                {
                  scale: scaleAt85,
                  z: zEnd,
                  opacity: 1,
                  duration: duration,
                  ease: 'power1.out',
                  force3D: true,
                  onUpdate: function() {
                    const progress = this.progress();
                    
                    if (progress >= fadeStartProgress) {
                      const fadeProgress = (progress - fadeStartProgress) / (1.0 - fadeStartProgress);
                      const newOpacity = 1 - fadeProgress;
                      gsap.set(el, { opacity: Math.max(0, newOpacity) });
                    }
                  },
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
                }
              );
            } else {
              // Para otras colecciones: animación con dos fases (con detención)
              const timeToScale85 = duration * 0.55; // Ajustado: un poco más lento que 0.5
              const fadeOutDuration = duration * 0.45; // Ajustado para balancear
              
              timeline.fromTo(el, 
                { 
                  scale: 0, 
                  z: zStart,
                  opacity: 1
                },
                {
                  scale: scaleAt85,
                  z: zAtScale85,
                  opacity: 1,
                  duration: timeToScale85,
                  ease: 'power1.out',
                  force3D: true
                }
              );
              
              timeline.to(el, {
                opacity: 0,
                scale: 0.95,
                z: 100,
                duration: fadeOutDuration,
                ease: 'power2.in',
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
                  // Esperar más tiempo antes de limpiar para asegurar que el fade termine completamente
                  // El fadeOutDuration ya es parte de la animación, pero añadimos un pequeño delay extra
                  setTimeout(cleanupSquare, 200);
                }
              }
            });
            }
          } else {
            const targetScale = 0.85;
            const scale1 = 1.0;
            const scaleProgressTo1 = 1.0 / targetScale;
            const fadeStartProgress = 0.6; // Ajustado: un poco más lento que 0.5 pero más rápido que 0.7
            const fadeEndProgress = 1.0;
            
            timeline.fromTo(el, 
              { 
                scale: 0, 
                z: -600,
                opacity: 1
              },
              {
                scale: targetScale,
                z: 400,
                opacity: 1,
                duration: duration,
                ease: 'none',
                force3D: true,
                onUpdate: function() {
                  const progress = this.progress();
                  
                  if (progress >= fadeStartProgress) {
                    const fadeProgress = (progress - fadeStartProgress) / (fadeEndProgress - fadeStartProgress);
                    const newOpacity = 1 - fadeProgress;
                    gsap.set(el, { opacity: Math.max(0, newOpacity) });
                  }
                },
                onComplete: () => {
                  // Esperar más tiempo antes de limpiar para asegurar que el fade termine completamente
                  // El fade ya terminó en progress 1.0, pero añadimos un pequeño delay extra
                  setTimeout(cleanupSquare, 200);
                }
              }
            );
          }
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
            }
            delete squareRefs.current[square.id];
          }
          delete animationTimelinesRef.current[square.id];
          setSquares(prev => prev.filter(s => s.id !== square.id));
        }
      }
    });
  }, [squares]);

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
            img.remove();
          }
        }
      });
      squareRefs.current = {};
      
      setSquares([]);
    };
  }, [selectedTrack]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSquares(prev => {
        if (prev.length > MAX_SQUARES) {
          const squaresToRemoveCount = prev.length - MAX_SQUARES;
          for (let i = 0; i < squaresToRemoveCount; i++) {
            const square = prev[i];
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
                  img.remove();
                }
              }
              delete squareRefs.current[square.id];
            }
          }
          return prev.slice(squaresToRemoveCount);
        }
        return prev;
      });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={MAINCLASS}>
      <Diagonales 
        squares={showOnlyDiagonales ? [] : squares}
        analyserRef={analyserRef}
        dataArrayRef={dataArrayRef}
        isInitialized={showOnlyDiagonales ? true : isInitialized}
        onVoiceCallbackRef={showOnlyDiagonales ? null : onVoiceCallbackRef}
      />
      {/* Blur overlay permanente sobre las diagonales - backdrop-filter difumina lo que está detrás */}
      <div className={`${MAINCLASS}__blurOverlay`} />
      {!showOnlyDiagonales && squares.map(square => {
        const color1 = square.gradient?.color1 || '#00ffff';
        const color2 = square.gradient?.color2 || '#00ffff';
        const angle = square.gradient?.angle || 45;
        
        return (
          <div
            key={square.id}
            ref={el => squareRefs.current[square.id] = el}
            className={`${MAINCLASS}__square ${square.isTarget ? `${MAINCLASS}__square--target` : ''}`}
            data-square-id={square.id}
            style={{ 
              '--square-color-1': color1,
              '--square-color-2': color2,
              '--square-gradient-angle': `${angle}deg`
            }}
          >
            {square.isTarget && square.imageUrl && (
              <img 
                src={square.imageUrl} 
                alt="Gallery"
                className={`${MAINCLASS}__squareImage`}
                style={{
                  left: square.imagePosition?.x ?? '50%',
                  top: square.imagePosition?.y ?? '50%',
                  transform: `translate(-50%, -50%) rotate(${square.imageRotation ?? 0}deg)`
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
