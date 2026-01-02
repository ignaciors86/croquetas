'use client';

import React, { useRef, useEffect, useState } from 'react';
import './AudioAnalyzer.scss';

const AudioAnalyzer = ({ onBeat, onVoice, onAudioData, audioRef, currentAudioIndex = null, analyserRef: externalAnalyserRef, dataArrayRef: externalDataArrayRef, timeDataArrayRef: externalTimeDataArrayRef, setIsInitialized: externalSetIsInitialized }) => {
  // Crear refs internos como fallback
  const internalAnalyserRef = useRef(null);
  const internalDataArrayRef = useRef(null);
  const internalTimeDataArrayRef = useRef(null);
  const [internalIsInitialized, setInternalIsInitialized] = useState(false);
  const isInitializedRef = useRef(false);
  
  // Usar refs externos si están disponibles, sino usar internos
  const analyserRef = externalAnalyserRef || internalAnalyserRef;
  const dataArrayRef = externalDataArrayRef || internalDataArrayRef;
  const timeDataArrayRef = externalTimeDataArrayRef || internalTimeDataArrayRef;
  
  // Función para actualizar el estado de inicialización (tanto interno como externo)
  const updateIsInitialized = (value) => {
    isInitializedRef.current = value;
    if (externalSetIsInitialized) {
      externalSetIsInitialized(value);
    } else {
      setInternalIsInitialized(value);
    }
  };
  
  // Usar el estado interno para las dependencias del useEffect
  const isInitialized = externalSetIsInitialized ? isInitializedRef.current : internalIsInitialized;
  
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const lastAudioIndexRef = useRef(null);
  
  // Configurar AudioContext simple para análisis
  useEffect(() => {
    if (!audioRef?.current) return;
    
    const audio = audioRef.current;
    
    // Si ya tenemos refs externos del AudioContext, NO crear una nueva conexión
    // El AudioContext ya ha conectado el elemento audio, solo necesitamos usar los refs
    if (externalAnalyserRef && externalAnalyserRef.current && externalDataArrayRef && externalDataArrayRef.current) {
      console.log('[AudioAnalyzer] Usando analyser y dataArray del AudioContext existente');
      analyserRef.current = externalAnalyserRef.current;
      dataArrayRef.current = externalDataArrayRef.current;
      // Inicializar timeDataArrayRef si no está disponible
      if (externalTimeDataArrayRef && externalTimeDataArrayRef.current) {
        timeDataArrayRef.current = externalTimeDataArrayRef.current;
      } else if (!timeDataArrayRef.current && analyserRef.current) {
        // Crear timeDataArrayRef si no existe
        const bufferLength = analyserRef.current.frequencyBinCount;
        timeDataArrayRef.current = new Uint8Array(bufferLength);
      }
      updateIsInitialized(true);
      lastAudioIndexRef.current = currentAudioIndex;
      return;
    }
    
    // Verificar si el audio ya está conectado a otro AudioContext
    // Reutilizar la conexión existente - el MediaElementSourceNode está conectado al elemento,
    // no al archivo específico, por lo que funciona cuando cambia el src
    if (audio.__audioAnalyzerSourceNode) {
      // Reutilizar el AudioContext existente si está disponible
      if (audio.__audioAnalyzerContext) {
        audioContextRef.current = audio.__audioAnalyzerContext;
        analyserRef.current = audio.__audioAnalyzerAnalyser;
        sourceNodeRef.current = audio.__audioAnalyzerSourceNode;
        if (audio.__audioAnalyzerDataArray) {
          dataArrayRef.current = audio.__audioAnalyzerDataArray;
        }
        if (audio.__audioAnalyzerTimeArray) {
          timeDataArrayRef.current = audio.__audioAnalyzerTimeArray;
        }
        updateIsInitialized(true);
        lastAudioIndexRef.current = currentAudioIndex;
        
        // Si el AudioContext está suspendido, resumirlo silenciosamente
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().then(() => {
          }).catch(() => {
            // Error esperado si no hay interacción del usuario - no mostrar warning
          });
        }
        
        return;
      }
    }
    
    let audioContext = null;
    let analyser = null;
    let source = null;
    
    try {
      if (typeof window === 'undefined' || (!window.AudioContext && !window.webkitAudioContext)) {
        console.warn('[AudioAnalyzer] AudioContext not available in this environment');
        updateIsInitialized(false);
        return;
      }
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      
      source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      
      // Guardar referencias en el elemento audio para reutilización
      audio.__audioAnalyzerConnected = true;
      audio.__audioAnalyzerSourceNode = source;
      audio.__audioAnalyzerContext = audioContext;
      audio.__audioAnalyzerAnalyser = analyser;
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceNodeRef.current = source;
      const bufferLength = analyser.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);
      timeDataArrayRef.current = new Uint8Array(bufferLength);
      
      // Guardar también los arrays para reutilización
      audio.__audioAnalyzerDataArray = dataArrayRef.current;
      audio.__audioAnalyzerTimeArray = timeDataArrayRef.current;
      
      // Guardar el índice de audio actual
      lastAudioIndexRef.current = currentAudioIndex;
      
      if (audioContext.state === 'suspended') {
        // Intentar resumir silenciosamente - los warnings del navegador son normales en desarrollo
        audioContext.resume().then(() => {
          updateIsInitialized(true);
        }).catch(() => {
          // Error esperado si no hay interacción del usuario - no mostrar warning
          updateIsInitialized(false);
        });
      } else {
        updateIsInitialized(true);
      }
    } catch (error) {
      console.warn('[AudioAnalyzer] Error setting up AudioContext:', error);
      // Si el error es que ya está conectado, intentar reutilizar
      if (error.message.includes('already connected')) {
        if (audio.__audioAnalyzerContext && audio.__audioAnalyzerAnalyser) {
          audioContextRef.current = audio.__audioAnalyzerContext;
          analyserRef.current = audio.__audioAnalyzerAnalyser;
          if (audio.__audioAnalyzerDataArray) {
            dataArrayRef.current = audio.__audioAnalyzerDataArray;
          }
          if (audio.__audioAnalyzerTimeArray) {
            timeDataArrayRef.current = audio.__audioAnalyzerTimeArray;
          }
          updateIsInitialized(true);
        } else {
          updateIsInitialized(false);
        }
      } else {
        updateIsInitialized(false);
      }
    }
    
    return () => {
      // No desconectar el sourceNode aquí porque lo necesitamos para que el audio funcione
      // El MediaElementSourceNode está conectado al elemento, no al archivo específico
      // Solo limpiar si realmente estamos desmontando el componente
    };
  }, [audioRef, currentAudioIndex, externalAnalyserRef, externalDataArrayRef, externalTimeDataArrayRef]);
  const lastBeatTimeRef = useRef(0);
  const lastVoiceTimeRef = useRef(0);
  const energyHistoryRef = useRef([]);
  const voiceHistoryRef = useRef([]);
  const trebleHistoryRef = useRef([]); // Historial para detección de picos agudos (cuadros sólidos)

  // Rangos de frecuencias (en índices del array de frecuencias)
  // Con fftSize 2048, tenemos 1024 bins de frecuencia
  // Cada bin representa aproximadamente 21.5Hz (44100Hz / 2048)
  const frequencyRanges = {
    subBass: { start: 0, end: 24 },      // 0-516Hz - Subgraves profundos
    bass: { start: 24, end: 80 },        // 516-1720Hz - Graves
    lowMid: { start: 80, end: 200 },    // 1720-4300Hz - Medios bajos
    mid: { start: 200, end: 400 },       // 4300-8600Hz - Medios
    highMid: { start: 400, end: 600 },  // 8600-12900Hz - Medios altos
    treble: { start: 600, end: 800 },   // 12900-17200Hz - Agudos
    presence: { start: 800, end: 1024 } // 17200-22050Hz - Presencia
  };

  useEffect(() => {
    // Si cambió el audio, limpiar los historiales para empezar con datos frescos
    if (lastAudioIndexRef.current !== null && lastAudioIndexRef.current !== currentAudioIndex) {
      energyHistoryRef.current = [];
      voiceHistoryRef.current = [];
      trebleHistoryRef.current = [];
      lastBeatTimeRef.current = 0;
      lastVoiceTimeRef.current = 0;
      waitForAudioReady = true; // Marcar que debemos esperar a que el nuevo audio esté listo
    }
    
    // Actualizar el índice de audio actual
    lastAudioIndexRef.current = currentAudioIndex;
    
    // Esperar a que los refs estén disponibles y el audio esté realmente funcionando
    if (!isInitialized) {
      return;
    }

    // Verificar que tenemos todos los refs necesarios
    if (!analyserRef.current) {
      console.warn(`[AudioAnalyzer] Analyser not available. Audio may be connected to another AudioContext. Audio analysis will not work.`);
      return;
    }

    if (!dataArrayRef.current) {
      console.warn(`[AudioAnalyzer] dataArrayRef not available`);
      return;
    }

    // Verificar que el AudioContext esté en estado 'running' y el audio esté reproduciéndose
    const audioContext = audioContextRef?.current;
    const audio = audioRef?.current;
    
    if (audioContext && audioContext.state !== 'running') {
      // Intentar resumir el AudioContext silenciosamente
      audioContext.resume().then(() => {
      }).catch(() => {
        // Error esperado si no hay interacción del usuario - no mostrar error
      });
      return;
    }

    let animationFrameId;
    let waitForAudioReady = false;

    // Función auxiliar para calcular el centroide espectral
    const calculateSpectralCentroid = (frequencyData, audioContext, analyser) => {
      if (!audioContext || !analyser) return 0;
      
      let weightedSum = 0;
      let magnitudeSum = 0;
      const sampleRate = audioContext.sampleRate;
      const fftSize = analyser.fftSize;
      
      for (let i = 0; i < frequencyData.length; i++) {
        const magnitude = frequencyData[i];
        const frequency = (i * sampleRate) / fftSize;
        weightedSum += frequency * magnitude;
        magnitudeSum += magnitude;
      }
      
      return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
    };

    let frameCount = 0;
    const analyze = () => {
      if (!analyserRef.current || !dataArrayRef.current) {
        console.warn(`[AudioAnalyzer] analyze: Missing refs | analyserRef: ${!!analyserRef.current} | dataArrayRef: ${!!dataArrayRef.current}`);
        animationFrameId = requestAnimationFrame(analyze);
        return;
      }
      
      // Verificar que el audio esté listo - si no, esperar y continuar el loop
      const currentAudio = audioRef?.current;
      if (currentAudio && (currentAudio.paused || currentAudio.readyState < 3)) {
        // El audio no está listo todavía, pero continuamos el loop para esperar
        if (frameCount % 60 === 0) {
        }
        animationFrameId = requestAnimationFrame(analyze);
        return;
      }
      
      // Si estábamos esperando y ahora el audio está listo, loguear
      if (waitForAudioReady && currentAudio && !currentAudio.paused && currentAudio.readyState >= 3) {
        waitForAudioReady = false;
      }
      
      frameCount++;
      if (frameCount % 60 === 0) {
      }
      
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      analyserRef.current.getByteTimeDomainData(timeDataArrayRef.current);
      
      // Calcular energía por rango de frecuencia
      const rangeEnergy = {};
      for (const [name, range] of Object.entries(frequencyRanges)) {
        let energy = 0;
        for (let i = range.start; i < range.end && i < dataArrayRef.current.length; i++) {
          energy += dataArrayRef.current[i];
        }
        rangeEnergy[name] = energy / (range.end - range.start);
      }

      // Energía total (volumen general de la música)
      const totalEnergy = Object.values(rangeEnergy).reduce((a, b) => a + b, 0) / Object.keys(rangeEnergy).length;

      // Energía de graves (bass + subBass) para detección de beats/ritmos (para cuadros)
      const bassEnergy = (rangeEnergy.subBass + rangeEnergy.bass) / 2;
      const lowMidEnergy = rangeEnergy.lowMid;
      const rhythmEnergy = (bassEnergy * 0.7) + (lowMidEnergy * 0.3);
      
      // Energía de voces (frecuencias medias-altas) para diagonales
      const midEnergy = (rangeEnergy.mid + rangeEnergy.highMid) / 2;
      const trebleEnergy = (rangeEnergy.treble + rangeEnergy.presence) / 2;
      const voiceEnergy = (midEnergy * 0.6) + (trebleEnergy * 0.4);
      
      // Energía aguda para detección de cuadros sólidos (picos en frecuencias altas)
      const sharpEnergy = (rangeEnergy.treble * 0.7) + (rangeEnergy.presence * 0.3);

      // Historiales separados para ritmos y voces
      energyHistoryRef.current.push(rhythmEnergy);
      if (energyHistoryRef.current.length > 20) {
        energyHistoryRef.current.shift();
      }

      const averageRhythmEnergy = energyHistoryRef.current.length > 0
        ? energyHistoryRef.current.reduce((a, b) => a + b, 0) / energyHistoryRef.current.length
        : 0;

      const rhythmVariance = energyHistoryRef.current.length > 1
        ? energyHistoryRef.current.reduce((acc, val) => acc + Math.pow(val - averageRhythmEnergy, 2), 0) / energyHistoryRef.current.length
        : 0;

      // Ajustar sensibilidad según el volumen detectado
      // Volumen normalizado (0-1) basado en la energía total
      const normalizedVolume = Math.min(totalEnergy / 255, 1); // 255 es el máximo valor de getByteFrequencyData

      // Historial para detección de picos agudos (cuadros sólidos)
      trebleHistoryRef.current.push(sharpEnergy);
      if (trebleHistoryRef.current.length > 15) {
        trebleHistoryRef.current.shift();
      }

      const averageTrebleEnergy = trebleHistoryRef.current.length > 0
        ? trebleHistoryRef.current.reduce((a, b) => a + b, 0) / trebleHistoryRef.current.length
        : 0;

      const trebleVariance = trebleHistoryRef.current.length > 1
        ? trebleHistoryRef.current.reduce((acc, val) => acc + Math.pow(val - averageTrebleEnergy, 2), 0) / trebleHistoryRef.current.length
        : 0;

      // Detección de picos agudos para cuadros sólidos - SENSIBILIDAD REDUCIDA
      // Sensibilidad reducida para que las imágenes aparezcan con menos frecuencia
      const trebleSensitivity = 0.22 + (0.33 * (1 - normalizedVolume)); // 0.22-0.55 (menos sensible)
      const trebleThreshold = averageTrebleEnergy + (Math.sqrt(trebleVariance) * trebleSensitivity * 0.75); // Multiplicador 0.75
      const trebleSpikeThreshold = 0.45 + (0.2 * (1 - normalizedVolume)); // 0.45-0.65 (menos sensible)
      const trebleSpikeMultiplier = 0.95 + (0.15 * (1 - normalizedVolume)); // 0.95-1.1 (menos sensible)
      const recentTreble = trebleHistoryRef.current.slice(-4);
      const maxRecentTreble = recentTreble.length > 0 ? Math.max(...recentTreble) : 0;
      const trebleSpike = sharpEnergy > maxRecentTreble * trebleSpikeThreshold && sharpEnergy > averageTrebleEnergy * trebleSpikeMultiplier;
      const solidSquareDetected = sharpEnergy > trebleThreshold || trebleSpike;
      
      // Detección de ritmos para cuadros - SENSIBILIDAD REDUCIDA
      // Menos sensible para que no salgan tantos cuadros
      const rhythmSensitivity = 0.05 + (0.25 * (1 - normalizedVolume)); // 0.05-0.3 (menos sensible)
      const rhythmThreshold = averageRhythmEnergy + (Math.sqrt(rhythmVariance) * rhythmSensitivity * 0.4); // Multiplicador 0.4
      const rhythmSpikeThreshold = 0.15 + (0.1 * (1 - normalizedVolume)); // 0.15-0.25 (menos sensible)
      const rhythmSpikeMultiplier = 0.7 + (0.2 * (1 - normalizedVolume)); // 0.7-0.9 (menos sensible)
      const recentRhythm = energyHistoryRef.current.slice(-5);
      const maxRecentRhythm = Math.max(...recentRhythm);
      const rhythmSpike = rhythmEnergy > maxRecentRhythm * rhythmSpikeThreshold && rhythmEnergy > averageRhythmEnergy * rhythmSpikeMultiplier;
      
      // Detección de voces para diagonales
      const voiceHistory = voiceHistoryRef.current || [];
      voiceHistory.push(voiceEnergy);
      if (voiceHistory.length > 20) voiceHistory.shift();
      voiceHistoryRef.current = voiceHistory;
      
      const averageVoiceEnergy = voiceHistory.length > 0
        ? voiceHistory.reduce((a, b) => a + b, 0) / voiceHistory.length
        : 0;
      
      const voiceVariance = voiceHistory.length > 1
        ? voiceHistory.reduce((acc, val) => acc + Math.pow(val - averageVoiceEnergy, 2), 0) / voiceHistory.length
        : 0;
      
      // Detección de voces extremadamente sensible
      const voiceSensitivity = 0.05 + (0.3 * (1 - normalizedVolume));
      const voiceThreshold = averageVoiceEnergy + (Math.sqrt(voiceVariance) * voiceSensitivity * 0.3);
      const voiceSpikeThreshold = 0.25 + (0.1 * (1 - normalizedVolume));
      const voiceSpikeMultiplier = 0.65 + (0.15 * (1 - normalizedVolume));
      const recentVoice = voiceHistory.slice(-5);
      const maxRecentVoice = Math.max(...recentVoice);
      const voiceSpike = voiceEnergy > maxRecentVoice * voiceSpikeThreshold && voiceEnergy > averageVoiceEnergy * voiceSpikeMultiplier;

      // Detección de ritmos para cuadros - FRECUENCIA MODERADA
      const now = Date.now();
      const timeSinceLastBeat = now - lastBeatTimeRef.current;
      const minTimeBetweenBeats = 100 + (200 * (1 - normalizedVolume)); // 100-300ms para frecuencia moderada
      const rhythmDetected = (rhythmEnergy > rhythmThreshold || rhythmSpike) && timeSinceLastBeat > minTimeBetweenBeats;
      
      if (rhythmDetected) {
        lastBeatTimeRef.current = now;
        if (onBeat) {
          try {
            // Pasar información sobre si debe ser cuadro sólido basado en análisis de frecuencias agudas
            onBeat(normalizedVolume, solidSquareDetected);
          } catch (error) {
            console.error(`[AudioAnalyzer] ERROR in onBeat callback: ${error.message}`);
          }
        }
      }
      
      // Detección de voces para diagonales - muy frecuente
      const timeSinceLastVoice = now - lastVoiceTimeRef.current;
      const minTimeBetweenVoices = 200 + (600 * (1 - normalizedVolume)); // Muy frecuente
      // Detección más robusta: aceptar si hay energía de voz significativa o spike
      const hasSignificantVoice = voiceEnergy > averageVoiceEnergy * 0.8 || voiceEnergy > 20;
      const voiceDetected = (hasSignificantVoice || voiceEnergy > voiceThreshold || voiceSpike) && timeSinceLastVoice > minTimeBetweenVoices;
      
      if (voiceDetected) {
        lastVoiceTimeRef.current = now;
        if (onVoice) {
          try {
            onVoice(normalizedVolume, voiceEnergy);
          } catch (error) {
            console.error(`[AudioAnalyzer] onVoice error: ${error.message} | stack: ${error.stack}`);
          }
        } else {
          console.warn(`[AudioAnalyzer] onVoice callback is null`);
        }
      }

      // Calcular ritmo estimado (BPM aproximado basado en intervalos entre beats)
      const beatInterval = now - lastBeatTimeRef.current;
      const estimatedBPM = beatInterval > 0 ? 60000 / beatInterval : 0;

      // Preparar datos de audio para efectos futuros
      if (onAudioData) {
        const audioData = {
          // Energías por rango
          frequencies: rangeEnergy,
          
          // Métricas globales
          totalEnergy: totalEnergy,
          averageEnergy: averageRhythmEnergy,
          energyVariance: rhythmVariance,
          
          // Métricas de ritmo
          bassEnergy: bassEnergy,
          estimatedBPM: estimatedBPM,
          beatDetected: rhythmDetected,
          
          // Datos raw para análisis avanzado
          frequencyData: Array.from(dataArrayRef.current),
          timeData: Array.from(timeDataArrayRef.current),
          
          // Características calculadas
          dynamics: {
            // Intensidad relativa de cada rango
            subBassIntensity: rangeEnergy.subBass / (totalEnergy || 1),
            bassIntensity: rangeEnergy.bass / (totalEnergy || 1),
            midIntensity: (rangeEnergy.lowMid + rangeEnergy.mid) / (totalEnergy || 1),
            trebleIntensity: (rangeEnergy.treble + rangeEnergy.presence) / (totalEnergy || 1),
            
            // Ratio graves/agudos
            bassToTrebleRatio: (rangeEnergy.bass + rangeEnergy.subBass) / (rangeEnergy.treble + rangeEnergy.presence || 1),
            
            // Centroide espectral (frecuencia promedio ponderada)
            spectralCentroid: 0, // Se calculará si se necesita
          }
        };

        onAudioData(audioData);
      }
      
      animationFrameId = requestAnimationFrame(analyze);
    };

    animationFrameId = requestAnimationFrame(analyze);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isInitialized, onBeat, onVoice, onAudioData, analyserRef, dataArrayRef, timeDataArrayRef, audioContextRef, audioRef, currentAudioIndex]);

  return null;
};

export default AudioAnalyzer;
