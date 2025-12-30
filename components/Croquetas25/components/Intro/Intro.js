import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import gsap from 'gsap';
import Croqueta from '../Croqueta/Croqueta';
import './Intro.scss';

const MAINCLASS = 'intro';

const Intro = ({ tracks, onTrackSelect, onStartPlayback = null, selectedTrackId = null, isDirectUri = false, isVisible = true }) => {
  const titleRef = useRef(null);
  const buttonsRef = useRef([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const overlayRef = useRef(null);
  const containerRef = useRef(null);
  const [croquetasUnlocked, setCroquetasUnlocked] = useState(false);
  const rotationTimelinesRef = useRef([]);
  const [isPortrait, setIsPortrait] = useState(typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false);

  const memoizedTracks = useMemo(() => tracks, [tracks]);

  const normalizeId = useCallback((id) => id?.toLowerCase().replace(/\s+/g, '-') || null, []);

  const isMainCroqueta = useCallback((track) => {
    if (!selectedTrackId || !track) return false;
    const normalizedId = normalizeId(selectedTrackId);
    return normalizeId(track.id) === normalizedId || normalizeId(track.name) === normalizedId;
  }, [selectedTrackId, normalizeId]);

  const getCroquetaClasses = useCallback((isMain = false) => {
    return isMain 
      ? `${MAINCLASS}__button--main ${isDirectUri ? `${MAINCLASS}__button--mainUri` : ''}`
      : `${MAINCLASS}__button--normal`;
  }, [isDirectUri]);

  const setButtonRef = useCallback((index) => (el) => {
    if (el) {
      buttonsRef.current[index] = el;
    } else {
      const idx = buttonsRef.current.indexOf(el);
      if (idx !== -1) buttonsRef.current[idx] = null;
    }
  }, []);

  const handleTrackSelect = useCallback((track, index) => {
    if (isAnimating) return;
    
    if (isDirectUri && selectedTrackId && isMainCroqueta(track)) {
      setCroquetasUnlocked(true);
    }
    
    if (isDirectUri && !croquetasUnlocked && !isMainCroqueta(track)) return;
    
    setIsAnimating(true);
    rotationTimelinesRef.current.forEach(tl => tl?.kill());

    const tl = gsap.timeline({
      onComplete: () => {
        setIsAnimating(false);
        onTrackSelect?.(track);
      }
    });

    const fadeOut = { opacity: 0, ease: 'power2.in' };
    titleRef.current && tl.to(titleRef.current, { ...fadeOut, y: -30, duration: 1.2 });

    buttonsRef.current.forEach((buttonRef, i) => {
      if (!buttonRef) return;
      tl.to(buttonRef, {
        ...fadeOut,
        scale: 0,
        rotation: `+=${i === index ? 180 : 0}`,
        duration: 0.8,
        transformOrigin: 'center center'
      }, i === index ? 0 : Math.abs(i - index) * 0.1);
    });
  }, [isAnimating, isDirectUri, selectedTrackId, croquetasUnlocked, isMainCroqueta, onTrackSelect]);

  const handleCroquetaClick = useCallback((track, index) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    // Si hay onStartPlayback y es la croqueta activa (main) en acceso directo, usar onStartPlayback
    if (onStartPlayback && isDirectUri && isMainCroqueta(track)) {
      onStartPlayback(e);
    } else {
      handleTrackSelect(track, index);
    }
  }, [handleTrackSelect, onStartPlayback, isDirectUri, isMainCroqueta]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkOrientation = () => setIsPortrait(window.innerHeight > window.innerWidth);
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);
  
  useEffect(() => {
    setCroquetasUnlocked(false);
  }, [selectedTrackId]);
  
  // Animación de entrada/salida basada en isVisible
  useEffect(() => {
    if (!overlayRef.current || !containerRef.current) return;
    
    if (isVisible) {
      // Resetear todas las transformaciones primero
      if (titleRef.current) {
        gsap.set(titleRef.current, { 
          opacity: 0, 
          y: 0, 
          rotation: 0,
          clearProps: 'all'
        });
      }
      
      // Separar la croqueta principal de las normales para el reset
      const mainCroquetaIndex = memoizedTracks.findIndex(track => 
        selectedTrackId && isMainCroqueta(track)
      );
      
      buttonsRef.current.forEach((buttonRef, index) => {
        if (buttonRef) {
          // La croqueta principal mantiene scale: 1 para preservar su tamaño CSS
          const isMain = index === mainCroquetaIndex;
          gsap.set(buttonRef, { 
            opacity: 0, 
            scale: isMain ? 1 : 0, 
            rotation: 0,
            clearProps: isMain ? 'opacity,rotation' : 'all'
          });
        }
      });
      
      // El overlay (blur) se anima con fade-in suave
      gsap.set(overlayRef.current, { 
        opacity: 0,
        display: 'flex',
        y: 0,
        rotation: 0
      });
      
      // El contenedor interno se desplaza desde abajo
      gsap.set(containerRef.current, { 
        y: '100%', 
        rotation: -15, 
        opacity: 0
      });
      
      const tl = gsap.timeline();
      
      // Animar overlay (blur) con fade-in suave
      tl.to(overlayRef.current, {
        opacity: 1,
        duration: 0.8,
        ease: 'power2.out'
      });
      
      // Animar contenedor desde abajo
      tl.to(containerRef.current, {
        y: '0%',
        rotation: 0,
        opacity: 1,
        duration: 1.2,
        ease: 'back.out(1.4)'
      }, '-=0.6'); // Iniciar un poco antes de que termine el fade del blur
      
      // Animar título
      if (titleRef.current) {
        tl.to(titleRef.current, {
          opacity: 1,
          y: 0,
          rotation: 0,
          duration: 1.0,
          ease: 'power2.out'
        }, '-=0.8');
      }
      
      // Animar botones aleatoriamente como antes
      // Separar la croqueta principal de las normales
      
      const normalButtonIndices = buttonsRef.current
        .map((_, i) => i)
        .filter(i => buttonsRef.current[i] && i !== mainCroquetaIndex)
        .sort(() => Math.random() - 0.5); // Orden aleatorio
      
      // Animar croqueta principal sin escala (mantiene su tamaño CSS)
      if (mainCroquetaIndex >= 0 && buttonsRef.current[mainCroquetaIndex]) {
        const mainButtonRef = buttonsRef.current[mainCroquetaIndex];
        gsap.set(mainButtonRef, { 
          opacity: 0,
          scale: 1, // Mantener escala 1 para preservar tamaño CSS
          rotation: 0
        });
        tl.to(mainButtonRef, {
          opacity: 1,
          scale: 1,
          rotation: 0,
          duration: 0.6,
          ease: 'power2.out'
        }, 0.4);
      }
      
      // Animar croquetas normales con escala
      normalButtonIndices.forEach((originalIndex, shuffledIndex) => {
        const buttonRef = buttonsRef.current[originalIndex];
        if (buttonRef) {
          const delay = 0.4 + (shuffledIndex * 0.1);
          tl.to(buttonRef, {
            opacity: 1,
            scale: 1,
            rotation: 0,
            duration: 0.6,
            ease: 'back.out(1.7)'
          }, delay);
        }
      });
    } else {
      // Animación de salida hacia abajo con rotación
      const tl = gsap.timeline({
        onComplete: () => {
          if (overlayRef.current) {
            gsap.set(overlayRef.current, { display: 'none' });
          }
        }
      });
      
      // Animar título y botones hacia abajo primero
      [titleRef.current, ...buttonsRef.current.filter(Boolean)].forEach((ref, i) => {
        if (ref) {
          tl.to(ref, {
            y: '+=50',
            opacity: 0,
            rotation: `+=${15 + i * 5}`,
            duration: 0.6,
            ease: 'power2.in'
          }, i * 0.05);
        }
      });
      
      // Animar contenedor hacia abajo (no el overlay)
      tl.to(containerRef.current, {
        y: '100%',
        rotation: 15,
        opacity: 0,
        duration: 1.0,
        ease: 'power2.in'
      }, '-=0.3');
      
      // El overlay se desvanece pero no se mueve
      tl.to(overlayRef.current, {
        opacity: 0,
        duration: 0.5,
        ease: 'power2.in'
      }, '-=0.3');
    }
  }, [isVisible]);

  useEffect(() => {
    rotationTimelinesRef.current.forEach(tl => tl?.kill());
    rotationTimelinesRef.current = [];

    buttonsRef.current.forEach((buttonRef, index) => {
      if (!buttonRef) return;
      const track = tracks[index];
      if (!track || isMainCroqueta(track)) return;

      const rotationSpeed = 20 + Math.random() * 10;
      const direction = Math.random() > 0.5 ? 1 : -1;
      
      rotationTimelinesRef.current[index] = gsap.to(buttonRef, {
        rotation: `+=${360 * direction}`,
        duration: rotationSpeed,
        ease: 'none',
        repeat: -1
      });
    });

    return () => {
      rotationTimelinesRef.current.forEach(tl => tl?.kill());
      rotationTimelinesRef.current = [];
    };
  }, [tracks, selectedTrackId, isMainCroqueta]);

  return (
    <div 
      className={MAINCLASS} 
      ref={overlayRef}
      onClick={(e) => e.target === overlayRef.current && e.preventDefault()}
      style={{ display: isVisible ? 'flex' : 'none' }}
    >
      <div className={`${MAINCLASS}__container`} ref={containerRef}>
        <h2 ref={titleRef} className={`${MAINCLASS}__title`}>Coge una croqueta</h2>
        
        {selectedTrackId && memoizedTracks.map((track, index) => {
          if (!isMainCroqueta(track)) return null;
          
          return (
            <Croqueta
              key={track.id}
              index={index}
              text={track.name}
              onClick={handleCroquetaClick(track, index)}
              rotation={0}
              className={`${MAINCLASS}__button ${getCroquetaClasses(true)} ${isDirectUri ? `${MAINCLASS}__button--activeUri` : ''}`}
              ref={setButtonRef(index)}
            />
          );
        })}
        
        <div className={`${MAINCLASS}__buttons`}>
          {memoizedTracks.map((track, index) => {
            if (isMainCroqueta(track) || (isDirectUri && !croquetasUnlocked)) return null;
            
            return (
              <Croqueta
                key={track.id}
                index={index}
                text={track.name}
                onClick={handleCroquetaClick(track, index)}
                rotation={0}
                className={`${MAINCLASS}__button ${getCroquetaClasses(false)}`}
                ref={setButtonRef(index)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Intro;
