/**
 * PDF Export Module for DXF PRO
 * Generates detailed reports with calculation data, part tables, and layout graphics
 */

// Global variable to track if jsPDF is loaded
let jsPDFLoaded = false;
let jsPDFScript = null;

/**
 * Preloads jsPDF library for better performance (optional)
 * Call this during application initialization
 * @returns {Promise<boolean>} True if loaded successfully
 */
export async function preloadJsPDF() {
  try {
    await ensureJsPDFLoaded();
    console.log('jsPDF preloaded successfully');
    return true;
  } catch (error) {
    console.warn('jsPDF preload failed:', error.message);
    return false;
  }
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
    // Try version with better Unicode support
    {
      url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      checkGlobal: () => window.jsPDF || (window.jspdf && window.jspdf.jsPDF)
    },
    // Fallback to another version
    {
      url: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
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
    jsPDFScript.crossOrigin = 'anonymous';
    
    // Set loading timeout
    const loadTimeout = setTimeout(() => {
      cleanup();
      reject(new Error('Script loading timeout'));
    }, 20000); // 20 second timeout
    
    function cleanup() {
      clearTimeout(loadTimeout);
      if (jsPDFScript && jsPDFScript.parentNode) {
        try {
          document.head.removeChild(jsPDFScript);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
    
    jsPDFScript.onload = () => {
      console.log(`Script loaded from ${url}, checking for jsPDF...`);
      
      // Start checking for jsPDF availability
      let checkAttempts = 0;
      const maxCheckAttempts = 15;
      
      const checkAvailability = () => {
        checkAttempts++;
        
        // Use the provided check function first
        if (checkGlobal && checkGlobal()) {
          cleanup();
          resolve();
          return;
        }
        
        // Fallback to our standard check
        if (isJsPDFAvailable()) {
          cleanup();
          resolve();
          return;
        }
        
        // Continue checking if we haven't reached max attempts
        if (checkAttempts < maxCheckAttempts) {
          setTimeout(checkAvailability, 300);
        } else {
          cleanup();
          reject(new Error('jsPDF не смог инициализироваться после загрузки'));
        }
      };
      
      // Start checking after a brief delay to allow initialization
      setTimeout(checkAvailability, 100);
    };
    
    jsPDFScript.onerror = () => {
      cleanup();
      reject(new Error('Ошибка загрузки скрипта'));
    };
    
    // Add script to document
    document.head.appendChild(jsPDFScript);
  });
}

/**
 * Debug function to check what jsPDF objects are available
 */
function debugJsPDFAvailability() {
  console.log('=== jsPDF Debug Info ===');
  console.log('window.jsPDF:', typeof window.jsPDF, window.jsPDF);
  console.log('window.jspdf:', typeof window.jspdf, window.jspdf);
  console.log('global jsPDF:', typeof jsPDF !== 'undefined' ? jsPDF : 'undefined');
  
  // Check for common global variables
  const globalVars = ['jsPDF', 'jspdf', 'JSPDF'];
  globalVars.forEach(varName => {
    if (window[varName]) {
      console.log(`window.${varName}:`, typeof window[varName], window[varName]);
    }
  });
  
  console.log('=== End Debug Info ===');
}

/**
 * Creates a simple text-based report as fallback when PDF generation fails
 */
function createSimpleFallbackReport(state, layout, files) {
  console.log('Creating simple text-based report as PDF fallback...');
  
  const reportLines = [];
  reportLines.push('DXF PRO - Отчет по раскладке');
  reportLines.push('='.repeat(50));
  reportLines.push('');
  reportLines.push(`Дата: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`);
  reportLines.push('');
  
  // Summary
  reportLines.push('Сводка:');
  reportLines.push(`Количество листов: ${layout.totalSheets || layout.sheets || '—'}`);
  reportLines.push(`Эффективность: ${layout.efficiency ? layout.efficiency.toFixed(1) + '%' : '—'}`);
  reportLines.push('');
  
  // Calculate totals if possible
  if (files && files.length > 0) {
    let totalTime = 0;
    let totalCost = 0;
    
    files.forEach(file => {
      if (file.calculatedCost) {
        totalTime += file.calculatedCost.timeForAllParts || 0;
        totalCost += file.calculatedCost.costForAllParts || 0;
      }
    });
    
    reportLines.push('Итоги:');
    reportLines.push(`Общее время: ${totalTime.toFixed(2)} мин`);
    reportLines.push(`Общая стоимость: ${totalCost.toFixed(2)} ₽`);
  }
  
  const reportText = reportLines.join('\n');
  
  // Download as text file since PDF generation failed
  const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `DXF_PRO_Report_${new Date().getTime()}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
    await ensureJsPDFAvailable();
    
    // Get jsPDF constructor with improved detection
    const PDFConstructor = getJsPDFConstructor();
    
    if (!PDFConstructor) {
      throw new Error('jsPDF constructor not found after loading');
    }
    
    console.log('Creating PDF instance with constructor:', typeof PDFConstructor);
    
    // Try to create PDF instance with error handling for different versions
    let pdf;
    try {
      pdf = new PDFConstructor();
    } catch (constructorError) {
      console.warn('Standard constructor failed, trying alternative approaches:', constructorError);
      
      // Try different constructor patterns for different versions
      if (window.jsPDF && typeof window.jsPDF === 'function') {
        pdf = new window.jsPDF();
      } else if (window.jspdf && window.jspdf.jsPDF) {
        pdf = new window.jspdf.jsPDF();
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
    // Use actual Russian text with UTF-8 encoding - no transliteration
    if (options.maxWidth) {
      // Handle text wrapping for long text
      const lines = pdf.splitTextToSize(text, options.maxWidth);
      if (options.maxLines && lines.length > options.maxLines) {
        lines.splice(options.maxLines - 1);
        lines[lines.length - 1] += '...';
      }
      
      lines.forEach((line, index) => {
        pdf.text(line, x, y + (index * (options.lineHeight || 7)));
      });
      
      return lines.length * (options.lineHeight || 7);
    } else {
      pdf.text(text, x, y);
      return options.lineHeight || 7;
    }
  } catch (error) {
    console.warn('Text rendering failed, using ASCII fallback:', error);
    // Last resort fallback to ASCII
    const asciiText = text.replace(/[^\x00-\x7F]/g, '?');
    pdf.text(asciiText, x, y);
    return options.lineHeight || 7;
  }
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
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  addRussianText(pdf, 'Сводка по раскладке', margin, yPos);
  yPos += lineHeight * 1.5;
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  
  const summaryData = [
    ['Количество листов:', layout.totalSheets || layout.sheets || '—'],
    ['Эффективность:', layout.efficiency ? `${layout.efficiency.toFixed(1)}%` : '—'],
    ['Размер листа:', `${document.getElementById('sW')?.value || '—'} x ${document.getElementById('sH')?.value || '—'} мм`],
    ['Отступ:', `${document.getElementById('margin')?.value || '—'} мм`],
    ['Зазор:', `${document.getElementById('spacing')?.value || '—'} мм`]
  ];
  
  summaryData.forEach(([label, value]) => {
    // Check if we need a new page
    if (yPos > maxContentHeight) {
      pdf.addPage();
      yPos = 20;
    }
    
    addRussianText(pdf, label, margin, yPos);
    addRussianText(pdf, String(value), margin + 80, yPos);
    yPos += lineHeight;
  });
  
  return yPos + lineHeight;
}

function addSingleFilePartsTable(pdf, file, layout, margin, yPos, lineHeight, pageWidth, maxContentHeight) {
  if (!file || !file.parsed) return yPos;
  
  // Check if we need a new page
  if (yPos > maxContentHeight - 120) {
    pdf.addPage();
    yPos = 20;
  }
  
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  addRussianText(pdf, 'Данные по детали', margin, yPos);
  yPos += lineHeight * 1.5;
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  
  // Handle filename with icon and multiline support
  const iconWidth = addDXFIcon(pdf, margin + 80, yPos);
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  
  addRussianText(pdf, 'Файл:', margin, yPos);
  const fileNameHeight = addRussianText(pdf, file.name, margin + 80 + iconWidth, yPos, {
    maxWidth: pageWidth - margin * 2 - 80 - iconWidth,
    maxLines: 2,
    lineHeight: lineHeight
  });
  yPos += Math.max(lineHeight, fileNameHeight);
  
  const tableData = [
    ['Длина реза:', `${file.parsed.totalLen?.toFixed(3) || '—'} м`],
    ['Количество врезок:', file.parsed.pierceCount || '—'],
    ['Количество объектов:', file.parsed.entities?.length || '—'],
    ['Толщина:', `${file.settings?.thickness || '—'} мм`],
    ['Мощность лазера:', `${file.settings?.power || '—'} кВт`],
    ['Тип газа:', file.settings?.gas || '—']
  ];
  
  // Add cost calculations if available
  if (file.calculatedCost) {
    tableData.push(
      ['Время на деталь:', `${file.calculatedCost.timePerPart?.toFixed(2) || '—'} мин`],
      ['Стоимость детали:', `${file.calculatedCost.costPerPart?.toFixed(2) || '—'} ₽`]
    );
  }
  
  tableData.forEach(([label, value]) => {
    // Check if we need a new page
    if (yPos > maxContentHeight) {
      pdf.addPage();
      yPos = 20;
    }
    
    addRussianText(pdf, label, margin, yPos);
    addRussianText(pdf, String(value), margin + 80, yPos);
    yPos += lineHeight;
  });
  
  return yPos + lineHeight;
}

function addMultiFilePartsTable(pdf, files, layout, margin, yPos, lineHeight, pageWidth, pageHeight) {
  // Check if we need a new page
  if (yPos > pageHeight - 150) {
    pdf.addPage();
    yPos = 20;
  }
  
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  addRussianText(pdf, 'Детали в раскладке', margin, yPos);
  yPos += lineHeight * 1.5;
  
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  
  // Table headers with Russian text
  const headers = ['Файл', 'Кол-во', 'Длина (м)', 'Врезки', 'Время (мин)', 'Стоимость (₽)'];
  const colWidths = [70, 20, 25, 20, 25, 30]; // Increased filename column width
  let xPos = margin;
  
  pdf.setFont('helvetica', 'bold');
  headers.forEach((header, i) => {
    addRussianText(pdf, header, xPos, yPos);
    xPos += colWidths[i];
  });
  yPos += lineHeight;
  
  // Draw line under headers
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
  // Check if we have enough space for graphics
  const availableHeight = maxContentHeight - yPos;
  const graphicsHeight = Math.min(100, availableHeight);
  
  if (graphicsHeight < 50) {
    pdf.addPage();
    yPos = 20;
  }
  
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  addRussianText(pdf, 'Схема раскладки', margin, yPos);
  yPos += lineHeight * 1.5;
  
  // Simplified layout representation
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.5);
  
  const rectWidth = pageWidth - 2 * margin;
  const rectHeight = 60;
  
  // Draw sheet outline
  pdf.rect(margin, yPos, rectWidth, rectHeight);
  
  // Add sheet info
  pdf.setFontSize(8);
  const sheetInfo = `Лист: ${document.getElementById('sW')?.value || '—'} x ${document.getElementById('sH')?.value || '—'} мм`;
  addRussianText(pdf, sheetInfo, margin + 5, yPos + 10);
  
  // Draw parts representation (simplified)
  if (layout.sheets || layout.totalSheets) {
    const sheetsCount = layout.totalSheets || layout.sheets || 1;
    addRussianText(pdf, `Листов: ${sheetsCount}`, margin + 5, yPos + 20);
    
    if (layout.efficiency) {
      addRussianText(pdf, `Эффективность: ${layout.efficiency.toFixed(1)}%`, margin + 5, yPos + 30);
    }
  }
  
  return yPos + rectHeight + lineHeight * 2;
}

function addFinalSummary(pdf, layout, files, margin, yPos, lineHeight, maxContentHeight) {
  // Check if we need a new page for final summary
  if (yPos > maxContentHeight - 80) {
    pdf.addPage();
    yPos = 20;
  }
  
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  addRussianText(pdf, 'Итоговая сводка', margin, yPos);
  yPos += lineHeight * 1.5;
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  
  // Calculate totals
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
        totalLength += (file.parsed.totalLen || 0) * (file.quantity || 1);
        totalPierces += (file.parsed.pierceCount || 0) * (file.quantity || 1);
      }
    });
  }
  
  const finalData = [
    ['Общее время работ:', `${totalTime.toFixed(2)} мин`],
    ['Общая стоимость:', `${totalCost.toFixed(2)} ₽`],
    ['Общая длина реза:', `${totalLength.toFixed(3)} м`],
    ['Общее количество врезок:', String(totalPierces)],
    ['Количество листов:', String(layout.totalSheets || layout.sheets || '—')]
  ];
  
  finalData.forEach(([label, value]) => {
    // Ensure we don't exceed page boundaries
    if (yPos > maxContentHeight) {
      pdf.addPage();
      yPos = 20;
      
      // Add header again if we're on a new page
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      addRussianText(pdf, 'Итоговая сводка (продолжение)', margin, yPos);
      yPos += lineHeight * 1.5;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
    }
    
    addRussianText(pdf, label, margin, yPos);
    addRussianText(pdf, value, margin + 100, yPos);
    yPos += lineHeight;
  });
}

function getCurrentFile(state) {
  return {
    name: 'Текущий файл',
    parsed: state.parsed,
    settings: {
      thickness: document.getElementById('th')?.value,
      power: document.getElementById('power')?.value,
      gas: document.getElementById('gas')?.value
    },
    calculatedCost: null
  };
}