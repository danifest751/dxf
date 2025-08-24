/**
 * PDF Export Module for DXF PRO with html2pdf.js support
 * Generates detailed reports with calculation data, part tables, and layout graphics
 * Full Cyrillic support via html2pdf.js
 */

let html2pdfLoaded = false;
let html2pdfScript = null;

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
    // Check if html2pdf is available and has the required methods
    return window.html2pdf && typeof window.html2pdf === 'function' && window.html2pdf().set;
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
 * Generate PDF report using html2pdf.js with full Cyrillic support
 * @param {Object} data - Report data
 * @param {string} filename - Output filename
 * @returns {Promise<void>}
 */
export async function generatePDFReport(data, filename = 'dxf-pro-report.pdf') {
  try {
    console.log('Generating PDF report with html2pdf.js...');
    console.log('Report data:', data);
    
    if (!isHtml2PDFAvailable()) {
      console.log('html2pdf not available, loading...');
      await ensureHtml2PDFLoaded();
    }
    
    // Verify data structure
    if (!data) {
      throw new Error('No data provided for PDF generation');
    }
    
    const { state, layout, files } = data;
    console.log('Data structure - state:', !!state, 'layout:', !!layout, 'files:', !!files);
    
    // Create HTML content for the report
    const htmlContent = createReportHTML(data);
    console.log('HTML content created, length:', htmlContent.length);
    
    // Validate HTML content
    if (!htmlContent || htmlContent.length < 100) {
      console.warn('HTML content seems empty or incomplete');
    }
    
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
    
    // Log container content for debugging
    console.log('Container content length:', tempContainer.innerHTML.length);
    console.log('Container first 200 chars:', tempContainer.innerHTML.substring(0, 200));
    
    // Wait a bit for content to render
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Configure html2pdf options with willReadFrequently set to true to avoid warnings
    const options = {
      margin: [10, 10, 10, 10],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: true,
        willReadFrequently: true, // This fixes the Canvas2D warning
        onclone: function(clonedDoc) {
          console.log('Document cloned for PDF generation');
          // Ensure all styles are properly applied in the cloned document
          const clonedContainer = clonedDoc.querySelector('div');
          if (clonedContainer) {
            clonedContainer.style.position = 'relative';
            clonedContainer.style.left = '0';
            clonedContainer.style.top = '0';
          }
        }
      },
      jsPDF: { 
        unit: 'mm', 
        format: 'a4', 
        orientation: 'portrait'
      }
    };
    
    console.log('Starting PDF generation with html2pdf...');
    
    // Generate PDF
    const pdfWorker = window.html2pdf();
    console.log('pdfWorker created:', !!pdfWorker);
    
    if (!pdfWorker) {
      throw new Error('Failed to create html2pdf worker');
    }
    
    const workerWithSettings = pdfWorker.set(options);
    console.log('Worker with settings:', !!workerWithSettings);
    
    if (!workerWithSettings) {
      throw new Error('Failed to set options on html2pdf worker');
    }
    
    const workerWithSource = workerWithSettings.from(tempContainer);
    console.log('Worker with source:', !!workerWithSource);
    
    if (!workerWithSource) {
      throw new Error('Failed to set source on html2pdf worker');
    }
    
    // Use the promise-based approach for better error handling
    await new Promise((resolve, reject) => {
      workerWithSource
        .save()
        .then(() => {
          console.log('PDF saved successfully');
          resolve();
        })
        .catch((error) => {
          console.error('Error saving PDF:', error);
          reject(new Error(`Ошибка сохранения PDF: ${error.message}`));
        })
        .finally(() => {
          // Clean up
          document.body.removeChild(tempContainer);
        });
    });
    
    console.log('PDF report generated successfully');
    
  } catch (error) {
    console.error('Error generating PDF report:', error);
    throw new Error(`Ошибка генерации PDF: ${error.message}`);
  }
}

/**
 * Create HTML content for the report
 * @param {Object} data - Report data
 * @returns {string} HTML content
 */
