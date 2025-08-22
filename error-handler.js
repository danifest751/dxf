/**
 * Централизованная обработка ошибок и валидация для DXF PRO
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Результат валидации
 * @property {Array.<string>} errors - Список ошибок
 * @property {Array.<string>} warnings - Список предупреждений
 */

/**
 * @typedef {Object} ErrorInfo
 * @property {string} message - Сообщение об ошибке
 * @property {string} type - Тип ошибки
 * @property {string} module - Модуль, где произошла ошибка
 * @property {Object} [data] - Дополнительные данные
 * @property {Date} timestamp - Время возникновения ошибки
 */

// Глобальный обработчик ошибок
class ErrorHandler {
  constructor() {
    this.errors = [];
    this.maxErrors = 100;
    this.listeners = [];
    
    // Глобальный обработчик необработанных ошибок
    window.addEventListener('error', (event) => {
      this.handleError({
        message: event.message,
        type: 'unhandled',
        module: 'global',
        data: { filename: event.filename, lineno: event.lineno },
        timestamp: new Date()
      });
    });
    
    // Обработчик необработанных промисов
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError({
        message: event.reason?.message || 'Unhandled promise rejection',
        type: 'promise',
        module: 'global',
        data: { reason: event.reason },
        timestamp: new Date()
      });
    });
  }
  
  /**
   * Обрабатывает ошибку
   * @param {ErrorInfo} errorInfo - Информация об ошибке
   */
  handleError(errorInfo) {
    this.errors.push(errorInfo);
    
    // Ограничение количества сохраняемых ошибок
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
    
    // Логирование в консоль
    console.error(`[${errorInfo.module}] ${errorInfo.message}`, errorInfo.data);
    
    // Уведомление слушателей
    this.listeners.forEach(listener => {
      try {
        listener(errorInfo);
      } catch (e) {
        console.error('Error in error listener:', e);
      }
    });
  }
  
  /**
   * Добавляет слушателя ошибок
   * @param {Function} listener - Функция-слушатель
   */
  addListener(listener) {
    this.listeners.push(listener);
  }
  
  /**
   * Удаляет слушателя ошибок
   * @param {Function} listener - Функция-слушатель
   */
  removeListener(listener) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }
  
  /**
   * Получает все ошибки
   * @returns {Array.<ErrorInfo>} Массив ошибок
   */
  getErrors() {
    return [...this.errors];
  }
  
  /**
   * Очищает историю ошибок
   */
  clearErrors() {
    this.errors = [];
  }
}

// Глобальный экземпляр обработчика ошибок
export const errorHandler = new ErrorHandler();

/**
 * Валидирует DXF файл
 * @param {string} dxfContent - Содержимое DXF файла
 * @returns {ValidationResult} Результат валидации
 */
export function validateDXF(dxfContent) {
  const result = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  if (!dxfContent || typeof dxfContent !== 'string') {
    result.isValid = false;
    result.errors.push('DXF файл пуст или имеет неверный формат');
    return result;
  }
  
  if (dxfContent.length > 10 * 1024 * 1024) { // 10MB
    result.warnings.push('DXF файл очень большой, может работать медленно');
  }
  
  const lines = dxfContent.split(/\r?\n/);
  if (lines.length < 10) {
    result.isValid = false;
    result.errors.push('DXF файл слишком короткий');
    return result;
  }
  
  // Проверка наличия обязательных секций
  const hasEntities = lines.some(line => line.trim().toUpperCase() === 'ENTITIES');
  if (!hasEntities) {
    result.warnings.push('DXF файл не содержит секцию ENTITIES');
  }
  
  const hasEOF = lines.some(line => line.trim().toUpperCase() === 'EOF');
  if (!hasEOF) {
    result.warnings.push('DXF файл не содержит маркер конца файла (EOF)');
  }
  
  return result;
}

/**
 * Валидирует параметры резки
 * @param {Object} params - Параметры резки
 * @returns {ValidationResult} Результат валидации
 */
