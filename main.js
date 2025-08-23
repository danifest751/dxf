import { $, on, dpr, fmt, setStatus } from './utils.js';
import { calcCutParams } from './cost.js';
import { parseDXFMainThread, sanitizeParsed } from './parse.js';
import { initCanvasInteractions, buildPaths, drawEntities, fitView } from './render.js';
import { partBBox, computeNesting, drawNesting, makeNestingReport } from './nesting.js';
import { createAnnotatedDXF, createDXFWithMarkers, createSVG, createCSV, downloadText } from './annotate.js';
import { makeRunTests } from './tests.js';
import { loadConfig, applyConfigToForm, getConfig, loadConfigFromStorage } from './config-loader.js';
import { perfMonitor, measurePerformance } from './performance.js';

// Multi-file project state
const projectState = {
  files: [], // Array of file objects
  activeFileId: null,
  nextFileId: 1
};

// Legacy state for backward compatibility
const state={rawDXF:'', parsed:null, tab:'orig', pan:{x:0,y:0}, zoom:1, nesting:null, paths:[], piercePaths:[], index:null};
let cv = null;

// State synchronization validator
function validateStateSynchronization() {
  const warnings = [];
  
  // Check if active file state is synchronized with global state
  const activeFile = getActiveFile();
  if (activeFile) {
    if (activeFile.tab !== state.tab) {
      warnings.push('Tab state desynchronized');
    }
    if (JSON.stringify(activeFile.pan) !== JSON.stringify(state.pan)) {
      warnings.push('Pan state desynchronized');
    }
    if (activeFile.zoom !== state.zoom) {
      warnings.push('Zoom state desynchronized');
    }
  }
  
  // Check config-dependent calculations cache
  if (calculationCache.lastParams && state.parsed) {
    const currentParams = `${$('th')?.value}-${$('power')?.value}-${$('gas')?.value}`;
    if (!calculationCache.lastParams.includes(currentParams)) {
      console.log('Config change detected, invalidating calculation cache');
      calculationCache.lastParams = null;
      calculationCache.lastResult = null;
    }
  }
  
  if (warnings.length > 0) {
    console.warn('State synchronization warnings:', warnings);
  }
  
  return warnings.length === 0;
}

// File object structure
function createFileObject(file, content) {
  return {
    id: `file_${projectState.nextFileId++}`,
    name: file.name,
    originalName: file.name,
    rawDXF: content,
    parsed: null,
    paths: [],
    piercePaths: [],
    index: null,
    visible: true,
    quantity: 1,
    includeInLayout: true, // Whether to include in multi-file layout
    settings: {
      thickness: parseFloat($('th')?.value || '3'),
      power: $('power')?.value || '1.5',
      gas: $('gas')?.value || 'nitrogen'
    },
    calculations: null,
    nesting: null,
    tab: 'orig',
    pan: {x: 0, y: 0},
    zoom: 1
  };
}

// Get active file
function getActiveFile() {
  return projectState.files.find(f => f.id === projectState.activeFileId);
}

// Set active file and sync state
function setActiveFile(fileId) {
  const file = projectState.files.find(f => f.id === fileId);
  if (file) {
    // Save current state to active file
    const currentActive = getActiveFile();
    if (currentActive) {
      currentActive.tab = state.tab;
      currentActive.pan = {...state.pan};
      currentActive.zoom = state.zoom;
      currentActive.nesting = state.nesting;
    }
    
    // Load new active file state
    projectState.activeFileId = fileId;
    state.rawDXF = file.rawDXF;
    state.parsed = file.parsed;
    state.paths = file.paths;
    state.piercePaths = file.piercePaths;
    state.index = file.index;
    state.tab = file.tab;
    state.pan = {...file.pan};
    state.zoom = file.zoom;
    state.nesting = file.nesting;
    
    // Validate state synchronization
    validateStateSynchronization();
    
    // Update nesting cards if we have nesting data
    if (file.nesting) {
      updateNestingCards(file.nesting, file);
    }
    
    // Update UI
    updateActiveFileUI();
    updateCards();
    updateEmptyLayoutMessage();
    safeDraw();
  }
}

// Multi-file management functions
function updateFileNavigationButtons() {
  const prevBtn = $('prevFileBtn');
  const nextBtn = $('nextFileBtn');
  
  if (!prevBtn || !nextBtn || projectState.files.length <= 1) {
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }
  
  const currentIndex = projectState.files.findIndex(f => f.id === projectState.activeFileId);
  if (currentIndex === -1) {
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    return;
  }
  
  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex === projectState.files.length - 1;
}

function navigateToNextFile() {
  const currentIndex = projectState.files.findIndex(f => f.id === projectState.activeFileId);
  if (currentIndex === -1 || currentIndex >= projectState.files.length - 1) return;
  
  setActiveFile(projectState.files[currentIndex + 1].id);
}

function navigateToPrevFile() {
  const currentIndex = projectState.files.findIndex(f => f.id === projectState.activeFileId);
  if (currentIndex <= 0) return;
  
  setActiveFile(projectState.files[currentIndex - 1].id);
}

function performCombinedNesting(includedFiles) {
  const W = +$('sW').value;
  const H = +$('sH').value;
  const m = +$('margin').value;
  const g = +$('spacing').value;
  const rotStr = $('rotations').value;
  const rots = rotStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n));
  
  // Collect all parts from all files with their quantities
  const allParts = [];
  
  for (const file of includedFiles) {
    const box = partBBox(file.parsed);
    if (box.w <= 0 || box.h <= 0) continue;
    
    const quantity = file.quantity || 1;
    
    // Add each copy of the part
    for (let i = 0; i < quantity; i++) {
      allParts.push({
        file: file,
        width: box.w,
        height: box.h,
        partIndex: i,
        box: box
      });
    }
  }
  
  if (allParts.length === 0) {
    setStatus('Нет деталей для раскладки', 'err');
    return;
  }
  
  // Perform combined nesting using a simplified bin packing algorithm
  const combinedLayout = performBinPacking(allParts, W, H, m, g, rots);
  
  // Store the combined layout results
  state.combinedNesting = combinedLayout;
  state.nesting = null; // Clear single file nesting
  
  // Update UI with combined results
  updateCombinedNestingUI(combinedLayout, allParts);
}

function performBinPacking(parts, sheetW, sheetH, margin, spacing, rotations) {
  // Sort parts by area (largest first for better packing)
  const sortedParts = [...parts].sort((a, b) => (b.width * b.height) - (a.width * a.height));
  
  const sheets = [];
  const usableW = sheetW - 2 * margin;
  const usableH = sheetH - 2 * spacing;
  
  for (const part of sortedParts) {
    let placed = false;
    
    // Try to place in existing sheets first
    for (const sheet of sheets) {
      if (tryPlacePartInSheet(part, sheet, usableW, usableH, spacing, rotations)) {
        placed = true;
        break;
      }
    }
    
    // If not placed, create new sheet
    if (!placed) {
      const newSheet = {
        parts: [],
        occupiedAreas: []
      };
      
      if (tryPlacePartInSheet(part, newSheet, usableW, usableH, spacing, rotations)) {
        sheets.push(newSheet);
      }
    }
  }
  
  return {
    sheets: sheets,
    totalSheets: sheets.length,
    totalParts: parts.length,
    efficiency: calculatePackingEfficiency(sheets, sheetW, sheetH)
  };
}

function tryPlacePartInSheet(part, sheet, maxW, maxH, spacing, rotations) {
  const orientations = [];
  
  // Try different rotations
  for (const rot of rotations) {
    if (rot === 0 || rot === 180) {
      orientations.push({ w: part.width, h: part.height, rotation: rot });
    } else if (rot === 90 || rot === 270) {
      orientations.push({ w: part.height, h: part.width, rotation: rot });
    }
  }
  
  // Try to find a position for each orientation
  for (const orientation of orientations) {
    const position = findPositionInSheet(orientation.w, orientation.h, sheet, maxW, maxH, spacing);
    
    if (position) {
      // Place the part
      const placedPart = {
        ...part,
        x: position.x,
        y: position.y,
        placedWidth: orientation.w,
        placedHeight: orientation.h,
        rotation: orientation.rotation
      };
      
      sheet.parts.push(placedPart);
      sheet.occupiedAreas.push({
        x: position.x,
        y: position.y,
        w: orientation.w + spacing,
        h: orientation.h + spacing
      });
      
      return true;
    }
  }
  
  return false;
}

function findPositionInSheet(partW, partH, sheet, maxW, maxH, spacing) {
  // Simple bottom-left placement algorithm
  const step = 10; // Grid step for positioning
  
  for (let y = 0; y <= maxH - partH; y += step) {
    for (let x = 0; x <= maxW - partW; x += step) {
      if (isPositionFree(x, y, partW, partH, sheet.occupiedAreas, spacing)) {
        return { x, y };
      }
    }
  }
  
  return null;
}

function isPositionFree(x, y, w, h, occupiedAreas, spacing) {
  const testArea = {
    x: x,
    y: y,
    w: w + spacing,
    h: h + spacing
  };
  
  for (const occupied of occupiedAreas) {
    if (rectanglesOverlap(testArea, occupied)) {
      return false;
    }
  }
  
  return true;
}

