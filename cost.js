import { getConfigValue } from './config-loader.js';

/**
 * @typedef {Object} CutParams
 * @property {boolean} can - Можно ли резать с данными параметрами
 * @property {string} [reason] - Причина невозможности резки
 * @property {number} [speed] - Скорость резки в мм/мин
 * @property {number} [pierce] - Время пробивки в секундах
 * @property {number} [gasCons] - Расход газа в л/мин
 */

/**
 * @typedef {Object} CutData
 * @property {Object.<string, number>} max - Максимальная толщина для каждого газа
 * @property {Object.<string, number>} pierce - Базовое время пробивки для каждого газа
 */

/**
 * База данных параметров резки для разных мощностей
 * @type {Object.<number, CutData>}
 */
export const CUT = {
  0.5: {
    max: { oxygen: 6, nitrogen: 3, air: 4 },
    pierce: { oxygen: 2.0, nitrogen: 1.5, air: 2.5 }
  },
  1.0: {
    max: { oxygen: 10, nitrogen: 6, air: 8 },
    pierce: { oxygen: 1.5, nitrogen: 1.0, air: 2.0 }
  },
  1.5: {
    max: { oxygen: 15, nitrogen: 10, air: 12 },
    pierce: { oxygen: 1.2, nitrogen: 0.8, air: 1.5 }
  },
  2.0: {
    max: { oxygen: 25, nitrogen: 20, air: 18 },
    pierce: { oxygen: 1.0, nitrogen: 0.6, air: 1.2 }
  }
};

/**
 * Валидирует входные параметры для расчёта резки
 * @param {number} power - Мощность лазера в кВт
 * @param {number} th - Толщина металла в мм
 * @param {string} gas - Тип газа ('oxygen', 'nitrogen', 'air')
 * @returns {Object} Результат валидации
 */
function validateInputs(power, th, gas) {
  const errors = [];
  
  // Проверка мощности
  if (typeof power === 'undefined' || power === null || power === '') {
    errors.push("Не указана мощность лазера");
  } else if (typeof power !== 'number' || !isFinite(power) || power <= 0) {
    errors.push("Мощность должна быть положительным числом");
  } else if (!CUT[power]) {
    errors.push(`Неподдерживаемая мощность: ${power} кВт`);
  }
  
  // Проверка толщины
  if (typeof th === 'undefined' || th === null || isNaN(th)) {
    errors.push("Не указана толщина металла");
  } else if (typeof th !== 'number' || !isFinite(th) || th <= 0) {
    errors.push("Толщина должна быть положительным числом");
  } else if (th > 50) {
    errors.push("Толщина слишком большая (>50 мм)");
  }
  
  // Проверка газа
  if (typeof gas === 'undefined' || gas === null || gas === '') {
    errors.push("Не указан тип газа");
  } else if (typeof gas !== 'string' || !['oxygen', 'nitrogen', 'air'].includes(gas)) {
    errors.push(`Неподдерживаемый тип газа: ${gas}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Рассчитывает параметры резки для заданных условий
 * @param {number} power - Мощность лазера в кВт
 * @param {number} th - Толщина металла в мм
 * @param {string} gas - Тип газа ('oxygen', 'nitrogen', 'air')
 * @returns {CutParams} Параметры резки
 */
export function calcCutParams(power, th, gas) {
  // Convert string values to numbers if needed
  if (typeof power === 'string') {
    power = parseFloat(power);
  }
  if (typeof th === 'string') {
    th = parseFloat(th);
  }
  
  console.log('calcCutParams called with:', { power, th, gas, types: { power: typeof power, th: typeof th, gas: typeof gas } });
  
  // Валидация входных данных
  const validation = validateInputs(power, th, gas);
  if (!validation.isValid) {
    console.warn('Validation failed:', validation.errors);
    return {
      can: false,
      reason: validation.errors.join('; ')
    };
  }
  
  try {
    const P = CUT[power];
    const max = P.max[gas];
    
    // Проверка возможности резки
    if (th > max) {
      return {
        can: false,
        reason: `Недостаточная мощность для ${th} мм (${gas}). Максимум: ${max} мм`
      };
    }
    
    // Получение конфигурации с fallback значениями
    const defaultBaseCutSpeeds = {
      "0.5": 3500, "0.6": 3200, "0.7": 3000, "0.8": 2800,
      "1": 2500, "1.5": 2000, "2": 1600, "3": 1200, "5": 800, "6": 600
    };
    const defaultPowerMultipliers = {
      "0.5": 0.7, "1.0": 1.0, "1.5": 1.4, "2.0": 1.8
    };
    
    const baseCutSpeeds = getConfigValue('cutting.baseCutSpeeds', defaultBaseCutSpeeds);
    const powerMultipliers = getConfigValue('cutting.powerMultipliers', defaultPowerMultipliers);
    const thicknessKey = String(th);
    const powerKey = String(power);
    
    // Расчёт скорости резки
    let speed = baseCutSpeeds[thicknessKey];
    const powerMultiplier = powerMultipliers[powerKey];
    
    if (speed && powerMultiplier) {
      // Использование конфигурации
      speed = Math.round(speed * powerMultiplier);
    } else {
      // Fallback к старой формуле
      const cutSpeeds = getConfigValue('cutting.cutSpeeds', defaultBaseCutSpeeds);
      speed = cutSpeeds[thicknessKey];
      
      if (!speed) {
        // Финальный fallback к расчётной формуле
        const baseSpeed = 2000;
        speed = Math.max(Math.round(baseSpeed * Math.pow(1 - (th / (max * 1.5)), 0.6)), 100);
      }
    }
    
    // Расчёт времени пробивки с улучшенной формулой
    const basePierce = P.pierce[gas];
    const thicknessFactor = 1 + (th / max) * 2;
    const pierce = Math.max(0.5, basePierce * thicknessFactor);
    
    // Расчёт расхода газа с учётом типа газа и толщины
    const gasConsumptionFactors = {
      nitrogen: 4.0,
      oxygen: 2.0,
      air: 1.0
    };
    const gasCons = Math.max(0.1, (th / 3) * gasConsumptionFactors[gas]);
    
    return {
      can: true,
      speed: Math.round(speed),
      pierce: Math.round(pierce * 100) / 100,
      gasCons: Math.round(gasCons * 100) / 100
    };
    
  } catch (error) {
    console.error('Ошибка в calcCutParams:', error);
    return {
      can: false,
      reason: `Ошибка расчёта: ${error.message}`
    };
  }
}

/**
 * Получает список поддерживаемых мощностей
 * @returns {number[]} Массив мощностей в кВт
 */
export function getSupportedPowers() {
  return Object.keys(CUT).map(Number).sort((a, b) => a - b);
}

/**
 * Получает список поддерживаемых газов
 * @returns {string[]} Массив типов газа
 */
export function getSupportedGases() {
  return ['oxygen', 'nitrogen', 'air'];
}

/**
 * Получает максимальную толщину для заданных параметров
 * @param {number} power - Мощность лазера в кВт
 * @param {string} gas - Тип газа
 * @returns {number|null} Максимальная толщина в мм или null
 */
export function getMaxThickness(power, gas) {
  try {
    const P = CUT[power];
    return P ? P.max[gas] || null : null;
  } catch (error) {
    console.error('Ошибка в getMaxThickness:', error);
    return null;
  }
}
