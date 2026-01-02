import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import './Background.scss';
import Diagonales from './components/Diagonales/Diagonales';
import BorderSquaresCanvas from './components/BorderSquaresCanvas/BorderSquaresCanvas';
import { useGallery } from '../Gallery/Gallery';

const MAINCLASS = 'background';

const Background = ({ onTriggerCallbackRef, analyserRef, dataArrayRef, isInitialized, onVoiceCallbackRef, selectedTrack, showOnlyDiagonales = false, currentAudioIndex = null, onAllComplete = null, pause = null }) => {
  const [squares, setSquares] = useState([]);
  const squareRefs = useRef({});
  const animationTimelinesRef = useRef({});
  const lastProgressRef = useRef(0);
  const colorIndexRef = useRef(0);
  const recentImagePositionsRef = useRef([]); // Track de posiciones recientes para evitar solapamientos
  const { getNextImage, allImages, isLoading, preloadNextImages, isLastImageRef } = useGallery(selectedTrack, null, onAllComplete, currentAudioIndex, !showOnlyDiagonales);
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
      
      const intensity = data?.intensity ?? 0.5;
      const shouldHaveBackground = data?.shouldBeSolid ?? false;
      
      // Para cuadrados sin imagen, usar color sólido que reacciona a la música
      // Si tiene datos de audio, calcular color basado en ellos
      let borderColor = null;
      let color1 = null;
      let color2 = null;
      
      if (!shouldHaveBackground) {
        // Cuadrados sin imagen: color sólido que reacciona a la música
        // El color se calculará dinámicamente en updateColorFromMusic, pero establecemos un color inicial
        // basado en los datos disponibles o un color por defecto que cambiará inmediatamente
        if (data) {
          const spectralCentroid = data?.spectralCentroid ?? 0;
          const bassEnergy = data?.bassEnergy ?? 0;
          const trebleEnergy = data?.trebleEnergy ?? 0;
          const rhythmEnergy = data?.rhythmEnergy ?? 0;
          
          // Calcular color basado en las frecuencias del audio
          // Usar spectralCentroid para el matiz (hue), y energía para saturación/brightness
          const hue = (spectralCentroid * 360) % 360;
          const saturation = Math.min(100, 50 + (bassEnergy + trebleEnergy) * 50);
          const lightness = Math.min(90, 40 + (rhythmEnergy + intensity) * 30);
          
          borderColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        } else {
          // Si no hay datos aún, usar un color inicial basado en tiempo que cambiará cuando se actualice
          // Usar un color basado en tiempo para que al menos varíe y no sea siempre verde
          const timeBasedHue = (Date.now() / 100) % 360;
          borderColor = `hsl(${Math.round(timeBasedHue)}, 70%, 60%)`;
        }
      } else {
        // Para cuadrados con imagen, mantener el gradiente
        color1 = lgtbColors[colorIndexRef.current % lgtbColors.length];
        color2 = lgtbColors[(colorIndexRef.current + 1) % lgtbColors.length];
        colorIndexRef.current++;
      }
      
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
        // Expandir significativamente hacia los lados y arriba/abajo para usar todo el espacio disponible
        // En landscape, expandir más para usar todo el espacio disponible
        const sideExpansion = isPortrait ? 8 : 12; // En landscape, expandir 12% más hacia cada lado
        const topExpansion = isPortrait ? 15 : 22; // En landscape, expandir 22% más hacia arriba
        const bottomExpansion = isPortrait ? 0 : 3; // En landscape, expandir 3% más hacia abajo
        const minX = Math.max(0, marginXPercent - sideExpansion); // Más espacio a los lados
        const maxX = Math.min(100, 100 - marginXPercent + sideExpansion); // Más espacio a los lados
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
        isTarget: shouldHaveBackground,
        imageUrl: imageUrl,
        imagePosition: imagePosition,
        imageRotation: imageRotation,
        isLastImage: isLastImage, // Marcar si es la última imagen
        gradient: shouldHaveBackground && color1 && color2 ? {
          color1: color1,
          color2: color2,
          angle: Math.floor(Math.random() * 360)
        } : null,
        borderColor: !shouldHaveBackground ? borderColor : null
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
            const zAtScale1 = 50;
            const scaleAt1 = 1.0; // Cambiado de 0.85 a 1.0 para que ocupe toda la pantalla
            
            const zTotal = zEnd - zStart;
            const zProgressToScale1 = (zAtScale1 - zStart) / zTotal;
            
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
                  scale: scaleAt1,
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
              const timeToScale1 = duration * 0.55; // Ajustado: un poco más lento que 0.5
              const fadeOutDuration = duration * 0.45; // Ajustado para balancear
              
              timeline.fromTo(el, 
                { 
                  scale: 0, 
                  z: zStart,
                  opacity: 1
                },
                {
                  scale: scaleAt1,
                  z: zAtScale1,
                  opacity: 1,
                  duration: timeToScale1,
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
            // Cuadrados sin imagen: animación con color que reacciona a la música
            // targetScale = 1.0 significa que cuando scale = 1.0, el cuadrado ocupa el 100% del viewport
            const targetScale = 1.0;
            const fadeStartProgress = 0.6;
            const fadeEndProgress = 1.0;
            
            // Función para actualizar el color basado en la música
            const updateColorFromMusic = () => {
              if (!dataArrayRef?.current || !analyserRef?.current) {
                // Si no hay analizador aún, usar color basado en tiempo para que al menos cambie
                const timeBasedHue = (Date.now() / 100) % 360;
                const defaultColor = `hsl(${Math.round(timeBasedHue)}, 70%, 60%)`;
                el.style.setProperty('--square-border-color', defaultColor);
                return;
              }
              
              try {
                const dataArray = dataArrayRef.current;
                const analyser = analyserRef.current;
                
                analyser.getByteFrequencyData(dataArray);
                
                // Calcular métricas de audio
                let sum = 0;
                let bassSum = 0;
                let trebleSum = 0;
                const bassRange = Math.floor(dataArray.length * 0.1); // Primeros 10%
                const trebleRange = Math.floor(dataArray.length * 0.8); // Últimos 20%
                
                for (let i = 0; i < dataArray.length; i++) {
                  const normalized = dataArray[i] / 255;
                  sum += normalized;
                  if (i < bassRange) bassSum += normalized;
                  if (i > trebleRange) trebleSum += normalized;
                }
                
                const average = sum / dataArray.length;
                const bassEnergy = bassRange > 0 ? bassSum / bassRange : 0;
                const trebleEnergy = (dataArray.length - trebleRange) > 0 ? trebleSum / (dataArray.length - trebleRange) : 0;
                
                // Calcular spectral centroid aproximado
                let weightedSum = 0;
                let magnitudeSum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                  const magnitude = dataArray[i] / 255;
                  weightedSum += i * magnitude;
                  magnitudeSum += magnitude;
                }
                const spectralCentroid = magnitudeSum > 0 ? weightedSum / magnitudeSum / dataArray.length : 0;
                
                // Calcular color basado en la música
                // Asegurar que el hue cambie dinámicamente basado en el spectral centroid
                const hue = (spectralCentroid * 360) % 360;
                const saturation = Math.min(100, Math.max(50, 50 + (bassEnergy + trebleEnergy) * 50));
                const lightness = Math.min(90, Math.max(40, 40 + (average + intensity) * 30));
                
                const newColor = `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`;
                el.style.setProperty('--square-border-color', newColor);
              } catch (error) {
                // Si hay error, usar color basado en tiempo para que al menos cambie
                const timeBasedHue = (Date.now() / 100) % 360;
                const fallbackColor = `hsl(${Math.round(timeBasedHue)}, 70%, 60%)`;
                el.style.setProperty('--square-border-color', fallbackColor);
              }
            };
            
            // Throttle para actualizaciones de color (cada 3 frames = ~50ms a 60fps)
            let frameCount = 0;
            const colorUpdateInterval = 3;
            
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
                  
                  // Actualizar color basado en la música (throttled)
                  // IMPORTANTE: Actualizar siempre, no solo cada N frames, para que el color cambie suavemente
                  frameCount++;
                  if (frameCount % colorUpdateInterval === 0 || frameCount === 1) {
                    // Siempre actualizar en el primer frame y luego cada N frames
                    updateColorFromMusic();
                  }
                  
                  // Calcular tamaño relativo a la ventana para ajustar opacidad
                  const rect = el.getBoundingClientRect();
                  const viewportWidth = window.innerWidth;
                  const viewportHeight = window.innerHeight;
                  const elementWidth = rect.width;
                  const elementHeight = rect.height;
                  
                  // Calcular qué porcentaje del viewport ocupa el elemento
                  const widthRatio = elementWidth / viewportWidth;
                  const heightRatio = elementHeight / viewportHeight;
                  const maxRatio = Math.max(widthRatio, heightRatio);
                  
                  // Si el elemento ocupa más del 70% del viewport, empezar a reducir opacidad
                  // Opacidad base: 0.5, se reduce hasta 0 cuando alcanza 100% del viewport
                  let sizeBasedOpacity = 0.5;
                  if (maxRatio > 0.7) {
                    const fadeStart = 0.7;
                    const fadeEnd = 1.0;
                    const fadeProgress = (maxRatio - fadeStart) / (fadeEnd - fadeStart);
                    sizeBasedOpacity = 0.5 * (1 - Math.min(1, fadeProgress));
                  }
                  
                  // Aplicar fade out normal si está en esa fase
                  let finalOpacity = sizeBasedOpacity;
                  if (progress >= fadeStartProgress) {
                    const fadeProgress = (progress - fadeStartProgress) / (fadeEndProgress - fadeStartProgress);
                    const fadeOutOpacity = 1 - fadeProgress;
                    finalOpacity = Math.min(sizeBasedOpacity, fadeOutOpacity);
                  }
                  
                  gsap.set(el, { opacity: Math.max(0, finalOpacity) });
                },
                onComplete: () => {
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

  // Limpiar squares fuera de pantalla periódicamente
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      setSquares(prev => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        // Margen adicional para considerar elementos que están saliendo
        const margin = 200;
        
        const visibleSquares = prev.filter(square => {
          const el = squareRefs.current[square.id];
          if (!el) return false; // Si no hay elemento, eliminar del estado
          
          const rect = el.getBoundingClientRect();
          // Verificar si el elemento está completamente fuera de la pantalla (con margen)
          const isOutOfBounds = 
            rect.right < -margin ||
            rect.left > viewportWidth + margin ||
            rect.bottom < -margin ||
            rect.top > viewportHeight + margin;
          
          // También verificar si la opacidad es 0 (ya desapareció visualmente)
          const computedStyle = window.getComputedStyle(el);
          const opacity = parseFloat(computedStyle.opacity) || 0;
          
          if (isOutOfBounds || opacity <= 0.01) {
            // Limpiar animación y referencias
            if (animationTimelinesRef.current[square.id]) {
              animationTimelinesRef.current[square.id].kill();
              delete animationTimelinesRef.current[square.id];
            }
            
            // Limpiar imagen
            const img = el.querySelector(`.${MAINCLASS}__squareImage`);
            if (img) {
              img.src = '';
              img.remove();
            }
            
            delete squareRefs.current[square.id];
            return false; // Eliminar del array
          }
          
          return true; // Mantener en el array
        });
        
        return visibleSquares;
      });
    }, 2000); // Verificar cada 2 segundos
    
    return () => clearInterval(cleanupInterval);
  }, []);
  
  // Limitar número máximo de squares (fallback)
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
      {/* Canvas único para cuadros con borde */}
      {!showOnlyDiagonales && (
        <BorderSquaresCanvas
          squares={squares}
          analyserRef={analyserRef}
          dataArrayRef={dataArrayRef}
          animationTimelinesRef={animationTimelinesRef}
        />
      )}
      {/* Blur overlay permanente sobre las diagonales - backdrop-filter difumina lo que está detrás */}
      <div className={`${MAINCLASS}__blurOverlay`} />
      {!showOnlyDiagonales && squares.map(square => {
        const isTarget = square.isTarget;
        
        // Solo renderizar cuadrados con imagen (los de borde se renderizan en BorderSquaresCanvas)
        if (!isTarget) {
          // Crear un div invisible para que GSAP pueda animarlo y sincronizar con el canvas
          return (
            <div
              key={square.id}
              ref={el => squareRefs.current[square.id] = el}
              className={`${MAINCLASS}__square`}
              data-square-id={square.id}
              style={{ visibility: 'hidden', pointerEvents: 'none' }}
            />
          );
        }
        
        // Cuadrados con imagen
        const style = {};
        const color1 = square.gradient?.color1 || '#00ffff';
        const color2 = square.gradient?.color2 || '#00ffff';
        const angle = square.gradient?.angle || 45;
        style['--square-color-1'] = color1;
        style['--square-color-2'] = color2;
        style['--square-gradient-angle'] = `${angle}deg`;
        
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
