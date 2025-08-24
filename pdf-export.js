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
  if (jsPDFLoaded && window.jsPDF) {
    return true;
  }
  
  // List of CDN URLs to try
  const cdnUrls = [
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
  ];
  
  for (const url of cdnUrls) {
    try {
      await loadJsPDFFromUrl(url);
      if (window.jsPDF) {
        jsPDFLoaded = true;
        return true;
      }
    } catch (error) {
      console.warn(`Failed to load jsPDF from ${url}:`, error.message);
      continue;
    }
  }
  
  throw new Error('Не удалось загрузить библиотеку jsPDF ни с одного из CDN');
}

/**
 * Loads jsPDF from a specific URL
 * @param {string} url - CDN URL to load from
 * @returns {Promise<void>}
 */
function loadJsPDFFromUrl(url) {
  return new Promise((resolve, reject) => {
    // Check if already exists
    if (window.jsPDF) {
      resolve();
      return;
    }
    
    // Remove existing script if any
    if (jsPDFScript) {
      document.head.removeChild(jsPDFScript);
    }
    
    // Create new script
    jsPDFScript = document.createElement('script');
    jsPDFScript.src = url;
    jsPDFScript.crossOrigin = 'anonymous';
    
    // Set timeout for loading
    const timeout = setTimeout(() => {
      reject(new Error('Loading timeout'));
    }, 10000);
    
    jsPDFScript.onload = () => {
      clearTimeout(timeout);
      // Wait a bit for the library to initialize
      setTimeout(() => {
        if (window.jsPDF) {
          resolve();
        } else {
          reject(new Error('jsPDF не смог инициализироваться'));
        }
      }, 300);
    };
    
    jsPDFScript.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Ошибка загрузки скрипта'));
    };
    
    document.head.appendChild(jsPDFScript);
  });
}

/**
 * Generates PDF report with calculation data and layout
 * @param {Object} state - Application state
 * @param {Object} layout - Layout data (nesting or combined)
 * @param {Array} files - Array of file objects for multi-file reports
 */
export async function generatePDFReport(state, layout, files = null) {
  try {
    // Ensure jsPDF is loaded
    await ensureJsPDFLoaded();
    
    if (!window.jsPDF) {
      throw new Error('jsPDF library not available');
    }
    
    const pdf = new window.jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    let yPos = 20;
    const lineHeight = 7;
    const margin = 20;
    
    // Header
    pdf.setFontSize(18);
    pdf.setFont(undefined, 'bold');
    pdf.text('DXF PRO - Отчет по раскладке', margin, yPos);
    yPos += lineHeight * 2;
    
    // Date and time
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    const now = new Date();
    pdf.text(`Дата создания: ${now.toLocaleDateString('ru-RU')} ${now.toLocaleTimeString('ru-RU')}`, margin, yPos);
    yPos += lineHeight * 2;
    
    // Summary section
    yPos = addSummarySection(pdf, layout, margin, yPos, lineHeight);
    
    // Parts table
    if (files && files.length > 1) {
      yPos = addMultiFilePartsTable(pdf, files, layout, margin, yPos, lineHeight, pageWidth, pageHeight);
    } else {
      const currentFile = files ? files[0] : getCurrentFile(state);
      yPos = addSingleFilePartsTable(pdf, currentFile, layout, margin, yPos, lineHeight, pageWidth);
    }
    
    // Layout graphics
    yPos = addLayoutGraphics(pdf, state, layout, margin, yPos, pageWidth, pageHeight);
    
    // Final summary
    addFinalSummary(pdf, layout, files, margin, yPos, lineHeight);
    
    // Download PDF
    const fileName = files && files.length > 1 
      ? `DXF_PRO_Report_${files.length}_files_${now.getTime()}.pdf`
      : `DXF_PRO_Report_${now.getTime()}.pdf`;
    
    pdf.save(fileName);
    
    return true;
  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error(`Ошибка создания PDF: ${error.message}`);
  }
}

function addSummarySection(pdf, layout, margin, yPos, lineHeight) {
  pdf.setFontSize(14);
  pdf.setFont(undefined, 'bold');
  pdf.text('Сводка по раскладке', margin, yPos);
  yPos += lineHeight * 1.5;
  
  pdf.setFontSize(10);
  pdf.setFont(undefined, 'normal');
  
  const summaryData = [
    ['Количество листов:', layout.totalSheets || layout.sheets || '—'],
    ['Эффективность:', layout.efficiency ? `${layout.efficiency.toFixed(1)}%` : '—'],
    ['Размер листа:', `${document.getElementById('sW')?.value || '—'} x ${document.getElementById('sH')?.value || '—'} мм`],
    ['Отступ:', `${document.getElementById('margin')?.value || '—'} мм`],
    ['Зазор:', `${document.getElementById('spacing')?.value || '—'} мм`]
  ];
  
  summaryData.forEach(([label, value]) => {
    pdf.text(label, margin, yPos);
    pdf.text(String(value), margin + 80, yPos);
    yPos += lineHeight;
  });
  
  return yPos + lineHeight;
}

