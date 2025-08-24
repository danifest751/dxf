/**
 * JPEG Export Module for DXF PRO
 * Exports layout images as JPEG files
 */

/**
 * Exports layout as JPEG image(s)
 * @param {Object} state - Application state
 * @param {HTMLCanvasElement} canvas - Canvas element with layout
 * @param {Object} layout - Layout data
 */
export function exportLayoutAsJPEG(state, canvas, layout) {
  try {
    if (!canvas || !layout) {
      throw new Error('Canvas или layout не найдены');
    }
    
    // Check if we have combined nesting (multiple sheets)
    if (state.combinedNesting && state.combinedNesting.sheets && state.combinedNesting.sheets.length > 1) {
      exportMultipleSheets(state, canvas, state.combinedNesting);
    } else {
      exportSingleSheet(canvas, layout);
    }
    
    return true;
  } catch (error) {
    console.error('JPEG export error:', error);
    throw new Error(`Ошибка экспорта JPEG: ${error.message}`);
  }
}

/**
 * Export single sheet layout
 */
function exportSingleSheet(canvas, layout) {
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  
  // Set high resolution for better quality
  const scale = 2;
  tempCanvas.width = canvas.width * scale;
  tempCanvas.height = canvas.height * scale;
  tempCtx.scale(scale, scale);
  
  // White background
  tempCtx.fillStyle = '#ffffff';
  tempCtx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Copy canvas content
  tempCtx.drawImage(canvas, 0, 0);
  
  // Add title and info
  addLayoutInfo(tempCtx, layout, canvas.width, canvas.height);
  
  // Convert to JPEG and download
  tempCanvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DXF_PRO_Layout_${new Date().getTime()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 'image/jpeg', 0.9);
}

/**
 * Export multiple sheets as separate JPEG files
 */
function exportMultipleSheets(state, canvas, combinedLayout) {
  const { sheets } = combinedLayout;
  const sheetW = +document.getElementById('sW').value;
  const sheetH = +document.getElementById('sH').value;
  
  sheets.forEach((sheet, index) => {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    // Set canvas size
    const scale = 2;
    const canvasWidth = Math.max(800, sheetW * 0.3);
    const canvasHeight = Math.max(600, sheetH * 0.3);
    
    tempCanvas.width = canvasWidth * scale;
    tempCanvas.height = canvasHeight * scale;
    tempCtx.scale(scale, scale);
    
    // White background
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw sheet
    drawSingleSheet(tempCtx, sheet, sheetW, sheetH, canvasWidth, canvasHeight, index + 1);
    
    // Convert to JPEG and download
    tempCanvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DXF_PRO_Layout_Sheet_${index + 1}_${new Date().getTime()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.9);
  });
}

/**
 * Draw single sheet with parts
 */
function drawSingleSheet(ctx, sheet, sheetW, sheetH, canvasWidth, canvasHeight, sheetNumber) {
  const margin = 40;
  const availableWidth = canvasWidth - 2 * margin;
  const availableHeight = canvasHeight - 2 * margin - 60; // Reserve space for info
  
  // Calculate scale to fit sheet
  const scaleX = availableWidth / sheetW;
  const scaleY = availableHeight / sheetH;
  const scale = Math.min(scaleX, scaleY);
  
  const scaledW = sheetW * scale;
  const scaledH = sheetH * scale;
  
  // Center the sheet
  const startX = (canvasWidth - scaledW) / 2;
  const startY = margin + 30;
  
  // Draw sheet outline
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.rect(startX, startY, scaledW, scaledH);
  ctx.stroke();
  
  // Draw sheet margin
  const marginSize = 10 * scale; // 10mm margin
  ctx.strokeStyle = '#999999';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.rect(startX + marginSize, startY + marginSize, scaledW - 2 * marginSize, scaledH - 2 * marginSize);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw parts
  ctx.fillStyle = '#3b82f6';
  ctx.strokeStyle = '#1e40af';
  ctx.lineWidth = 1;
  
  sheet.parts.forEach(part => {
    const partX = startX + part.x * scale;
    const partY = startY + part.y * scale;
    const partW = part.placedWidth * scale;
    const partH = part.placedHeight * scale;
    
    ctx.fillRect(partX, partY, partW, partH);
    ctx.strokeRect(partX, partY, partW, partH);
    
    // Add part label if space allows
    if (partW > 30 && partH > 20) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      const label = part.file ? part.file.name.substring(0, 8) : 'Деталь';
      ctx.fillText(label, partX + partW / 2, partY + partH / 2 + 3);
      ctx.fillStyle = '#3b82f6';
    }
  });
  
  // Add title
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`DXF PRO - Лист ${sheetNumber}`, canvasWidth / 2, 20);
  
  // Add sheet info
  ctx.font = '12px Arial';
  ctx.textAlign = 'left';
  const infoY = startY + scaledH + 20;
  ctx.fillText(`Размер листа: ${sheetW} x ${sheetH} мм`, startX, infoY);
  ctx.fillText(`Деталей на листе: ${sheet.parts.length}`, startX, infoY + 15);
  
  // Calculate efficiency for this sheet
  const usedArea = sheet.parts.reduce((sum, part) => sum + (part.placedWidth * part.placedHeight), 0);
  const totalArea = sheetW * sheetH;
  const efficiency = (usedArea / totalArea * 100).toFixed(1);
  ctx.fillText(`Эффективность: ${efficiency}%`, startX, infoY + 30);
}

/**
 * Add layout information to canvas
 */
function addLayoutInfo(ctx, layout, canvasWidth, canvasHeight) {
  // Add title
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('DXF PRO - Раскладка', canvasWidth / 2, 20);
  
  // Add layout stats at bottom
  ctx.font = '12px Arial';
  ctx.textAlign = 'left';
  const infoY = canvasHeight - 40;
  
  let infoText = '';
  if (layout.sheets !== undefined) {
    infoText += `Листов: ${layout.sheets} `;
  }
  if (layout.totalSheets !== undefined) {
    infoText += `Листов: ${layout.totalSheets} `;
  }
  if (layout.efficiency !== undefined) {
    infoText += `Эффективность: ${layout.efficiency.toFixed(1)}% `;
  }
  
  const sheetW = document.getElementById('sW')?.value;
  const sheetH = document.getElementById('sH')?.value;
  if (sheetW && sheetH) {
    infoText += `Размер листа: ${sheetW}x${sheetH}мм`;
  }
  
  ctx.fillText(infoText, 10, infoY);
  
  // Add timestamp
  ctx.font = '10px Arial';
  ctx.textAlign = 'right';
  const now = new Date();
  ctx.fillText(
    `${now.toLocaleDateString('ru-RU')} ${now.toLocaleTimeString('ru-RU')}`,
    canvasWidth - 10,
    infoY
  );
}