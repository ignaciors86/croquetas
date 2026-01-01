import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import './Diagonales.scss';

const Diagonales = ({ squares, analyserRef, dataArrayRef, isInitialized, onVoiceCallbackRef }) => {
  const [diagonales, setDiagonales] = useState([]);
  const diagonalRefs = useRef({});
  const rotationRefs = useRef({});
  const rotationTimelinesRef = useRef({});
  const loopRef = useRef(null);
  const lastBeatTimeRef = useRef(0);
  const lastIntensityRef = useRef(0.5);
  const lastDiagonalAngleRef = useRef(-45);
  const removingDiagonalsRef = useRef(new Set());
  const voiceCallbackHandlerRef = useRef(null);
  const containerRef = useRef(null);

  // Calcular posición y transformación para diagonales fijas que atraviesen las esquinas
  // Enfoque: posicionar desde el centro y extender hacia las esquinas opuestas
  // Para líneas que cruzan desde esquinas opuestas, necesitamos calcular la diagonal real
  const calculateFixedDiagonalProps = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Calcular la diagonal real de la ventana
    const diagonal = Math.sqrt(width * width + height * height);
    // Usar 150% de la diagonal para asegurar cobertura completa en cualquier orientación
    const lineWidth = diagonal * 1.5;
    
    // Ángulo para diagonal 1 (desde superior izquierda a inferior derecha)
    // Vector: (width, height), ángulo = atan2(height, width)
    const angle1 = Math.atan2(height, width) * (180 / Math.PI);
    
    // Ángulo para diagonal 2 (desde superior derecha a inferior izquierda)
    // Vector: (-width, height), ángulo = atan2(height, -width)
    const angle2 = Math.atan2(height, -width) * (180 / Math.PI);
    
    // Para la diagonal horizontal, usar el ancho de la ventana con un multiplicador
    const horizontalWidth = width * 1.5;
    
    return {
      diagonal1: {
        angle: angle1,
        width: lineWidth
      },
      diagonal2: {
        angle: angle2,
        width: lineWidth
      },
      diagonal3: {
        angle: 0, // Horizontal
        width: horizontalWidth
      }
    };
  };

  // Inicializar las primeras diagonales (más diagonales iniciales) + diagonales fijas
  useEffect(() => {
    if (isInitialized && diagonales.length === 0) {
      // Calcular propiedades para diagonales fijas
      const { diagonal1, diagonal2, diagonal3 } = calculateFixedDiagonalProps();
      
      const initialDiagonales = [
        // Diagonales fijas que atraviesen las esquinas (siempre se crean primero)
        {
          id: 'diag-fixed-1',
          baseAngle: diagonal1.angle,
          speed: 0, // Sin rotación
          createdAt: Date.now(),
          opacity: 1,
          creationIntensity: 0.5,
          isFixed: true
        },
        {
          id: 'diag-fixed-2',
          baseAngle: diagonal2.angle,
          speed: 0, // Sin rotación
          createdAt: Date.now(),
          opacity: 1,
          creationIntensity: 0.5,
          isFixed: true
        },
        {
          id: 'diag-fixed-3',
          baseAngle: diagonal3.angle,
          speed: 0, // Sin rotación
          createdAt: Date.now(),
          opacity: 1,
          creationIntensity: 0.5,
          isFixed: true
        },
        // Diagonales animadas iniciales
        {
          id: 'diag-initial-1',
          baseAngle: 45,
          speed: 1,
          createdAt: Date.now(),
          opacity: 1,
          creationIntensity: 0.5 // Intensidad inicial - velocidad fija
        },
        {
          id: 'diag-initial-2',
          baseAngle: -45,
          speed: 1.2,
          createdAt: Date.now(),
          opacity: 1,
          creationIntensity: 0.5 // Intensidad inicial - velocidad fija
        },
        {
          id: 'diag-initial-3',
          baseAngle: 90,
          speed: 0.9,
          createdAt: Date.now(),
          opacity: 1,
          creationIntensity: 0.5
        },
        {
          id: 'diag-initial-4',
          baseAngle: -90,
          speed: 1.1,
          createdAt: Date.now(),
          opacity: 1,
          creationIntensity: 0.5
        },
        {
          id: 'diag-initial-5',
          baseAngle: 135,
          speed: 1.3,
          createdAt: Date.now(),
          opacity: 1,
          creationIntensity: 0.5
        },
        {
          id: 'diag-initial-6',
          baseAngle: -135,
          speed: 0.8,
          createdAt: Date.now(),
          opacity: 1,
          creationIntensity: 0.5
        }
      ];
      lastDiagonalAngleRef.current = -135;
      setDiagonales(initialDiagonales);
    }
  }, [isInitialized, diagonales.length]);

  // Crear handler estable para callbacks de beats/diagonales - se crea una sola vez
  useEffect(() => {
    if (!voiceCallbackHandlerRef.current) {
      voiceCallbackHandlerRef.current = (intensity = 0.5, voiceEnergy = 0) => {
        const now = Date.now();
        
        // Obtener la rotación actual de la última diagonal NO FIJA usando el estado actual
        setDiagonales(prev => {
          // Filtrar solo las diagonales no fijas para encontrar la última
          const nonFixedDiagonals = prev.filter(d => !d.isFixed);
          
          const lastDiagonal = nonFixedDiagonals[nonFixedDiagonals.length - 1];
          let currentRotation = 0;
          if (lastDiagonal && rotationRefs.current[lastDiagonal.id]) {
            currentRotation = rotationRefs.current[lastDiagonal.id].current;
          }
          
          // Nueva diagonal surge desde la rotación actual de la última diagonal no fija
          const currentAngle = lastDiagonal ? (lastDiagonal.baseAngle + currentRotation) % 360 : lastDiagonalAngleRef.current;
          lastDiagonalAngleRef.current = currentAngle;
          
          // Velocidades mucho mayores para que se separen más rápido
          // Rango: 3.0 a 8.0 (mucho más rápido que antes)
          const speed = 3.0 + (intensity * 5.0);
          // Opacidad inicial basada en la intensidad (rango 0.3 a 1.0)
          const initialOpacity = 0.3 + (intensity * 0.7);
          const newDiag = {
            id: `diag-${Date.now()}-${Math.random()}`,
            baseAngle: currentAngle,
            speed: speed,
            createdAt: now,
            opacity: initialOpacity,
            creationIntensity: intensity,
            isFixed: false // Asegurar que NO es fija
          };
          
          const newDiagonales = [...prev, newDiag];
          return newDiagonales;
        });
      };
    }
  }, []); // Sin dependencias - se crea una sola vez

  // Registrar el callback en el ref externo
  useEffect(() => {
    if (!onVoiceCallbackRef) {
      // Si el ref es null, limpiar el callback
      if (onVoiceCallbackRef && onVoiceCallbackRef.current) {
        onVoiceCallbackRef.current = null;
      }
      return;
    }
    
    // Asegurar que el handler esté creado (usar el del primer useEffect si existe, sino crear uno nuevo)
    if (!voiceCallbackHandlerRef.current) {
      // Crear el handler si no existe
      voiceCallbackHandlerRef.current = (intensity = 0.5, voiceEnergy = 0) => {
        const now = Date.now();
        setDiagonales(prev => {
          const nonFixedDiagonals = prev.filter(d => !d.isFixed);
          const lastDiagonal = nonFixedDiagonals[nonFixedDiagonals.length - 1];
          let currentRotation = 0;
          if (lastDiagonal && rotationRefs.current[lastDiagonal.id]) {
            currentRotation = rotationRefs.current[lastDiagonal.id].current;
          }
          const currentAngle = lastDiagonal ? (lastDiagonal.baseAngle + currentRotation) % 360 : lastDiagonalAngleRef.current;
          lastDiagonalAngleRef.current = currentAngle;
          // Velocidades mucho mayores para que se separen más rápido
          // Rango: 3.0 a 8.0 (mucho más rápido que antes)
          const speed = 3.0 + (intensity * 5.0);
          // Opacidad inicial basada en la intensidad (rango 0.3 a 1.0)
          const initialOpacity = 0.3 + (intensity * 0.7);
          const newDiag = {
            id: `diag-${Date.now()}-${Math.random()}`,
            baseAngle: currentAngle,
            speed: speed,
            createdAt: now,
            opacity: initialOpacity,
            creationIntensity: intensity,
            isFixed: false
          };
          return [...prev, newDiag];
        });
      };
    }
    
    // Siempre actualizar el callback en el ref externo cuando cambia el ref
    onVoiceCallbackRef.current = voiceCallbackHandlerRef.current;
  }, [onVoiceCallbackRef]);

  // Inicializar rotación de todas las diagonales - se ejecuta cuando cambian las diagonales
  useEffect(() => {
    if (!isInitialized || diagonales.length === 0) {
      return;
    }

    diagonales.forEach((diag) => {
      if (removingDiagonalsRef.current.has(diag.id)) {
        return;
      }

      const el = diagonalRefs.current[diag.id];
      if (!el) return;

      // Inicializar rotación si no existe y no está ya animándose
      // Verificar que no haya una animación activa antes de crear una nueva
      const hasActiveAnimation = rotationTimelinesRef.current[diag.id] && rotationTimelinesRef.current[diag.id].isActive();
      
      if (!rotationRefs.current[diag.id]) {
        rotationRefs.current[diag.id] = { current: 0 };
      }
      
      // Las diagonales fijas no rotan
      if (diag.isFixed) {
        return;
      }
      
      if (!hasActiveAnimation && !rotationTimelinesRef.current[diag.id]) {
        const baseDuration = 60;
        const speedMultiplier = diag.speed || 1;
        // Usar la intensidad al momento de creación para fijar la velocidad
        const creationIntensity = diag.creationIntensity !== undefined ? diag.creationIntensity : 0.5;
        // Multiplicador más agresivo para velocidades mayores
        const intensityMultiplier = 0.05 + ((1 - creationIntensity) * 0.15);
        const duration = baseDuration / speedMultiplier * intensityMultiplier;
        
        rotationTimelinesRef.current[diag.id] = gsap.to(rotationRefs.current[diag.id], {
          current: 360,
          duration: duration,
          ease: 'none',
          repeat: -1
        });
      }
    });
  }, [isInitialized, diagonales]);

  // Limpiar diagonales fuera de pantalla periódicamente
  useEffect(() => {
    if (!isInitialized) return;
    
    const cleanupInterval = setInterval(() => {
      setDiagonales(prev => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        // Margen adicional para considerar elementos que están saliendo
        const margin = 500; // Más margen para diagonales que pueden ser largas
        
        const visibleDiagonales = prev.filter(diag => {
          // Las diagonales fijas nunca se eliminan
          if (diag.isFixed) return true;
          
          const el = diagonalRefs.current[diag.id];
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
            // Limpiar animaciones y referencias
            if (rotationTimelinesRef.current[diag.id]) {
              rotationTimelinesRef.current[diag.id].kill();
              delete rotationTimelinesRef.current[diag.id];
            }
            
            delete diagonalRefs.current[diag.id];
            delete rotationRefs.current[diag.id];
            removingDiagonalsRef.current.delete(diag.id);
            return false; // Eliminar del array
          }
          
          return true; // Mantener en el array
        });
        
        return visibleDiagonales;
      });
    }, 3000); // Verificar cada 3 segundos
    
    return () => clearInterval(cleanupInterval);
  }, [isInitialized]);
  
  // Animar rotación y desvanecimiento de diagonales
  useEffect(() => {
    if (!isInitialized || diagonales.length === 0) {
      return;
    }

    const animate = () => {
      const lastSquare = squares.length > 0 ? squares[squares.length - 1] : null;
      const currentColor = lastSquare?.gradient?.color1 || '#00ffff';
      const currentColor2 = lastSquare?.gradient?.color2 || currentColor;
      const now = Date.now();

      diagonales.forEach((diag, index) => {
        if (removingDiagonalsRef.current.has(diag.id)) {
          return;
        }

        const el = diagonalRefs.current[diag.id];
        if (!el) return;

        // Asegurar que la rotación esté inicializada (fallback si no se inicializó en el otro useEffect)
        if (!rotationRefs.current[diag.id]) {
          rotationRefs.current[diag.id] = { current: 0 };
        }
        
        // Calcular el ángulo actual y posición para diagonales fijas
        let currentAngle;
        if (diag.isFixed) {
          // Para diagonales fijas, recalcular propiedades en cada frame por si cambió el tamaño de ventana
          const { diagonal1, diagonal2, diagonal3 } = calculateFixedDiagonalProps();
          const fixedProps = diag.id === 'diag-fixed-1' ? diagonal1 : 
                            diag.id === 'diag-fixed-2' ? diagonal2 : 
                            diagonal3;
          
          // Actualizar propiedades dinámicas de la diagonal fija (posicionamiento desde centro)
          currentAngle = fixedProps.angle;
          el.style.width = `${fixedProps.width}px`;
          el.style.transform = `translate(-50%, -50%) rotate(${currentAngle}deg)`;
        } else {
          // Las diagonales fijas no rotan
          const hasActiveAnimation = rotationTimelinesRef.current[diag.id] && rotationTimelinesRef.current[diag.id].isActive();
          if (!hasActiveAnimation && !rotationTimelinesRef.current[diag.id]) {
            const baseDuration = 60;
            const speedMultiplier = diag.speed || 1;
            const creationIntensity = diag.creationIntensity !== undefined ? diag.creationIntensity : 0.5;
            // Multiplicador más agresivo para velocidades mayores
            const intensityMultiplier = 0.05 + ((1 - creationIntensity) * 0.15);
            const duration = baseDuration / speedMultiplier * intensityMultiplier;
            
            rotationTimelinesRef.current[diag.id] = gsap.to(rotationRefs.current[diag.id], {
              current: 360,
              duration: duration,
              ease: 'none',
              repeat: -1
            });
          }

          // Actualizar rotación solo para diagonales no fijas
          const rotation = rotationRefs.current[diag.id] ? rotationRefs.current[diag.id].current : 0;
          currentAngle = diag.baseAngle + rotation;
        }
        
        // Solo aplicar rotación con GSAP si NO es una diagonal fija
        // Las fijas ya tienen su transform aplicado directamente en el estilo
        if (!diag.isFixed) {
          gsap.set(el, {
            rotation: currentAngle,
            force3D: true
          });
        }

        // Las diagonales fijas no se desvanecen ni se eliminan
        if (!diag.isFixed) {
          // Desvanecimiento ajustado para mantener diagonales visibles más tiempo
          const age = now - diag.createdAt;
          const fadeStartTime = 5000; // 5 segundos antes de empezar a desvanecer
          const fadeDuration = 5000; // 5 segundos para desvanecerse completamente
          
          if (age > fadeStartTime) {
            const fadeProgress = Math.min((age - fadeStartTime) / fadeDuration, 1);
            // Empezar desde la opacidad inicial (basada en intensidad) y desvanecer hasta 0
            const initialOpacity = diag.opacity !== undefined ? diag.opacity : 1;
            const newOpacity = initialOpacity * (1 - fadeProgress);
            
            gsap.set(el, {
              opacity: newOpacity,
              force3D: true
            });
            
            // Solo eliminar si está completamente desvanecida
            // Asegurar que las diagonales generadas con música no se eliminen prematuramente
            // Solo eliminar si la opacidad es realmente 0 y ha pasado suficiente tiempo
            if (fadeProgress >= 1 && !removingDiagonalsRef.current.has(diag.id) && newOpacity <= 0.01) {
              removingDiagonalsRef.current.add(diag.id);
              
              // Matar la animación de rotación antes de eliminar
              if (rotationTimelinesRef.current[diag.id]) {
                rotationTimelinesRef.current[diag.id].kill();
                delete rotationTimelinesRef.current[diag.id];
              }
              delete rotationRefs.current[diag.id];
              delete diagonalRefs.current[diag.id];
              
              // Usar setTimeout para evitar eliminar durante el render
              setTimeout(() => {
                setDiagonales(prev => prev.filter(d => d.id !== diag.id));
              }, 0);
            }
          }
        }

        // Colores y degradados
        // Excluir diagonales fijas del cálculo del índice para que no afecten a las otras
        const nonFixedDiagonals = diagonales.filter(d => !d.isFixed);
        const nonFixedIndex = nonFixedDiagonals.findIndex(d => d.id === diag.id);
        const freqIndex = diag.isFixed 
          ? 0 // Las fijas usan índice 0 para no afectar
          : Math.floor((nonFixedIndex / Math.max(nonFixedDiagonals.length, 1)) * (dataArrayRef?.current?.length || 1024));
        const freqIntensity = dataArrayRef?.current ? Math.min(dataArrayRef.current[freqIndex] / 255, 1) : 0.5;
        
        const centerStart = 30 - freqIntensity * 10;
        const centerEnd = 70 + freqIntensity * 10;
        
        const gradient = `linear-gradient(
          ${currentAngle}deg,
          rgba(0, 0, 0, 0) 0%,
          rgba(0, 0, 0, 0) ${centerStart}%,
          ${currentColor} ${centerStart + 5}%,
          ${currentColor2} ${centerEnd - 5}%,
          rgba(0, 0, 0, 0) ${centerEnd}%,
          rgba(0, 0, 0, 0) 100%
        )`;

        el.style.background = gradient;
        // Resplandor suave en las diagonales
        el.style.boxShadow = `
          0 0 1vw ${currentColor},
          0 0 2vw ${currentColor},
          0 0 3vw ${currentColor2},
          inset 0 0 0.5vw ${currentColor}
        `;
      });

      loopRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (loopRef.current) {
        cancelAnimationFrame(loopRef.current);
        loopRef.current = null;
      }
      Object.values(rotationTimelinesRef.current).forEach(tl => {
        if (tl) tl.kill();
      });
      rotationTimelinesRef.current = {};
    };
  }, [isInitialized, analyserRef, dataArrayRef, diagonales, squares]);

  return (
    <div className="diagonales" ref={containerRef}>
      {diagonales.map(diag => {
        // Para diagonales fijas, calcular propiedades dinámicamente para el estilo inline
        let displayAngle = diag.baseAngle;
        let dynamicStyle = {};
        
        if (diag.isFixed) {
          const { diagonal1, diagonal2, diagonal3 } = calculateFixedDiagonalProps();
          const fixedProps = diag.id === 'diag-fixed-1' ? diagonal1 : 
                            diag.id === 'diag-fixed-2' ? diagonal2 : 
                            diagonal3;
          displayAngle = fixedProps.angle;
          // Solo estilos dinámicos en línea (width y rotación, posicionamiento desde centro)
          dynamicStyle = {
            width: `${fixedProps.width}px`,
            transform: `translate(-50%, -50%) rotate(${displayAngle}deg)`
          };
        } else {
          dynamicStyle = { '--diagonal-angle': `${displayAngle}deg` };
        }
        
        return (
          <div
            key={diag.id}
            ref={el => {
              if (el) {
                diagonalRefs.current[diag.id] = el;
                // Para diagonales fijas, actualizar estilos dinámicos
                if (diag.isFixed) {
                  const { diagonal1, diagonal2, diagonal3 } = calculateFixedDiagonalProps();
                  const fixedProps = diag.id === 'diag-fixed-1' ? diagonal1 : 
                                    diag.id === 'diag-fixed-2' ? diagonal2 : 
                                    diagonal3;
                  
                  // Solo estilos dinámicos en línea (width y rotación, posicionamiento desde centro)
                  el.style.width = `${fixedProps.width}px`;
                  el.style.transform = `translate(-50%, -50%) rotate(${fixedProps.angle}deg)`;
                } else {
                  // Usar la opacidad inicial basada en la intensidad
                  const initialOpacity = diag.opacity !== undefined ? diag.opacity : 1;
                  gsap.set(el, { 
                    opacity: initialOpacity,
                    rotation: diag.baseAngle,
                    force3D: true 
                  });
                }
              } else {
                delete diagonalRefs.current[diag.id];
              }
            }}
            className={`diagonales__line ${diag.isFixed ? 'diagonales__line--fixed' : ''}`}
            style={dynamicStyle}
          />
        );
      })}
    </div>
  );
};

export default Diagonales;
