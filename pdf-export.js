/**
 * PDF Export Module for DXF PRO with html2pdf.js support
 * Generates detailed reports with calculation data, part tables, and layout graphics
 * Full Cyrillic support via html2pdf.js
 */

let html2pdfLoaded = false;
let html2pdfScript = null;
let jsPDFLoaded = false;
let jsPDFScript = null;

/**
 * Preload html2pdf.js library for better performance
 * @returns {Promise<boolean>} True if preloaded successfully
 */
export async function preloadHtml2PDF() {
  try {
    console.log('Preloading html2pdf.js library...');
    const success = await ensureHtml2PDFLoaded();
    if (success) {
      console.log('html2pdf.js preloaded successfully');
    }
    return success;
  } catch (error) {
    console.warn('html2pdf.js preload failed:', error.message);
    return false;
  }
}

/**
 * Preload jsPDF library for better performance (fallback)
 * @returns {Promise<boolean>} True if preloaded successfully
 */
export async function preloadJsPDF() {
  try {
    console.log('Preloading jsPDF library...');
    const success = await ensureJsPDFLoaded();
    if (success) {
      console.log('jsPDF preloaded successfully');
    }
    return success;
  } catch (error) {
    console.warn('jsPDF preload failed:', error.message);
    return false;
  }
}

/**
 * Ensures html2pdf.js library is loaded
 * @returns {Promise<boolean>} True if loaded successfully
 */
async function ensureHtml2PDFLoaded() {
  if (html2pdfLoaded && isHtml2PDFAvailable()) {
    return true;
  }
  
  const cdnConfigs = [
    {
      url: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
      checkGlobal: () => window.html2pdf
    },
    {
      url: 'https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
      checkGlobal: () => window.html2pdf
    },
    {
      url: 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
      checkGlobal: () => window.html2pdf
    }
  ];
  
  console.log('Attempting to load html2pdf.js from CDNs...');
  
  for (let i = 0; i < cdnConfigs.length; i++) {
    const config = cdnConfigs[i];
    console.log(`Trying CDN ${i + 1}/${cdnConfigs.length}: ${config.url}`);
    
    try {
      await loadHtml2PDFFromUrl(config.url, config.checkGlobal);
      if (isHtml2PDFAvailable()) {
        html2pdfLoaded = true;
        console.log('html2pdf.js loaded and verified from:', config.url);
        return true;
      }
    } catch (error) {
      console.warn(`Failed to load html2pdf.js from ${config.url}:`, error.message);
      continue;
    }
  }
  
  console.error('All html2pdf.js CDN attempts failed');
  throw new Error('Не удалось загрузить библиотеку html2pdf.js. Проверьте соединение с интернетом.');
}

/**
 * Check if html2pdf.js is available and working
 * @returns {boolean}
 */
function isHtml2PDFAvailable() {
  try {
    return window.html2pdf && typeof window.html2pdf === 'function';
  } catch (error) {
    console.warn('Error checking html2pdf.js availability:', error);
    return false;
  }
}

/**
 * Load html2pdf.js from a specific URL
 * @param {string} url - CDN URL
 * @param {Function} checkGlobal - Function to check if library is available
 * @returns {Promise<void>}
 */
function loadHtml2PDFFromUrl(url, checkGlobal) {
  return new Promise((resolve, reject) => {
    if (html2pdfScript) {
      document.head.removeChild(html2pdfScript);
    }
    
    html2pdfScript = document.createElement('script');
    html2pdfScript.src = url;
    html2pdfScript.async = true;
    
    html2pdfScript.onload = () => {
      setTimeout(() => {
        if (checkGlobal()) {
          resolve();
        } else {
          reject(new Error('Library not found after loading'));
        }
      }, 200);
    };
    
    html2pdfScript.onerror = () => {
      reject(new Error(`Failed to load from ${url}`));
    };
    
    document.head.appendChild(html2pdfScript);
  });
}

/**
 * Ensures jsPDF library is loaded
 * @returns {Promise<boolean>} True if loaded successfully
 */
async function ensureJsPDFLoaded() {
  if (jsPDFLoaded && isJsPDFAvailable()) {
    return true;
  }
  
  // Try jsPDF versions with better font support for Russian text
  const cdnConfigs = [
    // Try version known to work well with Unicode
    {
      url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      checkGlobal: () => window.jsPDF || (window.jspdf && window.jspdf.jsPDF)
    },
    // Fallback to another version with good Unicode support
    {
      url: 'https://cdn.jsdelivr.net/npm/jspdf@2.4.0/dist/jspdf.umd.min.js',
      checkGlobal: () => window.jsPDF || (window.jspdf && window.jspdf.jsPDF)
    },
    // Try newest version
    {
      url: 'https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js',
      checkGlobal: () => window.jsPDF || (window.jspdf && window.jspdf.jsPDF)
    }
  ];
  
  console.log('Attempting to load jsPDF from CDNs...');
  
  for (let i = 0; i < cdnConfigs.length; i++) {
    const config = cdnConfigs[i];
    console.log(`Trying CDN ${i + 1}/${cdnConfigs.length}: ${config.url}`);
    
    try {
      await loadJsPDFFromUrl(config.url, config.checkGlobal);
      if (isJsPDFAvailable()) {
        jsPDFLoaded = true;
        console.log('jsPDF loaded and verified from:', config.url);
        return true;
      }
    } catch (error) {
      console.warn(`Failed to load jsPDF from ${config.url}:`, error.message);
      continue;
    }
  }
  
  console.error('All jsPDF CDN attempts failed');
  throw new Error('Не удалось загрузить библиотеку jsPDF ни с одного из CDN. Проверьте соединение с интернетом.');
}

