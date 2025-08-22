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
  
  // Default values from config.json in case configuration is not loaded yet
  const defaultBaseCutSpeeds = {
    "0.5": 3500, "0.6": 3200, "0.7": 3000, "0.8": 2800,
    "1": 2500, "1.5": 2000, "2": 1600, "3": 1200, "5": 800, "6": 600
  };
  const defaultPowerMultipliers = {
    "0.5": 0.7, "1.0": 1.0, "1.5": 1.4, "2.0": 1.8
  };
  
  // Get configuration values with fallbacks
  const baseCutSpeeds = getConfigValue('cutting.baseCutSpeeds', defaultBaseCutSpeeds);
  const powerMultipliers = getConfigValue('cutting.powerMultipliers', defaultPowerMultipliers);
  const thicknessKey = String(th);
  const powerKey = String(power);
  
  let speed = baseCutSpeeds[thicknessKey];
  const powerMultiplier = powerMultipliers[powerKey];
  
  // Apply power multiplier if both base speed and multiplier are available
  if (speed && powerMultiplier) {
    const calculatedSpeed = speed * powerMultiplier;
    speed = Math.round(calculatedSpeed);
  } else {
    // Fallback to old cutSpeeds configuration for backward compatibility
    const cutSpeeds = getConfigValue('cutting.cutSpeeds', defaultBaseCutSpeeds);
    speed = cutSpeeds[thicknessKey];
    
    if (speed) {
      // Use legacy configuration speed directly
    } else {
      // Final fallback to calculated speed
      const baseSpeed = 2000;
      speed = Math.max(Math.round(baseSpeed * Math.pow(1 - (th/(max*1.5)), 0.6)), 100);
    }
  }
  
  const pierce = P.pierce[gas] * (1 + (th/max) * 2);
  const gasCons = (th/3) * (gas === 'nitrogen' ? 4.0 : gas === 'oxygen' ? 2.0 : 1.0);
  
  return {can: true, speed, pierce, gasCons};
}
