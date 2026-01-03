'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { gsap } from 'gsap';
import Croqueta from '../Croqueta/Croqueta';
import './FullscreenButton.scss';

const MAINCLASS = 'fullscreenButton';

const FullscreenButton = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const buttonRef = useRef(null);
  const croquetaWrapperRef = useRef(null);
  const animationRef = useRef(null);

  // Detectar soporte de pantalla completa y dispositivo
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detectar si es móvil
    const checkMobile = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (window.innerWidth <= 768);
      setIsMobile(mobile);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Detectar soporte de pantalla completa
    const checkFullscreenSupport = () => {
      const hasFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        // Para móviles, verificar si hay alguna forma de pantalla completa
        (isMobile && (
          // iOS Safari puede usar requestFullscreen en algunos casos
          document.documentElement.requestFullscreen ||
          document.documentElement.webkitRequestFullscreen ||
          // Android puede tener soporte limitado
          screen.orientation
        ))
      );
      setIsSupported(hasFullscreen || !isMobile); // En desktop siempre soportado
    };

    checkFullscreenSupport();

    // Listeners para cambios de estado de pantalla completa
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      window.removeEventListener('resize', checkMobile);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [isMobile]);

  // Animación de entrada similar a BackButton
  useEffect(() => {
    const initProps = { opacity: 0, scale: 0, rotation: -180 };
    const finalProps = { opacity: 1, scale: 1, rotation: 0, duration: 0.6, ease: 'back.out(1.7)', delay: 0.3 };
    buttonRef.current && gsap.fromTo(buttonRef.current, initProps, finalProps);
    
    if (croquetaWrapperRef.current) {
      const centerOrigin = { transformOrigin: '50% 50%' };
      gsap.set(croquetaWrapperRef.current, { ...centerOrigin, x: 0, y: 0 });
      
      const rotationProps = { ...centerOrigin, rotation: 360, duration: 20, ease: 'none', repeat: -1 };
      const floatProps = { ...centerOrigin, y: '+=10', duration: 3, ease: 'sine.inOut', repeat: -1, yoyo: true };
      
      animationRef.current = {
        rotationTimeline: gsap.to(croquetaWrapperRef.current, rotationProps),
        floatTimeline: gsap.to(croquetaWrapperRef.current, floatProps)
      };
    }
    
    return () => {
      if (animationRef.current) {
        animationRef.current.rotationTimeline?.kill();
        animationRef.current.floatTimeline?.kill();
      }
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!isFullscreen) {
        // Entrar en pantalla completa
        const element = document.documentElement;
        if (element.requestFullscreen) {
          await element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
          await element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
          await element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
          await element.msRequestFullscreen();
        }
      } else {
        // Salir de pantalla completa
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          await document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
      }
    } catch (error) {
      console.warn('[FullscreenButton] Error al cambiar pantalla completa:', error);
    }
  }, [isFullscreen]);

  // Solo mostrar en desktop si no hay soporte móvil, o en móvil si hay soporte
  if (!isSupported && isMobile) {
    return null;
  }

  return (
    <div className={MAINCLASS} ref={buttonRef}>
      <div ref={croquetaWrapperRef} className={`${MAINCLASS}__wrapper`}>
        <Croqueta
          index={1}
          text={isFullscreen ? "Salir" : "Pantalla completa"}
          onClick={toggleFullscreen}
          rotation={0}
          className={`${MAINCLASS}__croqueta`}
        />
      </div>
    </div>
  );
};

export default FullscreenButton;