/**
 * Check if jsPDF is available and working
 * @returns {boolean}
 */
function isJsPDFAvailable() {
  try {
    // Try different possible global locations
    if (window.jsPDF && typeof window.jsPDF === 'function') {
      return true;
    }
    
    if (window.jspdf && window.jspdf.jsPDF && typeof window.jspdf.jsPDF === 'function') {
      // Alias for convenience
      window.jsPDF = window.jspdf.jsPDF;
      return true;
    }
    
    // Check global scope
    if (typeof jsPDF !== 'undefined' && typeof jsPDF === 'function') {
      window.jsPDF = jsPDF;
      return true;
    }
    
    return false;
  } catch (error) {
    console.warn('Error checking jsPDF availability:', error);
    return false;
  }
}

/**
 * Loads jsPDF from a specific URL
 * @param {string} url - CDN URL to load from
 * @param {Function} checkGlobal - Function to check if jsPDF is available
 * @returns {Promise<void>}
 */
function loadJsPDFFromUrl(url, checkGlobal) {
  return new Promise((resolve, reject) => {
    // Quick check if already available
    if (isJsPDFAvailable()) {
      resolve();
      return;
    }
    
    // Remove existing script if any
    if (jsPDFScript) {
      try {
        document.head.removeChild(jsPDFScript);
        jsPDFScript = null;
      } catch (e) {
        // Script might have been removed already
      }
    }
    
    // Create new script element
    jsPDFScript = document.createElement('script');
    jsPDFScript.src = url;
    jsPDFScript.async = true;
    
    // Set timeout for loading
    const timeout = setTimeout(() => {
      reject(new Error('Timeout loading jsPDF'));
    }, 10000); // 10 second timeout
    
    jsPDFScript.onload = () => {
      clearTimeout(timeout);
      
      // Wait a bit for the script to initialize
      setTimeout(() => {
        if (checkGlobal()) {
          resolve();
        } else {
          reject(new Error('jsPDF not found after loading'));
        }
      }, 100);
    };
    
    jsPDFScript.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to load jsPDF from ${url}`));
    };
    
    // Add script to document
    document.head.appendChild(jsPDFScript);
  });
}

/**
 * Debug function to check jsPDF availability
 */
function debugJsPDFAvailability() {
  console.log('=== jsPDF Debug Info ===');
  console.log('window.jsPDF:', typeof window.jsPDF);
  console.log('window.jspdf:', typeof window.jspdf);
  console.log('window.jspdf?.jsPDF:', typeof window.jspdf?.jsPDF);
  console.log('jsPDFLoaded flag:', jsPDFLoaded);
  console.log('isJsPDFAvailable():', isJsPDFAvailable());
  console.log('========================');
}

/**
 * Get current file from state
 * @param {Object} state - Application state
 * @returns {Object|null} Current file object
 */
function getCurrentFile(state) {
  // For backward compatibility, try to construct file object from state
  if (state.parsed) {
    return {
      name: 'current_file.dxf',
      parsed: state.parsed,
      settings: {
        thickness: parseFloat(document.getElementById('th')?.value || '3'),
        power: document.getElementById('power')?.value || '1.5',
        gas: document.getElementById('gas')?.value || 'nitrogen'
      },
      calculatedCost: state.calculatedCost || null,
      quantity: 1
    };
  }
  return null;
}

/**
 * Create simple text report as fallback
 * @param {Object} state - Application state
 * @param {Object} layout - Layout data
 * @param {Array} files - Array of file objects
 */
function createSimpleFallbackReport(state, layout, files) {
  const reportLines = [];
  const now = new Date();
  
  reportLines.push('DXF PRO - Отчет по раскладке');
  reportLines.push(`Дата создания: ${now.toLocaleDateString('ru-RU')} ${now.toLocaleTimeString('ru-RU')}`);
  reportLines.push('');
  
  if (layout) {
    reportLines.push('Сводка по раскладке:');
    reportLines.push(`Количество листов: ${layout.sheets || layout.totalSheets || 1}`);
    if (layout.efficiency) {
      reportLines.push(`Эффективность: ${layout.efficiency.toFixed(1)}%`);
    }
    reportLines.push('');
  }
  
  if (files && files.length > 0) {
    reportLines.push('Данные по деталям:');
    files.forEach((file, index) => {
      if (file.parsed) {
        reportLines.push(`${index + 1}. ${file.name}`);
        reportLines.push(`   Длина реза: ${file.parsed.totalLen ? file.parsed.totalLen.toFixed(3) : '—'} м`);
        reportLines.push(`   Количество врезок: ${file.parsed.pierceCount || '—'}`);
        if (file.calculatedCost) {
          reportLines.push(`   Время на деталь: ${file.calculatedCost.timePerPart ? file.calculatedCost.timePerPart.toFixed(1) : '—'} мин`);
          reportLines.push(`   Стоимость детали: ${file.calculatedCost.costPerPart ? file.calculatedCost.costPerPart.toFixed(0) : '—'} ₽`);
        }
        reportLines.push('');
      }
    });
  }
  
  const reportText = reportLines.join('\n');
  const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DXF_PRO_Report_${now.getTime()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('Simple text report created and downloaded');
}

/**
 * Generates PDF report with calculation data and layout
 * @param {Object} state - Application state
 * @param {Object} layout - Layout data (nesting or combined)
 * @param {Array} files - Array of file objects for multi-file reports
 */
export async function generatePDFReport(state, layout, files = null) {
  try {
    console.log('Starting PDF generation...');
    
    // Debug jsPDF availability
    debugJsPDFAvailability();
    
    // Ensure jsPDF is loaded
    await ensureJsPDFLoaded();
    
    // Get jsPDF constructor with improved detection
    const PDFConstructor = getJsPDFConstructor();
    
    if (!PDFConstructor) {
      throw new Error('jsPDF constructor not found after loading');
    }
    
    console.log('Creating PDF instance with constructor:', typeof PDFConstructor);
    
    // Try to create PDF instance with error handling for different versions
    let pdf;
    try {
      // Create PDF with specific settings for better Unicode support
      pdf = new PDFConstructor({
        orientation: 'portrait',
        unit: 'px',
        format: 'a4',
        compress: true
      });
    } catch (constructorError) {
      console.warn('Standard constructor failed, trying alternative approaches:', constructorError);
      
      // Try different constructor patterns for different versions
      if (window.jsPDF && typeof window.jsPDF === 'function') {
        pdf = new window.jsPDF({
          orientation: 'portrait',
          unit: 'px',
          format: 'a4',
          compress: true
        });
      } else if (window.jspdf && window.jspdf.jsPDF) {
        pdf = new window.jspdf.jsPDF({
          orientation: 'portrait',
          unit: 'px',
          format: 'a4',
          compress: true
        });
      } else {
        throw new Error('No working jsPDF constructor found');
      }
    }
    
    // Verify PDF instance is valid
    if (!pdf || typeof pdf.text !== 'function') {
      throw new Error('jsPDF instance is invalid or missing required methods');
    }
    
    console.log('PDF instance created successfully, methods available:', 
      Object.getOwnPropertyNames(pdf).filter(name => typeof pdf[name] === 'function').slice(0, 10));
    
    // Configure PDF for better text compatibility
    setupPDFForCyrillic(pdf);
    
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    let yPos = 20;
    const lineHeight = 7;
    const margin = 20;
    const maxContentHeight = pageHeight - 40; // Reserve space at bottom
    
    // Header
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    addRussianText(pdf, 'DXF PRO - Отчет по раскладке', margin, yPos);
    yPos += lineHeight * 2;
    
    // Date and time
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    const now = new Date();
    addRussianText(pdf, `Дата создания: ${now.toLocaleDateString('ru-RU')} ${now.toLocaleTimeString('ru-RU')}`, margin, yPos);
    yPos += lineHeight * 2;
    
    // Check if we need a new page for summary
    if (yPos > maxContentHeight - 100) {
      pdf.addPage();
      yPos = 20;
    }
    
    // Summary section
    yPos = addSummarySection(pdf, layout, margin, yPos, lineHeight, maxContentHeight);
    
    // Parts table
    if (files && files.length > 1) {
      yPos = addMultiFilePartsTable(pdf, files, layout, margin, yPos, lineHeight, pageWidth, pageHeight);
    } else {
      const currentFile = files ? files[0] : getCurrentFile(state);
      yPos = addSingleFilePartsTable(pdf, currentFile, layout, margin, yPos, lineHeight, pageWidth, maxContentHeight);
    }
    
    // Layout graphics
    yPos = addLayoutGraphics(pdf, state, layout, margin, yPos, pageWidth, pageHeight, lineHeight, maxContentHeight);
    
    // Final summary
    addFinalSummary(pdf, layout, files, margin, yPos, lineHeight, maxContentHeight);
    
    // Download PDF
    const fileName = files && files.length > 1 
      ? `DXF_PRO_Report_${files.length}_files_${now.getTime()}.pdf`
      : `DXF_PRO_Report_${now.getTime()}.pdf`;
    
    console.log('Saving PDF file:', fileName);
    pdf.save(fileName);
    
    console.log('PDF generated and downloaded successfully');
    return true;
  } catch (error) {
    console.error('PDF generation error:', error);
    
    // As a last resort, try to create a simple text report
    try {
      console.log('PDF generation failed, creating text report as fallback...');
      createSimpleFallbackReport(state, layout, files);
      throw new Error(`PDF недоступен, создан текстовый отчет: ${error.message}`);
    } catch (fallbackError) {
      throw new Error(`Ошибка создания отчета: ${error.message}`);
    }
  }
}

/**
 * Setup PDF for better text compatibility with Russian characters
 * @param {Object} pdf - jsPDF instance
 */
function setupPDFForCyrillic(pdf) {
  try {
    // Set document properties
    pdf.setProperties({
      title: 'DXF PRO Report',
      subject: 'Layout Analysis Report',
      author: 'DXF PRO',
      creator: 'DXF PRO'
    });
    
    // Try to set encoding for better Unicode support
    try {
      pdf.setR2L(false); // Set right-to-left to false for Russian text
    } catch (e) {
      console.warn('Could not set R2L property:', e);
    }
    
    // Try to set language for better text handling
    try {
      if (pdf.setLanguage) {
        pdf.setLanguage('ru');
      }
    } catch (e) {
      console.warn('Could not set language:', e);
    }
    
    // Use standard font for maximum compatibility
    pdf.setFont('helvetica', 'normal');
    
    console.log('PDF configured for Russian text support');
  } catch (error) {
    console.warn('Could not configure PDF font settings:', error);
  }
}

/**
 * Add Russian text using UTF-8 encoding for actual Cyrillic characters
 * @param {Object} pdf - jsPDF instance
 * @param {string} text - Text to add
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {Object} options - Additional options
 */
function addRussianText(pdf, text, x, y, options = {}) {
  try {
    console.log(`🔤 Rendering Russian text: "${text}"`);
    
    // Try to use built-in font that supports Cyrillic
    const originalFont = pdf.getFont();
    console.log(`📝 Original font:`, originalFont);
    
    // Try different fonts that might support Cyrillic
    const fontsToTry = ['helvetica', 'times', 'courier'];
    let success = false;
    
    for (const font of fontsToTry) {
      try {
        console.log(`🎨 Trying font: ${font}`);
        pdf.setFont(font, 'normal');
        
        if (options.maxWidth) {
          // Handle text wrapping for long text
          const lines = pdf.splitTextToSize(text, options.maxWidth);
          if (options.maxLines && lines.length > options.maxLines) {
            lines.splice(options.maxLines - 1);
            lines[lines.length - 1] += '...';
          }
          
          lines.forEach((line, index) => {
            console.log(`📄 Rendering line ${index + 1}: "${line}"`);
            pdf.text(line, x, y + (index * (options.lineHeight || 7)));
          });
          
          success = true;
          console.log(`✅ Successfully rendered with font: ${font}`);
          break;
        } else {
          // Try to render the text
          console.log(`📄 Rendering text: "${text}"`);
          pdf.text(text, x, y);
          success = true;
          console.log(`✅ Successfully rendered with font: ${font}`);
          break;
        }
      } catch (fontError) {
        console.warn(`❌ Font ${font} failed for Russian text:`, fontError);
        continue;
      }
    }
    
    // Restore original font
    if (originalFont) {
      try {
        pdf.setFont(originalFont.fontName, originalFont.fontStyle);
      } catch (e) {
        // Fallback to helvetica
        pdf.setFont('helvetica', 'normal');
      }
    }
    
    if (success) {
      return options.lineHeight || 7;
    }
    
    // If all fonts failed, try transliteration as last resort
    console.warn('❌ All fonts failed for Russian text, using transliteration');
    const transliteratedText = transliterateToLatin(text);
    console.log(`🔄 Transliterated: "${text}" → "${transliteratedText}"`);
    
    if (options.maxWidth) {
      const lines = pdf.splitTextToSize(transliteratedText, options.maxWidth);
      if (options.maxLines && lines.length > options.maxLines) {
        lines.splice(options.maxLines - 1);
        lines[lines.length - 1] += '...';
      }
      
      lines.forEach((line, index) => {
        pdf.text(line, x, y + (index * (options.lineHeight || 7)));
      });
      
      return lines.length * (options.lineHeight || 7);
    } else {
      pdf.text(transliteratedText, x, y);
      return options.lineHeight || 7;
    }
    
  } catch (error) {
    console.warn('Text rendering failed completely:', error);
    // Ultimate fallback - just show what we can
    const safeText = text.replace(/[^\x00-\x7F]/g, '?');
    pdf.text(safeText, x, y);
    return options.lineHeight || 7;
  }
}

/**
 * Transliterate Russian text to Latin for fallback
 * @param {string} text - Russian text to transliterate
 * @returns {string} Transliterated text
 */
function transliterateToLatin(text) {
  const transliterationMap = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
    'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
    'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
    'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
    'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
  };
  
  return text.split('').map(char => transliterationMap[char] || char).join('');
}

/**
 * Add DXF file marker with proper icon support
 * @param {Object} pdf - jsPDF instance
 * @param {number} x - X position
 * @param {number} y - Y position
 * @returns {number} Width used
 */
function addDXFIcon(pdf, x, y) {
  try {
    // Use proper DXF icon instead of text marker
    pdf.setFontSize(8);
    pdf.setTextColor(70, 70, 70); // Dark gray
    pdf.setFont('helvetica', 'bold');
    
    // Simple document icon representation
    pdf.text('[DXF]', x, y);
    
    // Reset formatting
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    
    return 25; // Return width used for the icon
    
  } catch (error) {
    console.warn('Could not add DXF marker:', error);
    // Ultimate fallback
    try {
      pdf.setFontSize(8);
      pdf.text('[DXF]', x, y);
      pdf.setFontSize(10);
      return 25;
    } catch (fallbackError) {
      return 0;
    }
  }
}

/**
 * Get jsPDF constructor with improved detection
 * @returns {Function|null} jsPDF constructor or null if not found
 */
function getJsPDFConstructor() {
  // Try different possible locations and patterns
  const candidates = [
    () => window.jsPDF,
    () => window.jspdf && window.jspdf.jsPDF,
    () => typeof jsPDF !== 'undefined' ? jsPDF : null,
    () => window.jspdf,
    () => window.JSPDF
  ];
  
  for (const getCandidate of candidates) {
    try {
      const candidate = getCandidate();
      if (candidate && typeof candidate === 'function') {
        console.log('Found jsPDF constructor:', candidate.name || 'anonymous function');
        return candidate;
      }
    } catch (error) {
      // Continue to next candidate
      continue;
    }
  }
  
  console.error('No jsPDF constructor found in any expected location');
  return null;
}

function addSummarySection(pdf, layout, margin, yPos, lineHeight, maxContentHeight) {
  if (!layout) return yPos;
  
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  addRussianText(pdf, 'Сводка по раскладке:', margin, yPos);
  yPos += lineHeight;
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  
  const summaryData = [
    ['Количество листов:', String(layout.sheets || layout.totalSheets || 1)],
    ['Эффективность:', layout.efficiency ? `${layout.efficiency.toFixed(1)}%` : '—'],
    ['Размер листа:', `${layout.sheetWidth || 1250}x${layout.sheetHeight || 2500} мм`],
    ['Отступ:', `${layout.margin || 10} мм`],
    ['Зазор:', `${layout.gap || 2} мм`]
  ];
  
  summaryData.forEach(([label, value]) => {
    addRussianText(pdf, label, margin, yPos);
    addRussianText(pdf, value, margin + 80, yPos);
    yPos += lineHeight;
  });
  
  return yPos + lineHeight;
}

function addSingleFilePartsTable(pdf, file, layout, margin, yPos, lineHeight, pageWidth, maxContentHeight) {
  if (!file || !file.parsed) return yPos;
  
  // Check if we need a new page
  if (yPos > maxContentHeight - 150) {
    pdf.addPage();
    yPos = 20;
  }
  
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  addRussianText(pdf, 'Данные по детали:', margin, yPos);
  yPos += lineHeight * 1.5;
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  
  const partData = [
    ['Файл:', file.name],
    ['Длина реза:', file.parsed.totalLen ? `${file.parsed.totalLen.toFixed(3)} м` : '—'],
    ['Количество врезок:', String(file.parsed.pierceCount || '—')],
    ['Количество объектов:', String(file.parsed.entities ? file.parsed.entities.length : '—')],
    ['Толщина:', `${file.settings?.thickness || 3} мм`],
    ['Мощность лазера:', `${file.settings?.power || 1.5} кВт`],
    ['Тип газа:', file.settings?.gas || 'nitrogen']
  ];
  
  partData.forEach(([label, value]) => {
    addRussianText(pdf, label, margin, yPos);
    addRussianText(pdf, value, margin + 80, yPos);
    yPos += lineHeight;
  });
  
  if (file.calculatedCost) {
    yPos += lineHeight;
    addRussianText(pdf, 'Расчет стоимости:', margin, yPos);
    yPos += lineHeight;
    
    const costData = [
      ['Время на деталь:', `${file.calculatedCost.timePerPart ? file.calculatedCost.timePerPart.toFixed(1) : '—'} мин`],
      ['Стоимость детали:', `${file.calculatedCost.costPerPart ? file.calculatedCost.costPerPart.toFixed(0) : '—'} ₽`],
      ['Общее время:', `${file.calculatedCost.timeForAllParts ? file.calculatedCost.timeForAllParts.toFixed(1) : '—'} мин`],
      ['Общая стоимость:', `${file.calculatedCost.costForAllParts ? file.calculatedCost.costForAllParts.toFixed(0) : '—'} ₽`]
    ];
    
    costData.forEach(([label, value]) => {
      addRussianText(pdf, label, margin + 10, yPos);
      addRussianText(pdf, value, margin + 90, yPos);
      yPos += lineHeight;
    });
  }
  
    return yPos + lineHeight;
}

/**
 * Generate PDF report using html2pdf.js with full Cyrillic support
 * @param {Object} data - Report data
 * @param {string} filename - Output filename
 * @returns {Promise<void>}
 */
export async function generatePDFReportWithHtml2PDF(data, filename = 'dxf-pro-report.pdf') {
  try {
    console.log('Generating PDF report with html2pdf.js...');
    
    if (!isHtml2PDFAvailable()) {
      await ensureHtml2PDFLoaded();
    }
    
    // Create HTML content for the report
    const htmlContent = createReportHTML(data);
    
    // Create temporary container
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '-9999px';
    tempContainer.style.width = '800px';
    tempContainer.style.backgroundColor = 'white';
    tempContainer.style.color = 'black';
    tempContainer.style.fontFamily = 'Arial, sans-serif';
    tempContainer.style.padding = '20px';
    tempContainer.innerHTML = htmlContent;
    
    document.body.appendChild(tempContainer);
    
    // Configure html2pdf options
    const options = {
      margin: [10, 10, 10, 10],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2,
        useCORS: true,
        allowTaint: true
      },
      jsPDF: { 
        unit: 'mm', 
        format: 'a4', 
        orientation: 'portrait'
      }
    };
    
    // Generate PDF
    await window.html2pdf()
      .set(options)
      .from(tempContainer)
      .save();
    
    // Clean up
    document.body.removeChild(tempContainer);
    
    console.log('PDF report generated successfully with html2pdf.js');
    
  } catch (error) {
    console.error('Error generating PDF report with html2pdf.js:', error);
    throw new Error(`Ошибка генерации PDF с html2pdf.js: ${error.message}`);
  }
}

/**
 * Create HTML content for the report
 * @param {Object} data - Report data
 * @returns {string} HTML content
 */
function createReportHTML(data) {
  const { state, layout, files } = data;
  
  return `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <style>
            body {
                font-family: 'Arial', 'Helvetica', sans-serif;
                font-size: 12px;
                line-height: 1.4;
                color: #333;
                margin: 0;
                padding: 20px;
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
                border-bottom: 2px solid #3498db;
                padding-bottom: 15px;
            }
            .header h1 {
                color: #2c3e50;
                font-size: 24px;
                margin: 0 0 10px 0;
            }
            .header .subtitle {
                color: #7f8c8d;
                font-size: 14px;
            }
            .section {
                margin-bottom: 25px;
            }
            .section h2 {
                color: #34495e;
                font-size: 16px;
                margin: 0 0 15px 0;
                border-left: 4px solid #3498db;
                padding-left: 10px;
            }
            .data-table {
                width: 100%;
                border-collapse: collapse;
                margin: 10px 0;
            }
            .data-table th,
            .data-table td {
                border: 1px solid #ddd;
                padding: 8px 12px;
                text-align: left;
            }
            .data-table th {
                background-color: #f8f9fa;
                font-weight: bold;
            }
            .data-table tr:nth-child(even) {
                background-color: #f8f9fa;
            }
            .summary-item {
                display: flex;
                justify-content: space-between;
                margin: 5px 0;
                padding: 5px 0;
                border-bottom: 1px solid #ecf0f1;
            }
            .summary-label {
                font-weight: bold;
                color: #2c3e50;
            }
            .summary-value {
                color: #34495e;
            }
            .layout-info {
                background-color: #f8f9fa;
                padding: 15px;
                border-radius: 5px;
                margin: 10px 0;
            }
            .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 2px solid #bdc3c7;
                text-align: center;
                font-size: 10px;
                color: #7f8c8d;
            }
            .logo {
                font-size: 18px;
                font-weight: bold;
                color: #3498db;
                margin-bottom: 10px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="logo">DXF PRO</div>
            <h1>Отчет по раскладке</h1>
            <div class="subtitle">Система анализа раскладки DXF файлов</div>
        </div>
        
        ${createGeneralInfoSection(state, files)}
        ${createCalculationSection(files)}
        ${createLayoutSection(layout)}
        ${createSummarySection(layout, files)}
        
        <div class="footer">
            <strong>Отчет сгенерирован автоматически</strong><br>
            Дата: ${new Date().toLocaleDateString('ru-RU')} | 
            Время: ${new Date().toLocaleTimeString('ru-RU')}<br>
            Система анализа раскладки DXF PRO v1.0
        </div>
    </body>
    </html>
  `;
}

/**
 * Create general information section
 * @param {Object} state - Application state
 * @param {Array} files - Files data
 * @returns {string} HTML section
 */
function createGeneralInfoSection(state, files) {
  return `
    <div class="section">
        <h2>Общая информация</h2>
        <div class="data-table">
            <table>
                <tr>
                    <th>Параметр</th>
                    <th>Значение</th>
                </tr>
                <tr>
                    <td>Количество файлов</td>
                    <td>${files ? files.length : 0}</td>
                </tr>
                <tr>
                    <td>Дата создания</td>
                    <td>${new Date().toLocaleDateString('ru-RU')}</td>
                </tr>
                <tr>
                    <td>Время создания</td>
                    <td>${new Date().toLocaleTimeString('ru-RU')}</td>
                </tr>
                <tr>
                    <td>Версия программы</td>
                    <td>1.0.0</td>
                </tr>
            </table>
        </div>
    </div>
  `;
}

/**
 * Create calculation results section
 * @param {Array} files - Files data
 * @returns {string} HTML section
 */
function createCalculationSection(files) {
  if (!files || files.length === 0) {
    return `
      <div class="section">
        <h2>Результаты расчетов</h2>
        <p>Нет данных для отображения</p>
      </div>
    `;
  }
  
  const tableRows = files.map(file => {
    const cost = file.calculatedCost || {};
    const parsed = file.parsed || {};
    
    return `
      <tr>
        <td>${file.name || 'Неизвестный файл'}</td>
        <td>${(cost.timeForAllParts || 0).toFixed(1)} мин</td>
        <td>${(cost.costForAllParts || 0).toFixed(0)} ₽</td>
        <td>${(parsed.totalLen || 0).toFixed(3)} м</td>
        <td>${parsed.pierceCount || 0}</td>
      </tr>
    `;
  }).join('');
  
  return `
    <div class="section">
        <h2>Результаты расчетов</h2>
        <div class="data-table">
            <table>
                <tr>
                    <th>Файл</th>
                    <th>Время работ</th>
                    <th>Стоимость</th>
                    <th>Длина реза</th>
                    <th>Врезки</th>
                </tr>
                ${tableRows}
            </table>
        </div>
    </div>
  `;
}

/**
 * Create layout information section
 * @param {Object} layout - Layout data
 * @returns {string} HTML section
 */
function createLayoutSection(layout) {
  if (!layout) {
    return `
      <div class="section">
        <h2>Информация о раскладке</h2>
        <p>Данные о раскладке недоступны</p>
      </div>
    `;
  }
  
  return `
    <div class="section">
        <h2>Информация о раскладке</h2>
        <div class="layout-info">
            <div class="summary-item">
                <span class="summary-label">Размер листа:</span>
                <span class="summary-value">${layout.sheetWidth || 0} x ${layout.sheetHeight || 0} мм</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Количество листов:</span>
                <span class="summary-value">${layout.sheets || layout.totalSheets || 1}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Эффективность раскладки:</span>
                <span class="summary-value">${(layout.efficiency || 0).toFixed(1)}%</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Общая площадь:</span>
                <span class="summary-value">${((layout.sheetWidth || 0) * (layout.sheetHeight || 0) * (layout.sheets || 1) / 1000000).toFixed(2)} м²</span>
            </div>
        </div>
    </div>
  `;
}

/**
 * Create final summary section
 * @param {Object} layout - Layout data
 * @param {Array} files - Files data
 * @returns {string} HTML section
 */
function createSummarySection(layout, files) {
  let totalTime = 0;
  let totalCost = 0;
  let totalLength = 0;
  let totalPierces = 0;
  
  if (files && files.length > 0) {
    files.forEach(file => {
      if (file.calculatedCost) {
        totalTime += file.calculatedCost.timeForAllParts || 0;
        totalCost += file.calculatedCost.costForAllParts || 0;
      }
      if (file.parsed) {
        totalLength += file.parsed.totalLen || 0;
        totalPierces += file.parsed.pierceCount || 0;
      }
    });
  }
  
  return `
    <div class="section">
        <h2>Итоговая сводка</h2>
        <div class="data-table">
            <table>
                <tr>
                    <th>Параметр</th>
                    <th>Значение</th>
                </tr>
                <tr>
                    <td>Общее время работ</td>
                    <td>${totalTime.toFixed(1)} мин</td>
                </tr>
                <tr>
                    <td>Общая стоимость</td>
                    <td>${totalCost.toFixed(0)} ₽</td>
                </tr>
                <tr>
                    <td>Общая длина реза</td>
                    <td>${totalLength.toFixed(3)} м</td>
                </tr>
                <tr>
                    <td>Общее количество врезок</td>
                    <td>${totalPierces}</td>
                </tr>
                <tr>
                    <td>Количество листов</td>
                    <td>${layout?.sheets || layout?.totalSheets || 1}</td>
                </tr>
            </table>
        </div>
    </div>
  `;
}

function addMultiFilePartsTable(pdf, files, layout, margin, yPos, lineHeight, pageWidth, pageHeight) {
  if (!files || files.length === 0) return yPos;
  
  // Check if we need a new page
  if (yPos > pageHeight - 200) {
    pdf.addPage();
    yPos = 20;
  }
  
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  addRussianText(pdf, 'Детали в раскладке:', margin, yPos);
  yPos += lineHeight * 1.5;
  
  // Table headers
  const headers = ['Файл', 'Кол-во', 'Длина (м)', 'Врезки', 'Время (мин)', 'Стоимость (₽)'];
  const colWidths = [70, 30, 40, 30, 40, 50];
  
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  
  let xPos = margin;
  headers.forEach((header, i) => {
    addRussianText(pdf, header, xPos, yPos);
    xPos += colWidths[i];
  });
  
  yPos += lineHeight;
  pdf.line(margin, yPos - 2, pageWidth - margin, yPos - 2);
  
  yPos += 2;
  
  pdf.setFont('helvetica', 'normal');
  
  files.forEach(file => {
    if (!file.parsed) return;
    
    // Check if we need a new page
    if (yPos > pageHeight - 40) {
      pdf.addPage();
      yPos = 20;
      
      // Redraw headers on new page
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      xPos = margin;
      headers.forEach((header, i) => {
        addRussianText(pdf, header, xPos, yPos);
        xPos += colWidths[i];
      });
      yPos += lineHeight;
      pdf.line(margin, yPos - 2, pageWidth - margin, yPos - 2);
      yPos += 2;
      pdf.setFont('helvetica', 'normal');
    }
    
    xPos = margin;
    
    // Add DXF icon for filename
    const iconWidth = addDXFIcon(pdf, xPos, yPos);
    
    // Handle filename with proper truncation and multiline if needed
    let fileName = file.name;
    if (fileName.length > 25) {
      // Try to fit in two lines
      const words = fileName.split(/[._-]/);
      if (words.length > 1 && words[0].length + words[words.length - 1].length < 20) {
        fileName = words[0] + '...' + words[words.length - 1];
      } else {
        fileName = fileName.substring(0, 22) + '...';
      }
    }
    
    const rowData = [
      fileName,
      String(file.quantity || 1),
      file.parsed.totalLen ? file.parsed.totalLen.toFixed(2) : '—',
      String(file.parsed.pierceCount || '—'),
      file.calculatedCost?.timePerPart ? file.calculatedCost.timePerPart.toFixed(1) : '—',
      file.calculatedCost?.costPerPart ? file.calculatedCost.costPerPart.toFixed(0) : '—'
    ];
    
    rowData.forEach((data, i) => {
      if (i === 0) {
        // First column (filename) - add after icon
        addRussianText(pdf, data, xPos + iconWidth, yPos);
      } else {
        addRussianText(pdf, data, xPos, yPos);
      }
      xPos += colWidths[i];
    });
    yPos += lineHeight;
  });
  
  return yPos + lineHeight;
}

function addLayoutGraphics(pdf, state, layout, margin, yPos, pageWidth, pageHeight, lineHeight, maxContentHeight) {
  if (!layout) return yPos;
  
  // Check if we need a new page
  if (yPos > maxContentHeight - 100) {
    pdf.addPage();
    yPos = 20;
  }
  
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  addRussianText(pdf, 'Схема раскладки:', margin, yPos);
  yPos += lineHeight * 1.5;
  
  // Simple layout representation
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  
  const sheetWidth = layout.sheetWidth || 1250;
  const sheetHeight = layout.sheetHeight || 2500;
  const scale = Math.min(200 / sheetWidth, 150 / sheetHeight);
  
  const drawWidth = sheetWidth * scale;
  const drawHeight = sheetHeight * scale;
  const drawX = margin + 50;
  const drawY = yPos;
  
  // Draw sheet outline
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(1);
  pdf.rect(drawX, drawY, drawWidth, drawHeight);
  
  // Add sheet info
  addRussianText(pdf, `Лист ${layout.sheets || 1}: ${sheetWidth}x${sheetHeight} мм`, drawX + drawWidth + 10, drawY + 10);
  if (layout.efficiency) {
    addRussianText(pdf, `Эффективность: ${layout.efficiency.toFixed(1)}%`, drawX + drawWidth + 10, drawY + 25);
  }
  
  return yPos + drawHeight + 20;
}

function addFinalSummary(pdf, layout, files, margin, yPos, lineHeight, maxContentHeight) {
  // Check if we need a new page
  if (yPos > maxContentHeight - 100) {
    pdf.addPage();
    yPos = 20;
  }
  
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  addRussianText(pdf, 'Итоговая сводка:', margin, yPos);
  yPos += lineHeight * 1.5;
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  
  let totalTime = 0;
  let totalCost = 0;
  let totalLength = 0;
  let totalPierces = 0;
  
  if (files && files.length > 0) {
    files.forEach(file => {
      if (file.calculatedCost) {
        totalTime += file.calculatedCost.timeForAllParts || 0;
        totalCost += file.calculatedCost.costForAllParts || 0;
      }
      if (file.parsed) {
        totalLength += file.parsed.totalLen || 0;
        totalPierces += file.parsed.pierceCount || 0;
      }
    });
  }
  
  const summaryData = [
    ['Общее время работ:', `${totalTime.toFixed(1)} мин`],
    ['Общая стоимость:', `${totalCost.toFixed(0)} ₽`],
    ['Общая длина реза:', `${totalLength.toFixed(3)} м`],
    ['Общее количество врезок:', String(totalPierces)],
    ['Количество листов:', String(layout?.sheets || layout?.totalSheets || 1)]
  ];
  
  summaryData.forEach(([label, value]) => {
    addRussianText(pdf, label, margin, yPos);
    addRussianText(pdf, value, margin + 100, yPos);
    yPos += lineHeight;
  });
  
  return yPos + lineHeight;
} 