function rectanglesOverlap(rect1, rect2) {
  return !(rect1.x + rect1.w <= rect2.x || 
           rect2.x + rect2.w <= rect1.x || 
           rect1.y + rect1.h <= rect2.y || 
           rect2.y + rect2.h <= rect1.y);
}

function calculatePackingEfficiency(sheets, sheetW, sheetH) {
  if (sheets.length === 0) return 0;
  
  let totalUsedArea = 0;
  for (const sheet of sheets) {
    for (const part of sheet.parts) {
      totalUsedArea += part.placedWidth * part.placedHeight;
    }
  }
  
  const totalSheetArea = sheets.length * sheetW * sheetH;
  return (totalUsedArea / totalSheetArea) * 100;
}

function updateCombinedNestingUI(layout, allParts) {
  const nestCard = document.getElementById('nestCard');
  if (!nestCard) return;
  
  nestCard.hidden = false;
  
  // Count unique files
  const uniqueFiles = new Set(allParts.map(part => part.file.id));
  
  // Calculate combined totals for all parts
  let totalCutLength = 0;
  let totalPierces = 0;
  let totalObjects = 0;
  
  // Group parts by file for calculation
  const fileGroups = {};
  for (const part of allParts) {
    const fileId = part.file.id;
    if (!fileGroups[fileId]) {
      fileGroups[fileId] = {
        file: part.file,
        count: 0
      };
    }
    fileGroups[fileId].count++;
  }
  
  // Calculate totals from all file groups
  for (const group of Object.values(fileGroups)) {
    const file = group.file;
    if (file.parsed) {
      if (file.parsed.totalLen) {
        totalCutLength += file.parsed.totalLen * group.count;
      }
      if (file.parsed.pierceCount) {
        totalPierces += file.parsed.pierceCount * group.count;
      }
      if (file.parsed.entities) {
        totalObjects += file.parsed.entities.length * group.count;
      }
    }
  }
  
  // Update total geometry summary
  $('nTotalCutLength').textContent = totalCutLength > 0 ? totalCutLength.toFixed(3) + ' м' : '—';
  $('nTotalPierces').textContent = totalPierces > 0 ? totalPierces : '—';
  $('nTotalObjects').textContent = totalObjects > 0 ? totalObjects : '—';
  
  // Update unified card elements
  $('nTotalFiles').textContent = uniqueFiles.size;
  $('nTotalParts').textContent = allParts.length;
  $('nPlaced').textContent = allParts.length;
  $('nSheets').textContent = layout.totalSheets;
  $('nEff').textContent = layout.efficiency.toFixed(1) + '%';
  
  // Calculate combined time and cost with debug logging
  let totalTime = 0;
  let totalCost = 0;
  
  console.log('Starting combined cost calculation for', Object.keys(fileGroups).length, 'file groups');
  
  // Calculate time and cost for each file group
  for (const group of Object.values(fileGroups)) {
    const file = group.file;
    if (file.parsed && file.parsed.totalLen && file.parsed.pierceCount) {
      const th = file.settings.thickness;
      const power = file.settings.power;
      const gas = file.settings.gas;
      
      console.log('Processing file:', file.name, 'with settings:', { th, power, gas, count: group.count });
      
      const {can, speed, pierce, gasCons} = calcCutParams(power, th, gas);
      
      if (can) {
        const cutMinPerPart = (file.parsed.totalLen * 1000) / speed;
        const pierceMinPerPart = (file.parsed.pierceCount * pierce) / 60;
        const totalMinPerPart = cutMinPerPart + pierceMinPerPart;
        const timeForAllParts = totalMinPerPart * group.count;
        
        const perM = parseFloat($('pPerM').value) || 100;
        const perPierce = parseFloat($('pPierce').value) || 50;
        const gasRubPerMin = parseFloat($('gasPrice').value) || 15;
        const machRubPerHr = parseFloat($('machPrice').value) || 500;
        
        console.log('Pricing values:', { perM, perPierce, gasRubPerMin, machRubPerHr });
        
        const cutRubPerPart = perM * file.parsed.totalLen;
        const pierceRubPerPart = perPierce * file.parsed.pierceCount;
        const gasRubPerPart = gasRubPerMin * totalMinPerPart * (gasCons ? gasCons/4 : 1);
        const machRubPerPart = (machRubPerHr/60) * totalMinPerPart;
        const totalRubPerPart = cutRubPerPart + pierceRubPerPart + gasRubPerPart + machRubPerPart;
        const costForAllParts = totalRubPerPart * group.count;
        
        console.log('Calculation for', file.name, ':', {
          cutMinPerPart,
          pierceMinPerPart,
          totalMinPerPart,
          timeForAllParts,
          cutRubPerPart,
          pierceRubPerPart,
          gasRubPerPart,
          machRubPerPart,
          totalRubPerPart,
          costForAllParts
        });
        
        totalTime += timeForAllParts;
        totalCost += costForAllParts;
        
        // Store calculated values for reference
        file.calculatedCost = {
          costPerPart: totalRubPerPart,
          costForAllParts,
          timePerPart: totalMinPerPart,
          timeForAllParts
        };
      } else {
        console.warn('Cannot calculate for file:', file.name, '- Can:', can);
      }
    } else {
      console.warn('Skipping file without required data:', file.name);
    }
  }
  
  console.log('Final calculation results:', { totalTime, totalCost });
  
  // Calculate average time per sheet and safely update UI
  const avgTimePerSheet = layout.totalSheets > 0 ? totalTime / layout.totalSheets : 0;
  const avgCostPerSheet = layout.totalSheets > 0 ? totalCost / layout.totalSheets : 0;
  
  console.log('Final display values:', { 
    avgTimePerSheet, 
    avgCostPerSheet, 
    totalTime, 
    totalCost, 
    sheets: layout.totalSheets 
  });

  // Ensure these values are displayed in the UI with error checking
  try {
    if (!isNaN(avgTimePerSheet) && isFinite(avgTimePerSheet)) {
      $('nTime').textContent = avgTimePerSheet.toFixed(2) + ' мин';
    } else {
      $('nTime').textContent = '0.00 мин';
      console.error('Invalid avgTimePerSheet:', avgTimePerSheet);
    }
    
    if (!isNaN(totalTime) && isFinite(totalTime)) {
      $('nTotalTime').textContent = totalTime.toFixed(2) + ' мин';
    } else {
      $('nTotalTime').textContent = '0.00 мин';
      console.error('Invalid totalTime:', totalTime);
    }
    
    if (!isNaN(avgCostPerSheet) && isFinite(avgCostPerSheet)) {
      $('nCost').textContent = avgCostPerSheet.toFixed(2) + ' ₽';
    } else {
      $('nCost').textContent = '0.00 ₽';
      console.error('Invalid avgCostPerSheet:', avgCostPerSheet);
    }
    
    if (!isNaN(totalCost) && isFinite(totalCost)) {
      $('nTotalCost').textContent = totalCost.toFixed(2) + ' ₽';
    } else {
      $('nTotalCost').textContent = '0.00 ₽';
      console.error('Invalid totalCost:', totalCost);
    }
  } catch (error) {
    console.error('Error updating combined costs UI:', error);
  }
  $('nLayoutType').textContent = 'Комбинированная';
  
  // Set up details toggle after card is shown
  setTimeout(() => {
    setupDetailsToggle();
  }, 10);
}

function autoCalculateLayout() {
  // Auto-calculate layout for included files with default quantity of 1
  const includedFiles = projectState.files.filter(file => file.includeInLayout && file.parsed);
  
  console.log('Auto calculating layout for', includedFiles.length, 'included files');
  
  if (includedFiles.length === 0) {
    console.log('No files to calculate layout for');
    return;
  }
  
  if (includedFiles.length === 1) {
    // Single file - calculate individual nesting
    console.log('Calculating individual nesting for file:', includedFiles[0].name);
    const file = includedFiles[0];
    calculateIndividualFileNesting(file);
    
    // Clear combined nesting
    state.combinedNesting = null;
  } else {
    // Multiple files - perform combined nesting
    console.log('Performing combined nesting for', includedFiles.length, 'files');
    performCombinedNesting(includedFiles);
    
    // Clear individual nesting
    state.nesting = null;
  }
  
  // Update empty layout message
  updateEmptyLayoutMessage();
}

function calculateIndividualFileNesting(file) {
  const W = +$('sW').value;
  const H = +$('sH').value;
  const m = +$('margin').value;
  const g = +$('spacing').value;
  const rotStr = $('rotations').value;
  const rots = rotStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n));
  
  const box = partBBox(file.parsed);
  if (box.w <= 0 || box.h <= 0) return;
  
  const qty = file.quantity || 1;
  const plan = computeNesting(W, H, m, g, qty, box.w, box.h, rots);
  
  // Store nesting data in the file and current state
  file.nesting = {...plan, box};
  if (file.id === projectState.activeFileId) {
    state.nesting = file.nesting;
  }
  
  // Update UI if this is the active file
  if (file.id === projectState.activeFileId) {
    updateNestingCards(plan, file);
  }
}

