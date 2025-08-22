import { getConfigValue } from './config-loader.js';

export const CUT = {
  0.5:{max:{oxygen:6,nitrogen:3,air:4},pierce:{oxygen:2.0,nitrogen:1.5,air:2.5}},
  1.0:{max:{oxygen:10,nitrogen:6,air:8},pierce:{oxygen:1.5,nitrogen:1.0,air:2.0}},
  1.5:{max:{oxygen:15,nitrogen:10,air:12},pierce:{oxygen:1.2,nitrogen:0.8,air:1.5}},
  2.0:{max:{oxygen:25,nitrogen:20,air:18},pierce:{oxygen:1.0,nitrogen:0.6,air:1.2}}
};

export function calcCutParams(power, th, gas){
  const P = CUT[power]; 
  if(!P) return {can:false, reason:"Нет данных по мощности"};
  
  const max = P.max[gas]; 
  if(th > max) return {can:false, reason:`Недостаточная мощность для ${th} мм (${gas})`};
  
  // Get base cutting speeds and power multipliers from configuration
  const baseCutSpeeds = getConfigValue('cutting.baseCutSpeeds', {});
  const powerMultipliers = getConfigValue('cutting.powerMultipliers', {});
  const thicknessKey = String(th);
  const powerKey = String(power);
  
  // Debug: Check if configuration values are loaded
  if (Object.keys(baseCutSpeeds).length === 0) {
    console.warn('baseCutSpeeds configuration is empty or not loaded');
  }
  if (Object.keys(powerMultipliers).length === 0) {
    console.warn('powerMultipliers configuration is empty or not loaded');
  }
  
  let speed = baseCutSpeeds[thicknessKey];
  const powerMultiplier = powerMultipliers[powerKey];
  
  // Apply power multiplier if both base speed and multiplier are available
  if (speed && powerMultiplier) {
    const calculatedSpeed = speed * powerMultiplier;
    speed = Math.round(calculatedSpeed);
    // Only log in debug mode to reduce console noise
    if (console.debug) {
      console.debug(`Speed calculation: ${baseCutSpeeds[thicknessKey]} × ${powerMultiplier} = ${calculatedSpeed} → ${speed} mm/min`);
    }
  } else {
    // Debug: Show what values we got
    if (!speed || !powerMultiplier) {
      console.debug(`Missing config values - thickness "${thicknessKey}": ${speed}, power "${powerKey}": ${powerMultiplier}`);
      console.debug('Available thickness keys:', Object.keys(baseCutSpeeds));
      console.debug('Available power keys:', Object.keys(powerMultipliers));
    }
    
    // Fallback to old cutSpeeds configuration for backward compatibility
    const cutSpeeds = getConfigValue('cutting.cutSpeeds', {});
    speed = cutSpeeds[thicknessKey];
    
    if (speed) {
      console.debug(`Using legacy cutSpeeds configuration: ${speed} mm/min`);
    } else {
      // Final fallback to calculated speed
      const baseSpeed = 2000;
      speed = Math.max(Math.round(baseSpeed * Math.pow(1 - (th/(max*1.5)), 0.6)), 100);
      // Only show warning for truly missing configurations
      console.info(`Using calculated speed for ${th}mm @ ${power}kW: ${speed} mm/min`);
    }
  }
  
  const pierce = P.pierce[gas] * (1 + (th/max) * 2);
  const gasCons = (th/3) * (gas === 'nitrogen' ? 4.0 : gas === 'oxygen' ? 2.0 : 1.0);
  
  return {can: true, speed, pierce, gasCons};
}
