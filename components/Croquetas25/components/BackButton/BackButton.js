'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { gsap } from 'gsap';
import Croqueta from '../Croqueta/Croqueta';
import './BackButton.scss';

const MAINCLASS = 'backButton';

const BackButton = ({ onBack, audioRef }) => {
  const router = useRouter();
  const buttonRef = React.useRef(null);
  const croquetaWrapperRef = React.useRef(null);
  const animationRef = React.useRef(null);
  
  React.useEffect(() => {
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
  
  const handleBack = async () => {
    if (!buttonRef.current) return;
    
    const exitProps = { scale: 0, opacity: 0, duration: 1.5, ease: 'power2.in' };
    const exitTimeline = gsap.timeline();
    exitTimeline.to(buttonRef.current, exitProps);
    
    // Pausar audio si está disponible y está reproduciéndose
    if (audioRef?.current && !audioRef.current.paused) {
      try {
        audioRef.current.pause();
      } catch (e) {
        console.warn('[BackButton] Error pausando audio:', e);
      }
    }
    
    await exitTimeline;
    
    if (onBack) {
      onBack();
    }
    router.push('/');
  };
  
  return (
    <div className={MAINCLASS} ref={buttonRef}>
      <div ref={croquetaWrapperRef} className={`${MAINCLASS}__wrapper`}>
        <Croqueta
          index={0}
          text="Volver"
          onClick={handleBack}
          rotation={0}
          className={`${MAINCLASS}__croqueta`}
        />
      </div>
    </div>
  );
};

export default BackButton;