function updateNestingCards(plan, file) {
  const nestCard = document.getElementById('nestCard');
  if (!nestCard) return;
  
  nestCard.hidden = false;
  
  // Calculate total geometry for all placed parts
  const totalQuantity = file.quantity || 1;
  const totalCutLength = file.parsed && file.parsed.totalLen ? (file.parsed.totalLen * totalQuantity).toFixed(3) + ' м' : '—';
  const totalPierces = file.parsed && file.parsed.pierceCount ? (file.parsed.pierceCount * totalQuantity) : '—';
  const totalObjects = file.parsed && file.parsed.entities ? (file.parsed.entities.length * totalQuantity) : '—';
  
  // Update total geometry summary
  $('nTotalCutLength').textContent = totalCutLength;
  $('nTotalPierces').textContent = totalPierces;
  $('nTotalObjects').textContent = totalObjects;
  
  // Single file layout - update unified card elements
  $('nTotalFiles').textContent = '1';
  $('nTotalParts').textContent = totalQuantity;
  $('nPlaced').textContent = plan.placed;
  $('nSheets').textContent = plan.sheets;
  
  const usedArea = plan.placed * (plan.pw * plan.ph);
  const eff = usedArea / (plan.W * plan.H) * 100;
  $('nEff').textContent = eff.toFixed(1) + '%';
  
  // Calculate time and cost per sheet and totals
  if (file.parsed && file.parsed.totalLen && file.parsed.pierceCount) {
    const th = file.settings.thickness;
    const power = file.settings.power;
    const gas = file.settings.gas;
    
    // Validate that we have all required settings
    if (!th || !power || !gas) {
      console.warn('Missing settings for file:', file.name, { th, power, gas });
      $('nTime').textContent = 'Нет данных';
      $('nTotalTime').textContent = 'Нет данных';
      $('nCost').textContent = 'Нет данных';
      $('nTotalCost').textContent = 'Нет данных';
      return;
    }
    
    const {can, speed, pierce, gasCons} = calcCutParams(power, th, gas);
    
    if (can) {
      const cutMinPerPart = (file.parsed.totalLen * 1000) / speed;
      const pierceMinPerPart = (file.parsed.pierceCount * pierce) / 60;
      const totalMinPerPart = cutMinPerPart + pierceMinPerPart;
      const timePerSheet = totalMinPerPart * plan.placed;
      const totalTime = timePerSheet * plan.sheets;
      
      // Update time values with error checking
      try {
        if (!isNaN(timePerSheet) && isFinite(timePerSheet)) {
          $('nTime').textContent = timePerSheet.toFixed(2) + ' мин';
        } else {
          $('nTime').textContent = '0.00 мин';
          console.error('Invalid timePerSheet value:', timePerSheet);
        }
        
        if (!isNaN(totalTime) && isFinite(totalTime)) {
          $('nTotalTime').textContent = totalTime.toFixed(2) + ' мин';
        } else {
          $('nTotalTime').textContent = '0.00 мин';
          console.error('Invalid totalTime value:', totalTime);
        }
      } catch (error) {
        console.error('Error updating time display:', error);
      }
      
      // Get pricing values with guaranteed fallbacks
      const perM = parseFloat($('pPerM').value) || 100;
      const perPierce = parseFloat($('pPierce').value) || 50;
      const gasRubPerMin = parseFloat($('gasPrice').value) || 15;
      const machRubPerHr = parseFloat($('machPrice').value) || 500;
      
      console.log('Pricing values:', { perM, perPierce, gasRubPerMin, machRubPerHr });
      
      // Calculate costs with safe math operations
      const cutRubPerPart = perM * file.parsed.totalLen;
      const pierceRubPerPart = perPierce * file.parsed.pierceCount;
      const gasRubPerPart = gasRubPerMin * totalMinPerPart * (gasCons ? gasCons/4 : 1);
      const machRubPerPart = (machRubPerHr/60) * totalMinPerPart;
      const totalRubPerPart = cutRubPerPart + pierceRubPerPart + gasRubPerPart + machRubPerPart;
      const costPerSheet = totalRubPerPart * plan.placed;
      const totalCost = costPerSheet * plan.sheets;
      
      console.log('Cost calculation:', { 
        cutRubPerPart, 
        pierceRubPerPart, 
        gasRubPerPart, 
        machRubPerPart, 
        totalRubPerPart, 
        costPerSheet, 
        totalCost 
      });
      
      // Update UI elements with error checking
      try {
        if (!isNaN(costPerSheet) && isFinite(costPerSheet)) {
          $('nCost').textContent = costPerSheet.toFixed(2) + ' ₽';
        } else {
          $('nCost').textContent = '0.00 ₽';
          console.error('Invalid costPerSheet value:', costPerSheet);
        }
        
        if (!isNaN(totalCost) && isFinite(totalCost)) {
          $('nTotalCost').textContent = totalCost.toFixed(2) + ' ₽';
        } else {
          $('nTotalCost').textContent = '0.00 ₽';
          console.error('Invalid totalCost value:', totalCost);
        }
      } catch (error) {
        console.error('Error updating cost display:', error);
      }
    } else {
      // Handle cases where calculation is not possible
      console.warn('Cannot calculate costs for file:', file.name, 'Settings:', file.settings);
      $('nTime').textContent = 'Невозможно рассчитать';
      $('nTotalTime').textContent = 'Невозможно рассчитать';
      $('nCost').textContent = 'Невозможно рассчитать';
      $('nTotalCost').textContent = 'Невозможно рассчитать';
    }
  } else {
    $('nTime').textContent = 'Нет данных';
    $('nTotalTime').textContent = 'Нет данных';
    $('nCost').textContent = 'Нет данных';
    $('nTotalCost').textContent = 'Нет данных';
  }
  
  $('nLayoutType').textContent = 'Одиночная (' + plan.rot + '°)';
  
  // Set up details toggle after card is shown
  setTimeout(() => {
    setupDetailsToggle();
  }, 10);
}