export function validateCuttingParams(params) {
  const result = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  const { power, thickness, gas, material } = params;
  
  // Проверка мощности
  if (typeof power !== 'number' || !isFinite(power) || power <= 0) {
    result.isValid = false;
    result.errors.push('Мощность лазера должна быть положительным числом');
  } else if (power > 10) {
    result.warnings.push('Мощность лазера очень высокая');
  }
  
  // Проверка толщины
  if (typeof thickness !== 'number' || !isFinite(thickness) || thickness <= 0) {
    result.isValid = false;
    result.errors.push('Толщина материала должна быть положительным числом');
  } else if (thickness > 50) {
    result.warnings.push('Толщина материала очень большая');
  }
  
  // Проверка газа
  const validGases = ['oxygen', 'nitrogen', 'air'];
  if (!validGases.includes(gas)) {
    result.isValid = false;
    result.errors.push(`Неподдерживаемый тип газа: ${gas}`);
  }
  
  // Проверка материала
  if (material && typeof material !== 'string') {
    result.warnings.push('Тип материала должен быть строкой');
  }
  
  return result;
}

/**
 * Валидирует параметры раскладки
 * @param {Object} params - Параметры раскладки
 * @returns {ValidationResult} Результат валидации
 */
export function validateNestingParams(params) {
  const result = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  const { sheetWidth, sheetHeight, partWidth, partHeight, quantity, margin, gap } = params;
  
  // Проверка размеров листа
  if (typeof sheetWidth !== 'number' || !isFinite(sheetWidth) || sheetWidth <= 0) {
    result.isValid = false;
    result.errors.push('Ширина листа должна быть положительным числом');
  }
  
  if (typeof sheetHeight !== 'number' || !isFinite(sheetHeight) || sheetHeight <= 0) {
    result.isValid = false;
    result.errors.push('Высота листа должна быть положительным числом');
  }
  
  // Проверка размеров детали
  if (typeof partWidth !== 'number' || !isFinite(partWidth) || partWidth <= 0) {
    result.isValid = false;
    result.errors.push('Ширина детали должна быть положительным числом');
  }
  
  if (typeof partHeight !== 'number' || !isFinite(partHeight) || partHeight <= 0) {
    result.isValid = false;
    result.errors.push('Высота детали должна быть положительным числом');
  }
  
  // Проверка количества
  if (typeof quantity !== 'number' || !isFinite(quantity) || quantity < 0) {
    result.isValid = false;
    result.errors.push('Количество деталей должно быть неотрицательным числом');
  }
  
  // Проверка отступов
  if (typeof margin !== 'number' || !isFinite(margin) || margin < 0) {
    result.warnings.push('Отступ должен быть неотрицательным числом');
  }
  
  if (typeof gap !== 'number' || !isFinite(gap) || gap < 0) {
    result.warnings.push('Зазор должен быть неотрицательным числом');
  }
  
  // Проверка логики
  if (partWidth > sheetWidth || partHeight > sheetHeight) {
    result.warnings.push('Деталь больше листа');
  }
  
  return result;
}

/**
 * Безопасное выполнение функции с обработкой ошибок
 * @param {Function} fn - Функция для выполнения
 * @param {string} module - Название модуля
 * @param {*} defaultValue - Значение по умолчанию при ошибке
 * @returns {*} Результат выполнения функции или значение по умолчанию
 */
export function safeExecute(fn, module, defaultValue = null) {
  try {
    return fn();
  } catch (error) {
    errorHandler.handleError({
      message: error.message,
      type: 'execution',
      module,
      data: { stack: error.stack },
      timestamp: new Date()
    });
    return defaultValue;
  }
}

/**
 * Асинхронное безопасное выполнение функции
 * @param {Function} fn - Асинхронная функция для выполнения
 * @param {string} module - Название модуля
 * @param {*} defaultValue - Значение по умолчанию при ошибке
 * @returns {Promise<*>} Результат выполнения функции или значение по умолчанию
 */