function createReportHTML(data) {
  const { state, layout, files } = data;
  
  // Ensure we have valid data
  const validFiles = Array.isArray(files) ? files : [];
  const validLayout = layout || {};
  
  // Validate that we have meaningful data
  if (validFiles.length === 0 && !validLayout.sheets && !validLayout.totalSheets) {
    console.warn('Warning: Report data appears to be empty or incomplete');
  }
  
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
                background-color: white;
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
        
        ${createGeneralInfoSection(state, validFiles)}
        ${createCalculationSection(validFiles)}
        ${createLayoutSection(validLayout)}
        ${createSummarySection(validLayout, validFiles)}
        
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

/**
 * Generate simple PDF report (fallback)
 * @param {Object} data - Report data
 * @param {string} filename - Output filename
 * @returns {Promise<void>}
 */
export async function generateSimplePDFReport(data, filename = 'dxf-pro-simple-report.pdf') {
  try {
    console.log('Generating simple PDF report...');
    
    // Create simple HTML content
    const htmlContent = createSimpleReportHTML(data);
    
    // Create temporary container
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '-9999px';
    tempContainer.style.width = '600px';
    tempContainer.style.backgroundColor = 'white';
    tempContainer.style.color = 'black';
    tempContainer.style.fontFamily = 'Arial, sans-serif';
    tempContainer.style.padding = '15px';
    tempContainer.innerHTML = htmlContent;
    
    document.body.appendChild(tempContainer);
    
    // Wait a bit for content to render
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Configure html2pdf options for simple report with willReadFrequently set to true
    const options = {
      margin: [5, 5, 5, 5],
      filename: filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { 
        scale: 1.5,
        useCORS: true,
        logging: true,
        willReadFrequently: true, // This fixes the Canvas2D warning
        onclone: function(clonedDoc) {
          console.log('Document cloned for simple PDF generation');
          // Ensure all styles are properly applied in the cloned document
          const clonedContainer = clonedDoc.querySelector('div');
          if (clonedContainer) {
            clonedContainer.style.position = 'relative';
            clonedContainer.style.left = '0';
            clonedContainer.style.top = '0';
          }
        }
      },
      jsPDF: { 
        unit: 'mm', 
        format: 'a4', 
        orientation: 'portrait'
      }
    };
    
    // Generate PDF using promise-based approach
    await new Promise((resolve, reject) => {
      window.html2pdf()
        .set(options)
        .from(tempContainer)
        .save()
        .then(() => {
          console.log('Simple PDF saved successfully');
          resolve();
        })
        .catch((error) => {
          console.error('Error saving simple PDF:', error);
          reject(new Error(`Ошибка сохранения простого PDF: ${error.message}`));
        })
        .finally(() => {
          // Clean up
          document.body.removeChild(tempContainer);
        });
    });
    
    console.log('Simple PDF report generated successfully');
    
  } catch (error) {
    console.error('Error generating simple PDF report:', error);
    throw new Error(`Ошибка генерации простого PDF: ${error.message}`);
  }
}

/**
 * Create simple HTML content for the report
 * @param {Object} data - Report data
 * @returns {string} HTML content
 */
function createSimpleReportHTML(data) {
  const { state, layout, files } = data;
  
  let totalTime = 0;
  let totalCost = 0;
  
  if (files && files.length > 0) {
    files.forEach(file => {
      if (file.calculatedCost) {
        totalTime += file.calculatedCost.timeForAllParts || 0;
        totalCost += file.calculatedCost.costForAllParts || 0;
      }
    });
  }
  
  return `
    <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; background-color: white; padding: 20px;">
        <h1 style="color: #2c3e50; text-align: center; margin-bottom: 30px;">Отчет DXF PRO</h1>
        
        <div style="margin-bottom: 20px;">
            <h2 style="color: #34495e; border-bottom: 2px solid #3498db; padding-bottom: 5px;">Общая информация</h2>
            <p><strong>Количество файлов:</strong> ${files ? files.length : 0}</p>
            <p><strong>Дата:</strong> ${new Date().toLocaleDateString('ru-RU')}</p>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h2 style="color: #34495e; border-bottom: 2px solid #3498db; padding-bottom: 5px;">Результаты расчетов</h2>
            <p><strong>Общее время работ:</strong> ${totalTime.toFixed(1)} мин</p>
            <p><strong>Общая стоимость:</strong> ${totalCost.toFixed(0)} ₽</p>
            <p><strong>Количество листов:</strong> ${layout?.sheets || layout?.totalSheets || 1}</p>
            ${layout?.efficiency ? `<p><strong>Эффективность:</strong> ${layout.efficiency.toFixed(1)}%</p>` : ''}
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #bdc3c7; text-align: center; font-size: 12px; color: #7f8c8d;">
            <strong>DXF PRO - Система анализа раскладки</strong><br>
            ${new Date().toLocaleString('ru-RU')}
        </div>
    </div>
  `;
}