function drawCombinedNesting(state, canvas) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  
  const layout = state.combinedNesting;
  if (!layout || layout.sheets.length === 0) {
    ctx.fillStyle='#7180a3';
    ctx.font='14px system-ui';
    ctx.fillText('Комбинированная раскладка не рассчитана', 18, 28);
    return;
  }
  
  const sheetW = +$('sW').value;
  const sheetH = +$('sH').value;
  const margin = +$('margin').value;
  
  // Calculate scaling and positioning for all sheets
  const sheetsPerRow = Math.ceil(Math.sqrt(layout.sheets.length));
  const sheetRows = Math.ceil(layout.sheets.length / sheetsPerRow);
  
  const pad = 20 * (window.devicePixelRatio || 1);
  const availableW = canvas.width - 2 * pad;
  const availableH = canvas.height - 2 * pad;
  
  const scaleX = availableW / (sheetsPerRow * sheetW + (sheetsPerRow - 1) * 50);
  const scaleY = availableH / (sheetRows * sheetH + (sheetRows - 1) * 50);
  const scale = Math.min(scaleX, scaleY);
  
  const totalLayoutW = sheetsPerRow * sheetW * scale + (sheetsPerRow - 1) * 50;
  const totalLayoutH = sheetRows * sheetH * scale + (sheetRows - 1) * 50;
  const startX = (canvas.width - totalLayoutW) / 2;
  const startY = (canvas.height - totalLayoutH) / 2;
  
  // Draw each sheet
  layout.sheets.forEach((sheet, sheetIndex) => {
    const row = Math.floor(sheetIndex / sheetsPerRow);
    const col = sheetIndex % sheetsPerRow;
    
    const sheetX = startX + col * (sheetW * scale + 50);
    const sheetY = startY + row * (sheetH * scale + 50);
    
    // Draw sheet background
    ctx.fillStyle = '#101828';
    ctx.strokeStyle = '#2b3753';
    ctx.lineWidth = 2;
    ctx.fillRect(sheetX, sheetY, sheetW * scale, sheetH * scale);
    ctx.strokeRect(sheetX, sheetY, sheetW * scale, sheetH * scale);
    
    // Draw margin lines
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#394b78';
    ctx.strokeRect(
      sheetX + margin * scale,
      sheetY + margin * scale,
      (sheetW - 2 * margin) * scale,
      (sheetH - 2 * margin) * scale
    );
    ctx.setLineDash([]);
    
    // Draw parts on this sheet
    sheet.parts.forEach((part, partIndex) => {
      const partX = sheetX + (margin + part.x) * scale;
      const partY = sheetY + (margin + part.y) * scale;
      const partW = part.placedWidth * scale;
      const partH = part.placedHeight * scale;
      
      // Use different colors for different files
      const fileIndex = projectState.files.findIndex(f => f.id === part.file.id);
      const colors = [
        { fill: 'rgba(109,140,255,0.3)', stroke: '#77a1ff' },
        { fill: 'rgba(255,140,109,0.3)', stroke: '#ff7751' },
        { fill: 'rgba(140,255,109,0.3)', stroke: '#77ff51' },
        { fill: 'rgba(255,109,255,0.3)', stroke: '#ff51ff' },
        { fill: 'rgba(109,255,255,0.3)', stroke: '#51ffff' },
        { fill: 'rgba(255,255,109,0.3)', stroke: '#ffff51' }
      ];
      const color = colors[fileIndex % colors.length];
      
      // Draw background rectangle with transparency
      ctx.fillStyle = color.fill;
      ctx.fillRect(partX, partY, partW, partH);
      
      // Draw mini DXF preview
      ctx.save();
      ctx.translate(partX, partY);
      
      // Apply rotation if needed
      if (part.rotation !== 0) {
        ctx.translate(partW / 2, partH / 2);
        ctx.rotate(part.rotation * Math.PI / 180);
        ctx.translate(-partW / 2, -partH / 2);
      }
      
      // Set clipping region to part bounds
      ctx.beginPath();
      ctx.rect(0, 0, partW, partH);
      ctx.clip();
      
      // Draw the DXF content
      drawMiniDXFContent(ctx, part.file.parsed, partW, partH, color.stroke);
      
      ctx.restore();
      
      // Draw border
      ctx.strokeStyle = color.stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(partX, partY, partW, partH);
      
      // Draw rotation indicator if rotated
      if (part.rotation !== 0) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `${Math.max(8, 8 * scale)}px system-ui`;
        ctx.fillText(`${part.rotation}°`, partX + 2, partY + 12);
      }
    });
    
    // Draw sheet number
    ctx.fillStyle = '#ffffff';
    ctx.font = `${12 * (window.devicePixelRatio || 1)}px system-ui`;
    ctx.fillText(`Лист ${sheetIndex + 1}`, sheetX + 5, sheetY - 5);
  });
  
  // Draw legend
  const legendY = canvas.height - 60;
  const legendX = 20;
  
  ctx.fillStyle = '#ffffff';
  ctx.font = `12px system-ui`;
  ctx.fillText('Легенда:', legendX, legendY);
  
  let legendOffset = 0;
  projectState.files.filter(f => f.includeInLayout).forEach((file, index) => {
    const colors = [
      { fill: 'rgba(109,140,255,0.5)', stroke: '#77a1ff' },
      { fill: 'rgba(255,140,109,0.5)', stroke: '#ff7751' },
      { fill: 'rgba(140,255,109,0.5)', stroke: '#77ff51' },
      { fill: 'rgba(255,109,255,0.5)', stroke: '#ff51ff' },
      { fill: 'rgba(109,255,255,0.5)', stroke: '#51ffff' },
      { fill: 'rgba(255,255,109,0.5)', stroke: '#ffff51' }
    ];
    const color = colors[index % colors.length];
    
    const rectX = legendX + legendOffset;
    const rectY = legendY + 10;
    
    // Draw mini preview for legend
    ctx.fillStyle = color.fill;
    ctx.fillRect(rectX, rectY, 20, 15);
    
    ctx.save();
    ctx.translate(rectX, rectY);
    ctx.beginPath();
    ctx.rect(0, 0, 20, 15);
    ctx.clip();
    drawMiniDXFContent(ctx, file.parsed, 20, 15, color.stroke);
    ctx.restore();
    
    ctx.strokeStyle = color.stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(rectX, rectY, 20, 15);
    
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${file.name.split('.')[0]} (×${file.quantity || 1})`, rectX + 25, rectY + 10);
    
    legendOffset += ctx.measureText(`${file.name.split('.')[0]} (×${file.quantity || 1})`).width + 70;
  });
}

function drawMiniDXFContent(ctx, parsed, width, height, strokeColor) {
  if (!parsed || !parsed.entities || parsed.entities.length === 0) return;
  
  // Get bounds of the DXF
  const bounds = getBounds(parsed.entities);
  if (bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) return;
  
  const boundsW = bounds.maxX - bounds.minX;
  const boundsH = bounds.maxY - bounds.minY;
  
  // Calculate scale to fit in available space with padding
  const padding = 2;
  const scaleX = (width - 2 * padding) / boundsW;
  const scaleY = (height - 2 * padding) / boundsH;
  const scale = Math.min(scaleX, scaleY);
  
  // Center the drawing
  const offsetX = (width - boundsW * scale) / 2 - bounds.minX * scale;
  const offsetY = (height - boundsH * scale) / 2 - bounds.minY * scale;
  
  // Set up drawing context
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, -scale); // Flip Y axis to match DXF coordinate system
  ctx.translate(0, -bounds.maxY - bounds.minY);
  
  // Draw entities
  ctx.strokeStyle = '#4f8cff';
  ctx.lineWidth = Math.max(0.5, 1 / scale); // Ensure line width is visible at any scale
  
  for (const entity of parsed.entities) {
    if (!entity || !entity.raw) continue;
    
    ctx.beginPath();
    
    if (entity.type === 'LINE') {
      const { x1, y1, x2, y2 } = entity.raw;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    } else if (entity.type === 'CIRCLE') {
      const { cx, cy, r } = entity.raw;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    } else if (entity.type === 'ARC') {
      const { cx, cy, r, a1 = 0, a2 = 0 } = entity.raw;
      const startAngle = a1 * Math.PI / 180;
      const endAngle = a2 * Math.PI / 180;
      ctx.arc(cx, cy, r, startAngle, endAngle);
    } else if (entity.type === 'POLY') {
      const pts = entity.raw.pts || [];
      if (pts.length > 0) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        if (entity.raw.closed) {
          ctx.closePath();
        }
      }
    }
    
    ctx.stroke();
  }
  
  ctx.restore();
}

function updateEmptyLayoutMessage() {
  const emptyMessage = $('emptyLayoutMessage');
  if (!emptyMessage) return;
  
  // Show the message if we're in the nest tab and have no nesting data
  // Check both single file nesting, multi-file nesting, and combined nesting
  const hasNestingData = state.nesting || 
                        state.combinedNesting || 
                        (projectState.multiFileNesting && projectState.multiFileNesting.totalSheets > 0);
  const showMessage = state.tab === 'nest' && !hasNestingData;
  emptyMessage.classList.toggle('visible', showMessage);
}

function updateActiveFileUI() {
  const activeFile = getActiveFile();
  if (activeFile) {
    // Update file tabs
    document.querySelectorAll('.file-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.fileId === activeFile.id);
    });
    
    // Update settings from file
    const elements = {
      th: $('th'),
      power: $('power'),
      gas: $('gas'),
      qty: $('qty')
    };
    
    if (elements.th) elements.th.value = activeFile.settings.thickness;
    if (elements.power) elements.power.value = activeFile.settings.power;
    if (elements.gas) elements.gas.value = activeFile.settings.gas;
    if (elements.qty) elements.qty.value = activeFile.quantity || 1;
    
    // Update tabs (orig/annot/nest)
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === activeFile.tab);
    });
    
    // Clear calculation cache when switching files
    calculationCache.lastParams = null;
    calculationCache.lastResult = null;
  }
  
  // Update multi-file nesting button state - removed since we use unified layout
  
  // Update calculate button state
  const calcBtn = $('calc');
  if (calcBtn) {
    calcBtn.disabled = !activeFile || !activeFile.parsed;
  }
  
  // Update nest button state
  const nestBtn = $('nest');
  if (nestBtn) {
    nestBtn.disabled = !activeFile || !activeFile.parsed;
  }
  
  // Update navigation buttons
  updateFileNavigationButtons();
  
  // Update empty layout message
  updateEmptyLayoutMessage();
}

function createFileTab(file) {
  const tab = document.createElement('div');
  tab.className = 'file-tab';
  tab.dataset.fileId = file.id;
  
  // Add mini preview canvas
  const previewContainer = document.createElement('div');
  previewContainer.className = 'file-tab-preview';
  
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = 40;
  previewCanvas.height = 30;
  previewCanvas.className = 'mini-preview';
  previewContainer.appendChild(previewCanvas);
  
  // Draw preview if file is parsed
  if (file.parsed) {
    drawMiniPreview(previewCanvas, file.parsed);
  }
  
  const fileName = document.createElement('span');
  fileName.className = 'file-tab-name';
  fileName.textContent = file.name;
  fileName.title = file.name;
  
  // Add layout checkbox
  const layoutCheckboxContainer = document.createElement('div');
  layoutCheckboxContainer.className = 'file-tab-layout-checkbox';
  
  const layoutCheckbox = document.createElement('input');
  layoutCheckbox.type = 'checkbox';
  layoutCheckbox.checked = file.includeInLayout;
  layoutCheckbox.className = 'layout-checkbox';
  layoutCheckbox.title = 'Включить в раскладку';
  
  layoutCheckboxContainer.appendChild(layoutCheckbox);
  
  // Add quantity input
  const quantityContainer = document.createElement('div');
  quantityContainer.className = 'file-tab-quantity';
  
  const quantityLabel = document.createElement('span');
  quantityLabel.textContent = 'шт:';
  quantityLabel.className = 'quantity-label';
  
  const quantityInput = document.createElement('input');
  quantityInput.type = 'number';
  quantityInput.value = file.quantity || 1;
  quantityInput.min = '1';
  quantityInput.max = '999';
  quantityInput.className = 'quantity-input';
  quantityInput.title = 'Количество деталей';
  
  quantityContainer.appendChild(quantityLabel);
  quantityContainer.appendChild(quantityInput);
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'file-tab-close';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Закрыть файл';
  
  tab.appendChild(previewContainer);
  tab.appendChild(fileName);
  tab.appendChild(layoutCheckboxContainer);
  tab.appendChild(quantityContainer);
  tab.appendChild(closeBtn);
  
  // Tab click event
  on(tab, 'click', (e) => {
    if (e.target !== closeBtn && e.target !== quantityInput && e.target !== layoutCheckbox) {
      setActiveFile(file.id);
    }
  });
  
  // Layout checkbox event
  on(layoutCheckbox, 'change', (e) => {
    e.stopPropagation();
    file.includeInLayout = e.target.checked;
  });
  
  // Quantity input event
  on(quantityInput, 'input', (e) => {
    e.stopPropagation();
    const newQuantity = parseInt(e.target.value) || 1;
    file.quantity = Math.max(1, Math.min(999, newQuantity));
    e.target.value = file.quantity;
  });
  
  // Close button event
  on(closeBtn, 'click', (e) => {
    e.stopPropagation();
    removeFile(file.id);
  });
  
  return tab;
}

function addFileToProject(file, content) {
  const fileObj = createFileObject(file, content);
  projectState.files.push(fileObj);
  
  // Add tab to UI
  const tabsList = $('fileTabsList');
  if (tabsList) {
    const tab = createFileTab(fileObj);
    tabsList.appendChild(tab);
  }
  
  // Show tabs container
  const tabsContainer = $('fileTabs');
  if (tabsContainer) {
    tabsContainer.style.display = 'block';
  }
  
  // Enable buttons - removed multiFileNestBtn since we use unified layout
  
  // Set as active if it's the first file
  if (projectState.files.length === 1) {
    setActiveFile(fileObj.id);
  }
  
  return fileObj;
}

function removeFile(fileId) {
  const fileIndex = projectState.files.findIndex(f => f.id === fileId);
  if (fileIndex === -1) return;
  
  const wasActive = projectState.activeFileId === fileId;
  
  // Remove from array
  projectState.files.splice(fileIndex, 1);
  
  // Remove tab from UI
  const tab = document.querySelector(`[data-file-id="${fileId}"]`);
  if (tab) tab.remove();
  
  // Hide tabs container if no files
  if (projectState.files.length === 0) {
    const tabsContainer = $('fileTabs');
    if (tabsContainer) tabsContainer.style.display = 'none';
    
    // Reset state
    projectState.activeFileId = null;
    state.rawDXF = '';
    state.parsed = null;
    state.paths = [];
    state.piercePaths = [];
    state.index = null;
    
    // Clear UI
    updateCards();
    safeDraw();
    
    // Disable buttons
    ['calc','nest','dlOrig','dlAnn','dlDXFMarkers','dlSVG','dlCSV','dlReport'].forEach(id => {
      const el = $(id); 
      if (el) el.disabled = true;
    });
    const dlContainer = $('dl');
    if (dlContainer) dlContainer.hidden = true;
    
  } else if (wasActive) {
    // Set new active file (prefer next, fallback to previous)
    const newActiveIndex = Math.min(fileIndex, projectState.files.length - 1);
    setActiveFile(projectState.files[newActiveIndex].id);
  }
  
  // Update layout after file removal
  autoCalculateLayout();
}

// Multi-file nesting functions
function updateMultiFileNestingInfo() {
  // This function is now deprecated - the unified nesting card is handled automatically
  // by autoCalculateLayout() which is called when files are added/removed or settings change
  // No action needed here to avoid infinite recursion
}

function calculateMultiFileNesting() {
  // This function is now integrated into autoCalculateLayout()
  // The unified nesting card is updated by either updateNestingCards() or updateCombinedNestingUI()
  // depending on whether it's single or multi-file layout
  
  // This function is now deprecated to avoid circular calls
  console.warn('calculateMultiFileNesting is deprecated - use autoCalculateLayout instead');
}

async function initializeApp() {
  cv = $('cv');
  if (!cv) {
    console.error('Canvas element with ID "cv" not found!');
    setStatus('Ошибка: не найден элемент canvas', 'err');
    return;
  }
  
  // Test canvas context
  try {
    const testCtx = cv.getContext('2d');
    if (!testCtx) {
      console.error('Failed to get 2D canvas context');
      setStatus('Ошибка: не удалось получить контекст canvas', 'err');
      return;
    }
  } catch (e) {
    console.error('Canvas context error:', e);
    setStatus('Ошибка контекста canvas: ' + e.message, 'err');
    return;
  }
  
  try {
    // Load configuration first
    setStatus('Загрузка конфигурации...', 'warn');
    
    // Try to load from localStorage first, then from config.json
    let config = loadConfigFromStorage();
    if (!config) {
      config = await loadConfig();
    }
    
    // Apply configuration to form elements
    applyConfigurationToElements();
    
    initCanvasInteractions(state, cv, safeDraw);
    initializeEventHandlers();
    
    // Initialize button states
    const calcBtn = $('calc');
    const nestBtn = $('nest');
    const prevFileBtn = $('prevFileBtn');
    const nextFileBtn = $('nextFileBtn');
    
    if (calcBtn) calcBtn.disabled = true;
    if (nestBtn) nestBtn.disabled = true;
    if (prevFileBtn) prevFileBtn.disabled = true;
    if (nextFileBtn) nextFileBtn.disabled = true;
    
    // Initialize empty layout message
    updateEmptyLayoutMessage();
    
    console.log('App initialized successfully');
    setStatus('Готово к работе', 'ok');
  } catch (e) {
    console.error('Error initializing app:', e);
    setStatus('Ошибка инициализации: ' + e.message, 'err');
  }
}

// Debounced config saving to prevent excessive localStorage writes
let saveConfigTimeout = null;
function debouncedSaveConfig() {
  if (saveConfigTimeout) clearTimeout(saveConfigTimeout);
  saveConfigTimeout = setTimeout(() => {
    saveCurrentConfig();
    saveConfigTimeout = null;
  }, 300); // 300ms debounce
}

// Save current form values to configuration
function saveCurrentConfig() {
  try {
    const formValues = {
      power: $('power')?.value,
      gas: $('gas')?.value,
      thickness: $('th')?.value,
      // Pricing fields are now readonly and managed by config file
      // pricePerMeter: $('pPerM')?.value,
      // pricePerPierce: $('pPierce')?.value,
      // gasPricePerMinute: $('gasPrice')?.value,
      // machineHourPrice: $('machPrice')?.value,
      sheetWidth: $('sW')?.value,
      sheetHeight: $('sH')?.value,
      margin: $('margin')?.value,
      spacing: $('spacing')?.value,
      quantity: $('qty')?.value,
      rotations: $('rotations')?.value
    };
    
    // Import and use saveConfigFromForm
    import('./config-loader.js').then(({ saveConfigFromForm }) => {
      saveConfigFromForm(formValues);
    }).catch(error => {
      console.warn('Failed to save configuration:', error);
    });
  } catch (error) {
    console.warn('Failed to save configuration:', error);
  }
}

// Apply configuration to form elements
function applyConfigurationToElements() {
  const elements = {
    power: $('power'),
    gas: $('gas'),
    thickness: $('th'),
    sheetWidth: $('sW'),
    sheetHeight: $('sH'),
    margin: $('margin'),
    spacing: $('spacing'),
    quantity: $('qty'),
    rotations: $('rotations')
  };
  
  // Apply configuration to editable elements
  applyConfigToForm(elements);
  
  // Apply readonly pricing values from config with guaranteed defaults
  const pricePerMeter = getConfig()?.pricing?.pricePerMeter || 100;
  const pricePerPierce = getConfig()?.pricing?.pricePerPierce || 50;
  const gasPricePerMinute = getConfig()?.pricing?.gasPricePerMinute || 15;
  const machineHourPrice = getConfig()?.pricing?.machineHourPrice || 500;
  
  console.log('Setting pricing values:', { pricePerMeter, pricePerPierce, gasPricePerMinute, machineHourPrice });
  
  if ($('pPerM')) $('pPerM').value = pricePerMeter;
  if ($('pPierce')) $('pPierce').value = pricePerPierce;
  if ($('gasPrice')) $('gasPrice').value = gasPricePerMinute;
  if ($('machPrice')) $('machPrice').value = machineHourPrice;
  
  // Update calculated fields after applying config
  if (state.parsed) {
    recomputeParams();
    updateCards();
    
    // Recalculate layout if we have one
    if (state.nesting || state.combinedNesting) {
      console.log('Recalculating layout after config change');
      autoCalculateLayout();
    }
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

function safeDraw(){
  if (!cv) {
    console.error('Canvas not initialized');
    setStatus('Ошибка: Canvas не инициализирован', 'err');
    return;
  }
  
  try {
    const ctx = cv.getContext('2d');
    if (!ctx) {
      console.error('Failed to get canvas context in safeDraw');
      setStatus('Ошибка: не удалось получить контекст canvas', 'err');
      return;
    }
    
    if(!state.parsed){ 
      ctx.setTransform(1,0,0,1,0,0); 
      ctx.clearRect(0,0,cv.width,cv.height);
      console.log('No parsed data, canvas cleared');
      return; 
    }
    
    console.log('Drawing with tab:', state.tab, 'entities:', state.parsed?.entities?.length || 0);
    
    if(state.tab==='nest') {
      if (state.combinedNesting) {
        drawCombinedNesting(state, cv);
      } else {
        drawNesting(state, cv);
      }
      
      // Update empty layout message
      updateEmptyLayoutMessage();
    } else {
      drawEntities(state, cv, state.tab==='annot');
    }
    
    console.log('Draw completed successfully');
  } catch(e) { 
    console.error('Error in safeDraw:', e); 
    setStatus('Ошибка при отрисовке: '+e.message,'err');
  }
}

// Details section toggle functionality for nesting card
function setupDetailsToggle() {
  const detailsToggle = $('detailsToggle');
  const detailsContent = $('detailsContent');
  const detailsHeader = $('detailsHeader');
  
  if (detailsToggle && detailsContent && detailsHeader) {
    // Remove existing event listeners to prevent duplicates
    const newToggle = detailsToggle.cloneNode(true);
    const newHeader = detailsHeader.cloneNode(true);
    detailsToggle.parentNode.replaceChild(newToggle, detailsToggle);
    detailsHeader.parentNode.replaceChild(newHeader, detailsHeader);
    
    // Load saved state
    const savedDetailsState = localStorage.getItem('nestingDetailsSectionExpanded');
    const initiallyExpanded = savedDetailsState ? JSON.parse(savedDetailsState) : false;
    
    // Apply initial state
    if (initiallyExpanded) {
      detailsContent.style.display = 'block';
      detailsContent.classList.add('expanded');
      newToggle.classList.add('expanded');
      newToggle.textContent = '▼';
      newToggle.title = 'Скрыть подробности';
    }
    
    on(newToggle, 'click', (e) => {
      e.stopPropagation();
      const isExpanded = detailsContent.classList.contains('expanded');
      
      if (isExpanded) {
        // Collapse
        detailsContent.classList.remove('expanded');
        newToggle.classList.remove('expanded');
        newToggle.textContent = '▶';
        newToggle.title = 'Показать подробности';
        localStorage.setItem('nestingDetailsSectionExpanded', 'false');
        setTimeout(() => {
          detailsContent.style.display = 'none';
        }, 300);
      } else {
        // Expand
        detailsContent.style.display = 'block';
        localStorage.setItem('nestingDetailsSectionExpanded', 'true');
        setTimeout(() => {
          detailsContent.classList.add('expanded');
          newToggle.classList.add('expanded');
          newToggle.textContent = '▼';
          newToggle.title = 'Скрыть подробности';
        }, 10);
      }
    });
    
    // Also allow clicking on the header to toggle
    on(newHeader, 'click', (e) => {
      if (e.target !== newToggle) {
        newToggle.click();
      }
    });
  }
}

function initializeEventHandlers() {
  // Tabs
  document.querySelectorAll('.tab').forEach(t=>on(t,'click',()=>{ 
    state.tab=t.dataset.tab; 
    document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active', x===t)); 
    // Update empty layout message when switching tabs
    updateEmptyLayoutMessage();
    safeDraw(); 
  }));
  
  // File navigation buttons
  const prevFileBtn = $('prevFileBtn');
  const nextFileBtn = $('nextFileBtn');
  if (prevFileBtn) {
    on(prevFileBtn, 'click', () => navigateToPrevFile());
  }
  if (nextFileBtn) {
    on(nextFileBtn, 'click', () => navigateToNextFile());
  }
  
  // Calculate button in main area
  on($('calc'), 'click', () => {
    if(!state.parsed) return;
    recomputeParams();
    updateCards();
    state.tab='annot';
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab==='annot'));
    safeDraw();
  });
  
  // Open DXF button
  on($('openBtn'), 'click', () => {
    $('file').click();
  });

  // Export section toggle functionality with state persistence
  const exportToggle = $('exportToggle');
  const exportContent = $('exportContent');
  const exportHeader = $('exportHeader');
  
  // Load saved state
  const savedExportState = localStorage.getItem('exportSectionExpanded');
  const initiallyExpanded = savedExportState ? JSON.parse(savedExportState) : false;
  
  if (exportToggle && exportContent) {
    // Apply initial state
    if (initiallyExpanded) {
      exportContent.style.display = 'block';
      exportContent.classList.add('expanded');
      exportToggle.classList.add('expanded');
      exportToggle.textContent = '▼';
      exportToggle.title = 'Скрыть экспорт';
    }
    
    on(exportToggle, 'click', (e) => {
      e.stopPropagation();
      const isExpanded = exportContent.classList.contains('expanded');
      
      if (isExpanded) {
        // Collapse
        exportContent.classList.remove('expanded');
        exportToggle.classList.remove('expanded');
        exportToggle.textContent = '▶';
        exportToggle.title = 'Показать экспорт';
        localStorage.setItem('exportSectionExpanded', 'false');
        setTimeout(() => {
          exportContent.style.display = 'none';
        }, 300);
      } else {
        // Expand
        exportContent.style.display = 'block';
        localStorage.setItem('exportSectionExpanded', 'true');
        setTimeout(() => {
          exportContent.classList.add('expanded');
          exportToggle.classList.add('expanded');
          exportToggle.textContent = '▼';
          exportToggle.title = 'Скрыть экспорт';
        }, 10);
      }
    });
    
    // Also allow clicking on the header to toggle
    on(exportHeader, 'click', (e) => {
      if (e.target !== exportToggle) {
        exportToggle.click();
      }
    });
  }

  // UI events with config saving (debounced for performance) + file settings update
  on($('th'),'change',()=>{ 
    if(state.parsed) { 
      recomputeParams(); 
      updateCards(); 
      // Save setting to active file
      const activeFile = getActiveFile();
      if (activeFile) {
        activeFile.settings.thickness = parseFloat($('th').value);
      }
    } 
    debouncedSaveConfig(); 
  });
  on($('power'),'change',()=>{
    if(state.parsed){
      recomputeParams();
      updateCards();
      // Save setting to active file
      const activeFile = getActiveFile();
      if (activeFile) {
        activeFile.settings.power = $('power').value;
      }
    } 
    debouncedSaveConfig();
  });
  on($('gas'),'change',()=>{
    if(state.parsed){
      recomputeParams();
      updateCards();
      // Save setting to active file
      const activeFile = getActiveFile();
      if (activeFile) {
        activeFile.settings.gas = $('gas').value;
      }
    } 
    debouncedSaveConfig();
  });
  
  // Save config when pricing changes - removed for readonly fields
  // on($('pPerM'),'input',()=>{if(state.parsed) updateCards(); debouncedSaveConfig();});
  // on($('pPierce'),'input',()=>{if(state.parsed) updateCards(); debouncedSaveConfig();});
  // on($('gasPrice'),'input',()=>{if(state.parsed) updateCards(); debouncedSaveConfig();});
  // on($('machPrice'),'input',()=>{if(state.parsed) updateCards(); debouncedSaveConfig();});
  
  // Save config when sheet parameters change (debounced)
  on($('sW'),'input',debouncedSaveConfig);
  on($('sH'),'input',debouncedSaveConfig);
  on($('margin'),'input',debouncedSaveConfig);
  on($('spacing'),'input',debouncedSaveConfig);
  
  // Update active file's quantity when global quantity changes
  on($('qty'),'input',() => {
    const activeFile = getActiveFile();
    if (activeFile) {
      // Update active file quantity
      const newQuantity = parseInt($('qty').value) || 1;
      activeFile.quantity = Math.max(1, Math.min(999, newQuantity));
      
      // Also update the file tab's quantity input
      const tabQuantityInput = document.querySelector(`.file-tab[data-file-id="${activeFile.id}"] .quantity-input`);
      if (tabQuantityInput) {
        tabQuantityInput.value = activeFile.quantity;
      }
    }
    debouncedSaveConfig();
  });
  
  on($('rotations'),'change',debouncedSaveConfig);
  
  on($('calc'),'click',()=>{ 
    if(!state.parsed) return; 
    console.log('Calculate button clicked - recalculating parameters');
    recomputeParams(); 
    updateCards(); 
    
    // Also ensure layout calculations are updated
    if (state.nesting || state.combinedNesting) {
      console.log('Recalculating layout with updated parameters');
      autoCalculateLayout();
    }
    
    state.tab='annot'; 
    document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active', x.dataset.tab==='annot')); 
    safeDraw() 
  });

  // Exports
  on($('dlOrig'),'click',()=>downloadText('original.dxf',state.rawDXF));
  on($('dlAnn'),'click',()=>downloadText('annotated_comments.dxf',createAnnotatedDXF(state.rawDXF,state.parsed)));
  on($('dlDXFMarkers'),'click',()=>downloadText('with_markers.dxf',createDXFWithMarkers(state.rawDXF,state.parsed,0.5)));
  on($('dlSVG'),'click',()=>downloadText('drawing.svg',createSVG(state.parsed)));
  on($('dlCSV'),'click',()=>downloadText('entities.csv',createCSV(state.parsed)));
  on($('dlReport'),'click',()=>downloadText('nesting_report.txt', makeNestingReport(state)));

  // Drag & drop / file handling for multiple files
  // const drop=$('drop');
  // on(drop,'dragover',e=>{e.preventDefault(); drop.style.borderColor='#6d8cff'});
  // on(drop,'dragleave',()=>drop.style.borderColor='#44507a');
  // on(drop,'drop',e=>{
  //   e.preventDefault(); 
  //   drop.style.borderColor='#44507a'; 
  //   const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.dxf'));
  //   if(files.length > 0) {
  //     loadFiles(files);
  //   } else {
  //     setStatus('Пожалуйста, выберите DXF файлы', 'err');
  //   }
  // });
  // on(drop,'click',()=>$('file').click());
  on($('file'),'change',e=>{ 
    const files = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.dxf'));
    if(files.length > 0) {
      loadFiles(files);
    }
    try{ $('file').value=''; }catch{}
  });
  
  // Add file button
  const addFileBtn = $('addFileBtn');
  if (addFileBtn) {
    on(addFileBtn, 'click', () => {
      $('file').click();
    });
  }

  // Nesting
  on($('nest'), 'click', ()=>{
    // Check if we have multiple files for combined layout
    const includedFiles = projectState.files.filter(file => file.includeInLayout && file.parsed);
    
    if (includedFiles.length === 0) {
      setStatus('Сначала загрузите DXF файлы', 'err');
      return;
    }
    
    if (includedFiles.length === 1) {
      // Single file nesting
      const file = includedFiles[0];
      if (!file.parsed) {
        setStatus('Файл не обработан', 'err');
        return;
      }
      
      calculateIndividualFileNesting(file);
      
      state.tab = 'nest';
      document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab==='nest'));
      updateEmptyLayoutMessage();
      safeDraw();
      setStatus('Раскладка готова','ok');
    } else {
      // Multi-file combined nesting
      performCombinedNesting(includedFiles);
      
      state.tab = 'nest';
      document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab==='nest'));
      updateEmptyLayoutMessage();
      safeDraw();
      setStatus('Комбинированная раскладка готова','ok');
    }
  });

  // Tests
  const runTests = makeRunTests({ parseDXF: parseDXFMainThread, sanitizeParsed, computeNesting });
  on($('runTests'),'click', runTests);
  
  // Multi-file nesting events - removed calculateMultiFileBtn since we use unified auto-layout

  // Init
  setStatus('Готово к работе','ok');
}

// Note: Event handlers moved to initializeEventHandlers function to avoid duplicates

// Worker management
let worker = null;
try{
  worker = new Worker('./parser-worker.js');
  worker.onerror = (e)=>console.error('[worker error]', e.message);
}catch(err){
  console.warn('Worker init failed:', err);
  worker = null;
}
function postToWorker(payload, timeoutMs=2500){
  return new Promise((resolve,reject)=>{
    if(!worker) return reject(new Error('no-worker'));
    let to = setTimeout(()=>{ worker.removeEventListener('message', onMsg); reject(new Error('timeout')) }, timeoutMs);
    function onMsg(e){ clearTimeout(to); worker.removeEventListener('message', onMsg); resolve(e.data) }
    worker.addEventListener('message', onMsg);
    worker.postMessage(payload);
  });
}
async function parseDXF(content){
  if(worker){
    try{
      const res = await postToWorker(content, 2500);
      if(res && res.ok) return res.res;
      console.warn('Worker returned error, fallback to main thread:', res?.err);
    }catch(e){
      console.warn('Worker timeout/fail, fallback to main thread:', e);
    }
  }
  return parseDXFMainThread(content);
}

// Load single file (updated for multi-file support)
async function loadFile(file){
  try{
    console.log('Loading file:', file.name, 'size:', file.size);
    setStatus(`Загрузка ${file.name}...`,'warn');
    
    perfMonitor.startTimer('file_load_total');
    perfMonitor.startTimer('file_read');
    const txt = await file.text();
    perfMonitor.endTimer('file_read');
    
    console.log('File read, content length:', txt.length);
    
    // Add file to project
    const fileObj = addFileToProject(file, txt);
    
    setStatus(`Парсинг ${file.name}...`,'warn');
    
    const parsed = await measurePerformance('dxf_parsing', async () => {
      return sanitizeParsed(await parseDXF(txt));
    });
    
    console.log('DXF parsed, entities:', parsed?.entities?.length || 0);
    
    // Display validation errors if any
    if (parsed.validationErrors && parsed.validationErrors.length > 0) {
      console.warn('Validation errors found:', parsed.validationErrors);
      const errorCount = parsed.validationErrors.length;
      const maxDisplay = 5; // Limit displayed errors to avoid UI clutter
      const displayErrors = parsed.validationErrors.slice(0, maxDisplay);
      const moreText = errorCount > maxDisplay ? ` (и еще ${errorCount - maxDisplay})` : '';
      setStatus(`Предупреждения в ${file.name}: ${displayErrors.join('; ')}${moreText}`, 'warn');
    }
    
    if (!parsed || !parsed.entities || parsed.entities.length === 0) {
      throw new Error(`Не найдено объектов в ${file.name}`);
    }
    
    // Update file object with parsed data
    fileObj.parsed = parsed;
    
    // Update the preview in the tab
    const tab = document.querySelector(`[data-file-id="${fileObj.id}"]`);
    if (tab) {
      const previewCanvas = tab.querySelector('.mini-preview');
      if (previewCanvas) {
        drawMiniPreview(previewCanvas, parsed);
      }
    }
    
    console.log('Building paths for', file.name);
    
    measurePerformance('path_building', () => {
      // Build paths for this file
      const ents = parsed?.entities || [];
      fileObj.paths = [];
      fileObj.piercePaths = [];
      
      for(let i = 0; i < ents.length; i++){
        const e = ents[i];
        if (!e || !e.raw) {
          fileObj.paths.push(new Path2D());
          continue;
        }
        
        const p = new Path2D();
        try {
          if(e.type==='LINE'){
            const {x1,y1,x2,y2}=e.raw; 
            if ([x1,y1,x2,y2].every(Number.isFinite)) {
              p.moveTo(x1,y1); p.lineTo(x2,y2);
            }
          }else if(e.type==='CIRCLE'){
            const {cx,cy,r}=e.raw; 
            if ([cx,cy,r].every(Number.isFinite) && r > 0) {
              p.moveTo(cx+r,cy); p.arc(cx,cy,r,0,Math.PI*2,false);
            }
          }else if(e.type==='ARC'){
            const {cx,cy,r,a1=0,a2=0}=e.raw;
            if ([cx,cy,r,a1,a2].every(Number.isFinite) && r > 0) {
              let A1=a1*Math.PI/180, A2=a2*Math.PI/180; let d=A2-A1; if(d<0) d+=2*Math.PI;
              // Cap steps to prevent excessive computation and memory usage
              const steps = Math.max(24, Math.min(360, Math.ceil((r*d)/1.5)));
              for(let k=0;k<=steps;k++){
                const a=A1 + d*(k/steps); const x=cx + r*Math.cos(a); const y=cy + r*Math.sin(a);
                if(k===0) p.moveTo(x,y); else p.lineTo(x,y);
              }
            }
          }else if(e.type==='POLY'){
            const pts=e.raw.pts||[]; 
            if(pts.length && pts.every(pt => Number.isFinite(pt.x) && Number.isFinite(pt.y))){ 
              p.moveTo(pts[0].x,pts[0].y); 
              for(let j=1;j<pts.length;j++) p.lineTo(pts[j].x,pts[j].y); 
              if(e.raw.closed) p.closePath(); 
            }
          }
        } catch (pathError) {
          console.error('Error creating path for entity', i, ':', pathError);
        }
        fileObj.paths.push(p);
      }
      
      // Build pierce paths
      const piercePts = parsed?.piercePts||[];
      for(const pt of piercePts){
        if (!pt || !Array.isArray(pt) || pt.length < 2) continue;
        if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
        
        try {
          const pp = new Path2D();
          const r=3; 
          pp.moveTo(pt[0]+r,pt[1]); 
          pp.arc(pt[0],pt[1],r,0,Math.PI*2,false);
          fileObj.piercePaths.push(pp);
        } catch (pierceError) {
          console.error('Error creating pierce path:', pierceError);
        }
      }
    });
    
    console.log('Paths built, count:', fileObj.paths?.length || 0);
    
    // Set as active file
    setActiveFile(fileObj.id);
    
    // Enable buttons
    ['calc','nest','dlOrig','dlAnn','dlDXFMarkers','dlSVG','dlCSV','dlReport'].forEach(id=>{ const el = $(id); if(el) el.disabled=false; });
    
    // Handle export section visibility
    const dlContainer = $('dl');
    const exportContent = $('exportContent');
    if (dlContainer) {
      dlContainer.hidden = false;
      const savedExportState = localStorage.getItem('exportSectionExpanded');
      const shouldExpand = savedExportState ? JSON.parse(savedExportState) : true;
      
      if (exportContent && shouldExpand) {
        exportContent.style.display = 'block';
        setTimeout(() => {
          exportContent.classList.add('expanded');
          const exportToggle = $('exportToggle');
          if (exportToggle) {
            exportToggle.classList.add('expanded');
            exportToggle.textContent = '▼';
            exportToggle.title = 'Скрыть экспорт';
          }
        }, 10);
      }
    }
    
    console.log('Updating cards...');
    measurePerformance('cards_update', () => {
      updateCards();
    });
    
    console.log('Fitting view...');
    measurePerformance('view_fit', () => {
      fitView(state, cv);
    });
    
    console.log('Drawing...');
    measurePerformance('initial_draw', () => {
      safeDraw();
    });
    
    perfMonitor.endTimer('file_load_total');
    
    console.log('File loaded successfully:', file.name);
    console.log('Performance report:', perfMonitor.getReport());
    setStatus(`Готово: ${file.name} - объектов: ${parsed.entities.length}, длина: ${parsed.totalLen.toFixed(3)} м`,'ok');
    
    // Trigger layout calculation after file is fully loaded and parsed
    autoCalculateLayout();
  }catch(err){
    console.error('Error loading file:', file.name, err);
    setStatus(`Ошибка в ${file.name}: `+(err?.message||String(err)),'err');
  }
}

// Load multiple files
async function loadFiles(files) {
  if (!files || files.length === 0) return;
  
  setStatus(`Загрузка ${files.length} файлов...`, 'warn');
  
  for (let i = 0; i < files.length; i++) {
    await loadFile(files[i]);
  }
  
  // Final status with layout information
  const includedFiles = projectState.files.filter(file => file.includeInLayout && file.parsed);
  setStatus(`Успешно загружено ${files.length} файлов, в раскладке: ${includedFiles.length}`, 'ok');
  
  // Ensure final layout calculation after all files are loaded
  autoCalculateLayout();
}

// Cost/time
function recomputeParams(){
  const th = parseFloat($('th').value);
  const power = $('power').value;
  const gas = $('gas').value;
  const cp = calcCutParams(power, th, gas);
  
  // Clear calculation cache when parameters change
  calculationCache.lastParams = null;
  calculationCache.lastResult = null;
  
  // Display the thickness-specific cutting speed
  $('cutSpd').value = cp.can ? cp.speed : 0;
  $('pierceSec').value = cp.can ? cp.pierce.toFixed(2) : 0;
}
// Cached calculation results to avoid redundant computations
let calculationCache = {
  lastParams: null,
  lastResult: null
};

function updateCards(){
  if(!state.parsed) return;
  
  // Cache DOM elements to avoid repeated queries
  const elements = {
    th: $('th'),
    power: $('power'),
    gas: $('gas'),
    pPerM: $('pPerM'),
    pPierce: $('pPierce'),
    gasPrice: $('gasPrice'),
    machPrice: $('machPrice')
  };
  
  const th = parseFloat(elements.th.value);
  const power = elements.power.value;
  const gas = elements.gas.value;
  
  // Create cache key for parameters
  const paramKey = `${th}-${power}-${gas}-${state.parsed.totalLen}-${state.parsed.pierceCount}`;
  
  let calculations;
  if (calculationCache.lastParams === paramKey) {
    // Use cached calculations
    calculations = calculationCache.lastResult;
  } else {
    // Perform new calculations and cache them
    const {can, speed, pierce, gasCons} = calcCutParams(power, th, gas);
    const perM = parseFloat(elements.pPerM.value) || 100;
    const perPierce = parseFloat(elements.pPierce.value) || 50;
    const gasRubPerMin = parseFloat(elements.gasPrice.value) || 15;
    const machRubPerHr = parseFloat(elements.machPrice.value) || 500;

    const cutMin = can ? (state.parsed.totalLen * 1000) / speed : 0;
    const pierceMin = can ? (state.parsed.pierceCount * pierce) / 60 : 0;
    const totalMin = cutMin + pierceMin;

    const cutRub = perM * state.parsed.totalLen;
    const pierceRub = perPierce * state.parsed.pierceCount;
    const gasRub = gasRubPerMin * totalMin * (gasCons ? gasCons/4 : 1);
    const machRub = (machRubPerHr/60) * totalMin;
    const totalRub = cutRub + pierceRub + gasRub + machRub;
    
    calculations = {
      cutMin, pierceMin, totalMin,
      cutRub, pierceRub, gasRub, machRub, totalRub
    };
    
    // Cache the results
    calculationCache.lastParams = paramKey;
    calculationCache.lastResult = calculations;
  }

  // Batch DOM updates to minimize reflows
  const updates = {
    'mLen': (state.parsed.totalLen).toFixed(3) + ' м',
    'mPierce': state.parsed.pierceCount,
    'mEnt': state.parsed.entities.length,
    'mCutMin': calculations.cutMin.toFixed(2) + ' мин',
    'mPierceMin': calculations.pierceMin.toFixed(2) + ' мин',
    'mTotalMin': calculations.totalMin.toFixed(2) + ' мин',
    'mCutRub': calculations.cutRub.toFixed(2) + ' ₽',
    'mPierceRub': calculations.pierceRub.toFixed(2) + ' ₽',
    'mGasRub': calculations.gasRub.toFixed(2) + ' ₽',
    'mMachRub': calculations.machRub.toFixed(2) + ' ₽',
    'mTotalRub': calculations.totalRub.toFixed(2) + ' ₽'
  };
  
  // Apply all updates in a single batch
  requestAnimationFrame(() => {
    for (const [id, text] of Object.entries(updates)) {
      const element = $(id);
      if (element) element.textContent = text;
    }
  });
}

// Note: Nesting and Tests handlers moved to initializeEventHandlers function to avoid duplicates

function drawMiniPreview(canvas, parsed) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  if (!parsed || !parsed.entities || parsed.entities.length === 0) {
    // Draw placeholder
    ctx.fillStyle = '#444';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#666';
    ctx.strokeRect(0, 0, width, height);
    return;
  }
  
  // Get bounds of the DXF
  const bounds = getBounds(parsed.entities);
  if (bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) return;
  
  const boundsW = bounds.maxX - bounds.minX;
  const boundsH = bounds.maxY - bounds.minY;
  
  // Calculate scale to fit in canvas with padding
  const padding = 2;
  const scaleX = (width - 2 * padding) / boundsW;
  const scaleY = (height - 2 * padding) / boundsH;
  const scale = Math.min(scaleX, scaleY);
  
  // Center the drawing
  const offsetX = (width - boundsW * scale) / 2 - bounds.minX * scale;
  const offsetY = (height - boundsH * scale) / 2 - bounds.minY * scale;
  
  // Set up drawing context
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, -scale); // Flip Y axis to match DXF coordinate system
  ctx.translate(0, -bounds.maxY - bounds.minY);
  
  // Draw entities
  ctx.strokeStyle = '#77a1ff';
  ctx.lineWidth = 1 / scale; // Ensure line width is visible at any scale
  
  for (const entity of parsed.entities) {
    if (!entity || !entity.raw) continue;
    
    ctx.beginPath();
    
    if (entity.type === 'LINE') {
      const { x1, y1, x2, y2 } = entity.raw;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    } else if (entity.type === 'CIRCLE') {
      const { cx, cy, r } = entity.raw;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    } else if (entity.type === 'ARC') {
      const { cx, cy, r, a1 = 0, a2 = 0 } = entity.raw;
      const startAngle = a1 * Math.PI / 180;
      const endAngle = a2 * Math.PI / 180;
      ctx.arc(cx, cy, r, startAngle, endAngle);
    } else if (entity.type === 'POLY') {
      const pts = entity.raw.pts || [];
      if (pts.length > 0) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        if (entity.raw.closed) {
          ctx.closePath();
        }
      }
    }
    
    ctx.stroke();
  }
  
  ctx.restore();
}

function getBounds(entities) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (const e of entities) {
    if (!e || !e.raw) continue;
    
    if (e.type === 'LINE') {
      const { x1, y1, x2, y2 } = e.raw;
      minX = Math.min(minX, x1, x2);
      minY = Math.min(minY, y1, y2);
      maxX = Math.max(maxX, x1, x2);
      maxY = Math.max(maxY, y1, y2);
    } else if (e.type === 'CIRCLE') {
      const { cx, cy, r } = e.raw;
      minX = Math.min(minX, cx - r);
      minY = Math.min(minY, cy - r);
      maxX = Math.max(maxX, cx + r);
      maxY = Math.max(maxY, cy + r);
    } else if (e.type === 'ARC') {
      const { cx, cy, r } = e.raw;
      minX = Math.min(minX, cx - r);
      minY = Math.min(minY, cy - r);
      maxX = Math.max(maxX, cx + r);
      maxY = Math.max(maxY, cy + r);
    } else if (e.type === 'POLY') {
      const pts = e.raw.pts || [];
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
  }
  
  return { minX, minY, maxX, maxY };
}