function addSingleFilePartsTable(pdf, file, layout, margin, yPos, lineHeight, pageWidth) {
  if (!file || !file.parsed) return yPos;
  
  pdf.setFontSize(14);
  pdf.setFont(undefined, 'bold');
  pdf.text('Данные по детали', margin, yPos);
  yPos += lineHeight * 1.5;
  
  pdf.setFontSize(10);
  pdf.setFont(undefined, 'normal');
  
  const tableData = [
    ['Файл:', file.name],
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
    pdf.text(label, margin, yPos);
    pdf.text(String(value), margin + 80, yPos);
    yPos += lineHeight;
  });
  
  return yPos + lineHeight;
}

function addMultiFilePartsTable(pdf, files, layout, margin, yPos, lineHeight, pageWidth, pageHeight) {
  pdf.setFontSize(14);
  pdf.setFont(undefined, 'bold');
  pdf.text('Детали в раскладке', margin, yPos);
  yPos += lineHeight * 1.5;
  
  pdf.setFontSize(8);
  pdf.setFont(undefined, 'normal');
  
  // Table headers
  const headers = ['Файл', 'Кол-во', 'Длина (м)', 'Врезки', 'Время (мин)', 'Стоимость (₽)'];
  const colWidths = [60, 20, 25, 20, 25, 30];
  let xPos = margin;
  
  pdf.setFont(undefined, 'bold');
  headers.forEach((header, i) => {
    pdf.text(header, xPos, yPos);
    xPos += colWidths[i];
  });
  yPos += lineHeight;
  
  // Draw line under headers
  pdf.line(margin, yPos - 2, pageWidth - margin, yPos - 2);
  yPos += 2;
  
  pdf.setFont(undefined, 'normal');
  
  files.forEach(file => {
    if (!file.parsed) return;
    
    xPos = margin;
    const rowData = [
      file.name.length > 15 ? file.name.substring(0, 12) + '...' : file.name,
      String(file.quantity || 1),
      file.parsed.totalLen ? file.parsed.totalLen.toFixed(2) : '—',
      String(file.parsed.pierceCount || '—'),
      file.calculatedCost?.timePerPart ? file.calculatedCost.timePerPart.toFixed(1) : '—',
      file.calculatedCost?.costPerPart ? file.calculatedCost.costPerPart.toFixed(0) : '—'
    ];
    
    rowData.forEach((data, i) => {
      pdf.text(data, xPos, yPos);
      xPos += colWidths[i];
    });
    yPos += lineHeight;
    
    // Check if we need a new page
    if (yPos > pageHeight - 40) {
      pdf.addPage();
      yPos = 20;
    }
  });
  
  return yPos + lineHeight;
}

function addLayoutGraphics(pdf, state, layout, margin, yPos, pageWidth, pageHeight) {
  // Check if we have enough space for graphics
  const availableHeight = pageHeight - yPos - 40;
  const graphicsHeight = Math.min(100, availableHeight);
  
  if (graphicsHeight < 50) {
    pdf.addPage();
    yPos = 20;
  }
  
  pdf.setFontSize(14);
  pdf.setFont(undefined, 'bold');
  pdf.text('Схема раскладки', margin, yPos);
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
  pdf.text(sheetInfo, margin + 5, yPos + 10);
  
  // Draw parts representation (simplified)
  if (layout.sheets || layout.totalSheets) {
    const sheetsCount = layout.totalSheets || layout.sheets || 1;
    pdf.text(`Листов: ${sheetsCount}`, margin + 5, yPos + 20);
    
    if (layout.efficiency) {
      pdf.text(`Эффективность: ${layout.efficiency.toFixed(1)}%`, margin + 5, yPos + 30);
    }
  }
  
  return yPos + rectHeight + lineHeight * 2;
}

function addFinalSummary(pdf, layout, files, margin, yPos, lineHeight) {
  pdf.setFontSize(14);
  pdf.setFont(undefined, 'bold');
  pdf.text('Итоговая сводка', margin, yPos);
  yPos += lineHeight * 1.5;
  
  pdf.setFontSize(10);
  pdf.setFont(undefined, 'normal');
  
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
    pdf.text(label, margin, yPos);
    pdf.text(value, margin + 100, yPos);
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