export async function safeExecuteAsync(fn, module, defaultValue = null) {
  try {
    return await fn();
  } catch (error) {
    errorHandler.handleError({
      message: error.message,
      type: 'async_execution',
      module,
      data: { stack: error.stack },
      timestamp: new Date()
    });
    return defaultValue;
  }
}

/**
 * Валидирует числовое значение
 * @param {*} value - Значение для валидации
 * @param {string} name - Название параметра
 * @param {Object} options - Опции валидации
 * @returns {ValidationResult} Результат валидации
 */
export function validateNumber(value, name, options = {}) {
  const result = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  const { min, max, required = true, allowZero = true } = options;
  
  if (value === undefined || value === null) {
    if (required) {
      result.isValid = false;
      result.errors.push(`${name} обязателен`);
    }
    return result;
  }
  
  if (typeof value !== 'number' || !isFinite(value)) {
    result.isValid = false;
    result.errors.push(`${name} должен быть числом`);
    return result;
  }
  
  if (!allowZero && value === 0) {
    result.isValid = false;
    result.errors.push(`${name} не может быть равен нулю`);
  }
  
  if (min !== undefined && value < min) {
    result.isValid = false;
    result.errors.push(`${name} должен быть не меньше ${min}`);
  }
  
  if (max !== undefined && value > max) {
    result.isValid = false;
    result.errors.push(`${name} должен быть не больше ${max}`);
  }
  
  return result;
}

/**
 * Валидирует строковое значение
 * @param {*} value - Значение для валидации
 * @param {string} name - Название параметра
 * @param {Object} options - Опции валидации
 * @returns {ValidationResult} Результат валидации
 */
export function validateString(value, name, options = {}) {
  const result = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  const { minLength, maxLength, required = true, allowedValues } = options;
  
  if (value === undefined || value === null || value === '') {
    if (required) {
      result.isValid = false;
      result.errors.push(`${name} обязателен`);
    }
    return result;
  }
  
  if (typeof value !== 'string') {
    result.isValid = false;
    result.errors.push(`${name} должен быть строкой`);
    return result;
  }
  
  if (minLength !== undefined && value.length < minLength) {
    result.isValid = false;
    result.errors.push(`${name} должен содержать минимум ${minLength} символов`);
  }
  
  if (maxLength !== undefined && value.length > maxLength) {
    result.isValid = false;
    result.errors.push(`${name} должен содержать максимум ${maxLength} символов`);
  }
  
  if (allowedValues && !allowedValues.includes(value)) {
    result.isValid = false;
    result.errors.push(`${name} должен быть одним из: ${allowedValues.join(', ')}`);
  }
  
  return result;
}

/**
 * Показывает уведомление об ошибке пользователю
 * @param {string} message - Сообщение об ошибке
 * @param {string} type - Тип уведомления ('error', 'warning', 'info')
 */
export function showNotification(message, type = 'error') {
  try {
    // Создание элемента уведомления
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-message">${message}</span>
        <button class="notification-close">&times;</button>
      </div>
    `;
    
    // Стили для уведомления
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#ff5c5c' : type === 'warning' ? '#ffcd3c' : '#2ecc71'};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 400px;
      font-family: system-ui, sans-serif;
      font-size: 14px;
    `;
    
    // Обработчик закрытия
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
      document.body.removeChild(notification);
    });
    
    // Автоматическое закрытие через 5 секунд
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 5000);
    
    document.body.appendChild(notification);
    
  } catch (error) {
    console.error('Ошибка при показе уведомления:', error);
    // Fallback: просто в консоль
    console.error(`[${type.toUpperCase()}] ${message}`);
  }
}

/**
 * Логирует информацию в консоль с меткой времени
 * @param {string} message - Сообщение для логирования
 * @param {string} level - Уровень логирования ('log', 'warn', 'error')
 * @param {Object} data - Дополнительные данные
 */
export function log(message, level = 'log', data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  switch (level) {
    case 'warn':
      console.warn(logMessage, data);
      break;
    case 'error':
      console.error(logMessage, data);
      break;
    default:
      console.log(logMessage, data);
  }
}
