// Configuration loader for DXF PRO application
// Loads default parameters from config.json on startup

let config = null;

// Default fallback configuration in case file loading fails
const defaultConfig = {
  cutting: {
    power: "1.5",
    gas: "nitrogen", 
    thickness: 3.0,
    cutSpeed: 2000,
    pierceTime: 1.5
  },
  pricing: {
    pricePerMeter: 100.0,
    pricePerPierce: 50.0,
    gasPricePerMinute: 15.0,
    machineHourPrice: 1200.0
  },
  sheet: {
    width: 1500,
    height: 3000,
    margin: 10,
    spacing: 5,
    quantity: 1
  },
  nesting: {
    rotations: "0,90"
  },
  ui: {
    defaultTab: "orig",
    canvasHeight: 600,
    showTooltips: true
  }
};

/**
 * Load configuration from config.json file
 * @returns {Promise<Object>} Configuration object
 */
export async function loadConfig() {
  try {
    console.log('Loading configuration from config.json...');
    const response = await fetch('./config.json');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    config = await response.json();
    console.log('Configuration loaded successfully:', config);
    return config;
  } catch (error) {
    console.warn('Failed to load config.json, using default configuration:', error);
    config = defaultConfig;
    return config;
  }
}

/**
 * Get current configuration
 * @returns {Object} Current configuration object
 */
export function getConfig() {
  return config || defaultConfig;
}

/**
 * Get a specific configuration value by path (e.g., 'cutting.power')
 * @param {string} path - Dot-separated path to configuration value
 * @param {*} fallback - Fallback value if path not found
 * @returns {*} Configuration value
 */
export function getConfigValue(path, fallback = null) {
  const cfg = getConfig();
  const keys = path.split('.');
  let value = cfg;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return fallback;
    }
  }
  
  return value;
}

/**
 * Apply configuration values to form elements
 * @param {Object} elements - Object with element selectors/references
 */
export function applyConfigToForm(elements) {
  const cfg = getConfig();
  
  try {
    // Apply cutting parameters
    if (elements.power) elements.power.value = cfg.cutting.power;
    if (elements.gas) elements.gas.value = cfg.cutting.gas;
    if (elements.thickness) {
      elements.thickness.value = cfg.cutting.thickness;
      if (elements.thicknessDisplay) {
        elements.thicknessDisplay.textContent = cfg.cutting.thickness;
      }
    }
    
    // Apply pricing parameters
    if (elements.pricePerMeter) elements.pricePerMeter.value = cfg.pricing.pricePerMeter;
    if (elements.pricePerPierce) elements.pricePerPierce.value = cfg.pricing.pricePerPierce;
    if (elements.gasPricePerMinute) elements.gasPricePerMinute.value = cfg.pricing.gasPricePerMinute;
    if (elements.machineHourPrice) elements.machineHourPrice.value = cfg.pricing.machineHourPrice;
    
    // Apply sheet parameters
    if (elements.sheetWidth) elements.sheetWidth.value = cfg.sheet.width;
    if (elements.sheetHeight) elements.sheetHeight.value = cfg.sheet.height;
    if (elements.margin) elements.margin.value = cfg.sheet.margin;
    if (elements.spacing) elements.spacing.value = cfg.sheet.spacing;
    if (elements.quantity) elements.quantity.value = cfg.sheet.quantity;
    
    // Apply nesting parameters
    if (elements.rotations) elements.rotations.value = cfg.nesting.rotations;
    
    console.log('Configuration applied to form elements successfully');
  } catch (error) {
    console.error('Error applying configuration to form:', error);
  }
}

/**
 * Save current form values back to configuration
 * This could be extended to save to localStorage or send to server
 * @param {Object} formValues - Current form values
 */
export function saveConfigFromForm(formValues) {
  try {
    // Update current config with form values
    if (config) {
      Object.assign(config.cutting, {
        power: formValues.power || config.cutting.power,
        gas: formValues.gas || config.cutting.gas,
        thickness: parseFloat(formValues.thickness) || config.cutting.thickness
      });
      
      Object.assign(config.pricing, {
        pricePerMeter: parseFloat(formValues.pricePerMeter) || config.pricing.pricePerMeter,
        pricePerPierce: parseFloat(formValues.pricePerPierce) || config.pricing.pricePerPierce,
        gasPricePerMinute: parseFloat(formValues.gasPricePerMinute) || config.pricing.gasPricePerMinute,
        machineHourPrice: parseFloat(formValues.machineHourPrice) || config.pricing.machineHourPrice
      });
      
      Object.assign(config.sheet, {
        width: parseInt(formValues.sheetWidth) || config.sheet.width,
        height: parseInt(formValues.sheetHeight) || config.sheet.height,
        margin: parseInt(formValues.margin) || config.sheet.margin,
        spacing: parseInt(formValues.spacing) || config.sheet.spacing,
        quantity: parseInt(formValues.quantity) || config.sheet.quantity
      });
      
      if (formValues.rotations) {
        config.nesting.rotations = formValues.rotations;
      }
    }
    
    // Save to localStorage for persistence
    localStorage.setItem('dxf-pro-config', JSON.stringify(config));
    console.log('Configuration saved to localStorage');
  } catch (error) {
    console.error('Error saving configuration:', error);
  }
}

/**
 * Load configuration from localStorage if available
 * @returns {Object|null} Saved configuration or null
 */
export function loadConfigFromStorage() {
  try {
    const saved = localStorage.getItem('dxf-pro-config');
    if (saved) {
      const savedConfig = JSON.parse(saved);
      console.log('Configuration loaded from localStorage:', savedConfig);
      return savedConfig;
    }
  } catch (error) {
    console.warn('Failed to load configuration from localStorage:', error);
  }
  return null;
}