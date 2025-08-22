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

function updateEmptyLayoutMessage() {
  const emptyMessage = $('emptyLayoutMessage');
  if (!emptyMessage) return;
  
  // Show the message if we're in the nest tab and have no nesting data
  // Check both single file nesting and multi-file nesting
  const hasNestingData = state.nesting || (projectState.multiFileNesting && projectState.multiFileNesting.totalSheets > 0);
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
  
  // Update multi-file nesting button state
  const multiFileNestBtn = $('multiFileNestBtn');
  if (multiFileNestBtn) {
    multiFileNestBtn.disabled = projectState.files.length === 0;
  }
  
  // Update calculate button state
  const calcFileBtn = $('calcFileBtn');
  if (calcFileBtn) {
    calcFileBtn.disabled = !activeFile || !activeFile.parsed;
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
    
    // Update multi-file nesting calculations
    updateMultiFileNestingInfo();
  });
  
  // Quantity input event
  on(quantityInput, 'input', (e) => {
    e.stopPropagation();
    const newQuantity = parseInt(e.target.value) || 1;
    file.quantity = Math.max(1, Math.min(999, newQuantity));
    e.target.value = file.quantity;
    
    // Update global nesting calculations if needed
    updateMultiFileNestingInfo();
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
  
  // Enable multi-file nesting button
  const multiFileNestBtn = $('multiFileNestBtn');
  if (multiFileNestBtn) {
    multiFileNestBtn.disabled = false;
  }
  
  // Set as active if it's the first file
  if (projectState.files.length === 1) {
    setActiveFile(fileObj.id);
  }
  
  // Update multi-file nesting info
  updateMultiFileNestingInfo();
  
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
  
  // Update multi-file nesting info
  updateMultiFileNestingInfo();
}

// Multi-file nesting functions
function updateMultiFileNestingInfo() {
  const multiFileCard = $('multiFileCard');
  if (!multiFileCard) return;
  
  // Calculate estimated sheets needed for all files
  calculateMultiFileNesting();
  
  // Show the card if we have at least one included file
  const includedFiles = projectState.files.filter(file => file.includeInLayout && file.parsed);
  multiFileCard.style.display = includedFiles.length > 0 ? 'block' : 'none';
}

function calculateMultiFileNesting() {
  const W = +$('sW').value;
  const H = +$('sH').value; 
  const m = +$('margin').value;
  const g = +$('spacing').value;
  const rotStr = $('rotations').value;
  const rots = rotStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n));
  
  let totalSheetsNeeded = 0;
  let totalCost = 0;
  let totalTime = 0;
  const fileResults = [];
  
  // Filter files that should be included in layout
  const includedFiles = projectState.files.filter(file => file.includeInLayout && file.parsed);
  
  // Count total included files and parts
  const totalIncludedFiles = includedFiles.length;
  const totalIncludedParts = includedFiles.reduce((sum, file) => sum + (file.quantity || 1), 0);
  
  // Update UI with totals
  const totalFilesEl = $('multiFileTotalFiles');
  const totalPartsEl = $('multiFileTotalParts');
  const sheetsEl = $('multiFileSheets');
  const costEl = $('multiFileCost');
  const timeEl = $('multiFileTime');
  
  if (totalFilesEl) totalFilesEl.textContent = totalIncludedFiles;
  if (totalPartsEl) totalPartsEl.textContent = totalIncludedParts;
  
  // If no files are included, reset the display and return
  if (totalIncludedFiles === 0) {
    if (sheetsEl) sheetsEl.textContent = '0';
    if (costEl) costEl.textContent = '0 ₽';
    if (timeEl) timeEl.textContent = '0 мин';
    return;
  }
  
  for (const file of includedFiles) {
    if (!file.parsed) continue;
    
    // Get bounding box for this file
    const box = partBBox(file.parsed);
    if (box.w <= 0 || box.h <= 0) continue;
    
    // Calculate nesting for this file with the correct quantity
    // Make sure to use file.quantity or default to 1 if not set
    const fileQuantity = file.quantity || 1;
    const plan = computeNesting(W, H, m, g, fileQuantity, box.w, box.h, rots);
    
    // Calculate cost and time for this file
    if (file.parsed.totalLen && file.parsed.pierceCount) {
      const th = file.settings.thickness;
      const power = file.settings.power;
      const gas = file.settings.gas;
      const {can, speed, pierce, gasCons} = calcCutParams(power, th, gas);
      
      if (can) {
        const cutMinPerPart = (file.parsed.totalLen * 1000) / speed;
        const pierceMinPerPart = (file.parsed.pierceCount * pierce) / 60;
        const totalMinPerPart = cutMinPerPart + pierceMinPerPart;
        const timePerSheet = totalMinPerPart * plan.placed;
        
        const perM = parseFloat($('pPerM').value);
        const perPierce = parseFloat($('pPierce').value);
        const gasRubPerMin = parseFloat($('gasPrice').value);
        const machRubPerHr = parseFloat($('machPrice').value);
        
        const cutRubPerPart = perM * file.parsed.totalLen;
        const pierceRubPerPart = perPierce * file.parsed.pierceCount;
        const gasRubPerPart = gasRubPerMin * totalMinPerPart * (gasCons ? gasCons/4 : 1);
        const machRubPerPart = (machRubPerHr/60) * totalMinPerPart;
        const totalRubPerPart = cutRubPerPart + pierceRubPerPart + gasRubPerPart + machRubPerPart;
        const costPerSheet = totalRubPerPart * plan.placed;
        
        totalSheetsNeeded += plan.sheets;
        totalCost += costPerSheet * plan.sheets;
        totalTime += timePerSheet * plan.sheets;
        
        fileResults.push({
          file,
          plan,
          timePerSheet,
          costPerSheet
        });
      }
    }
  }
  
  // Update UI with results
  if (sheetsEl) sheetsEl.textContent = totalSheetsNeeded;
  if (costEl) costEl.textContent = totalCost.toFixed(2) + ' ₽';
  if (timeEl) timeEl.textContent = totalTime.toFixed(2) + ' мин';
  
  // Store results for potential use
  projectState.multiFileNesting = {
    totalSheets: totalSheetsNeeded,
    totalCost: totalCost,
    totalTime: totalTime,
    fileResults: fileResults
  };
  
  // Update empty layout message since we now have nesting data
  updateEmptyLayoutMessage();
}

function performGlobalNesting() {
  setStatus('Глобальная раскладка в разработке', 'warn');
  
  // Future implementation would:
  // 1. Collect all parts from all files with their quantities
  // 2. Run nesting algorithm on combined set
  // 3. Show optimized layout across multiple sheets
  // 4. Display results with assignment of parts to sheets
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
    const multiFileNestBtn = $('multiFileNestBtn');
    const calcFileBtn = $('calcFileBtn');
    const prevFileBtn = $('prevFileBtn');
    const nextFileBtn = $('nextFileBtn');
    
    if (multiFileNestBtn) multiFileNestBtn.disabled = true;
    if (calcFileBtn) calcFileBtn.disabled = true;
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
  
  // Apply readonly pricing values from config
  const pricePerMeter = getConfig()?.pricing?.pricePerMeter || 100;
  const pricePerPierce = getConfig()?.pricing?.pricePerPierce || 50;
  const gasPricePerMinute = getConfig()?.pricing?.gasPricePerMinute || 15;
  const machineHourPrice = getConfig()?.pricing?.machineHourPrice || 500;
  
  if ($('pPerM')) $('pPerM').value = pricePerMeter;
  if ($('pPierce')) $('pPierce').value = pricePerPierce;
  if ($('gasPrice')) $('gasPrice').value = gasPricePerMinute;
  if ($('machPrice')) $('machPrice').value = machineHourPrice;
  
  // Update calculated fields after applying config
  if (state.parsed) {
    recomputeParams();
    updateCards();
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
      drawNesting(state, cv);
      
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
  
  // Calculate button in file header
  const calcFileBtn = $('calcFileBtn');
  if (calcFileBtn) {
    on(calcFileBtn, 'click', () => {
      if(!state.parsed) return;
      recomputeParams();
      updateCards();
      state.tab='annot';
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab==='annot'));
      safeDraw();
    });
  }

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
      
      // Update multi-file nesting calculations
      updateMultiFileNestingInfo();
    }
    debouncedSaveConfig();
  });
  
  on($('rotations'),'change',debouncedSaveConfig);
  
  on($('calc'),'click',()=>{ if(!state.parsed) return; recomputeParams(); updateCards(); state.tab='annot'; document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active', x.dataset.tab==='annot')); safeDraw() });

  // Exports
  on($('dlOrig'),'click',()=>downloadText('original.dxf',state.rawDXF));
  on($('dlAnn'),'click',()=>downloadText('annotated_comments.dxf',createAnnotatedDXF(state.rawDXF,state.parsed)));
  on($('dlDXFMarkers'),'click',()=>downloadText('with_markers.dxf',createDXFWithMarkers(state.rawDXF,state.parsed,0.5)));
  on($('dlSVG'),'click',()=>downloadText('drawing.svg',createSVG(state.parsed)));
  on($('dlCSV'),'click',()=>downloadText('entities.csv',createCSV(state.parsed)));
  on($('dlReport'),'click',()=>downloadText('nesting_report.txt', makeNestingReport(state)));

  // Drag & drop / file handling for multiple files
  const drop=$('drop');
  on(drop,'dragover',e=>{e.preventDefault(); drop.style.borderColor='#6d8cff'});
  on(drop,'dragleave',()=>drop.style.borderColor='#44507a');
  on(drop,'drop',e=>{
    e.preventDefault(); 
    drop.style.borderColor='#44507a'; 
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.dxf'));
    if(files.length > 0) {
      loadFiles(files);
    } else {
      setStatus('Пожалуйста, выберите DXF файлы', 'err');
    }
  });
  on(drop,'click',()=>$('file').click());
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
    if(!state.parsed){ setStatus('Сначала загрузите DXF','err'); return; }
    const W = +$('sW').value, H = +$('sH').value, m = +$('margin').value, g = +$('spacing').value;
    
    // Use the active file's quantity if available, otherwise use the global quantity
    let qty = +$('qty').value;
    const activeFile = getActiveFile();
    if (activeFile && activeFile.quantity) {
      qty = activeFile.quantity;
    }
    const rotStr = $('rotations').value; const rots = rotStr.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!Number.isNaN(n));
    const box = partBBox(state.parsed);
    if (box.w<=0 || box.h<=0){ setStatus('Не удалось определить габарит детали','err'); return; }
    const plan = computeNesting(W,H,m,g, qty, box.w, box.h, rots);
    state.nesting = {...plan, box};
    document.getElementById('nestCard').hidden = false;
    $('nPlaced').textContent = plan.placed;
    $('nSheets').textContent = plan.sheets;
    const usedArea = plan.placed * (plan.pw * plan.ph);
    const eff = usedArea / (plan.W*plan.H) * 100;
    $('nEff').textContent = eff.toFixed(1)+'%';
    
    // Calculate time and cost per sheet
    if (state.parsed && state.parsed.totalLen && state.parsed.pierceCount) {
      const th = parseFloat($('th').value);
      const power = $('power').value;
      const gas = $('gas').value;
      const {can, speed, pierce, gasCons} = calcCutParams(power, th, gas);
      
      if (can) {
        // Time calculations per part
        const cutMinPerPart = (state.parsed.totalLen * 1000) / speed;
        const pierceMinPerPart = (state.parsed.pierceCount * pierce) / 60;
        const totalMinPerPart = cutMinPerPart + pierceMinPerPart;
        
        // Time per sheet (multiply by parts placed on sheet)
        const timePerSheet = totalMinPerPart * plan.placed;
        $('nTime').textContent = timePerSheet.toFixed(2) + ' мин';
        
        // Cost calculations
        const perM = parseFloat($('pPerM').value);
        const perPierce = parseFloat($('pPierce').value);
        const gasRubPerMin = parseFloat($('gasPrice').value);
        const machRubPerHr = parseFloat($('machPrice').value);
        
        // Cost per part
        const cutRubPerPart = perM * state.parsed.totalLen;
        const pierceRubPerPart = perPierce * state.parsed.pierceCount;
        const gasRubPerPart = gasRubPerMin * totalMinPerPart * (gasCons ? gasCons/4 : 1);
        const machRubPerPart = (machRubPerHr/60) * totalMinPerPart;
        const totalRubPerPart = cutRubPerPart + pierceRubPerPart + gasRubPerPart + machRubPerPart;
        
        // Cost per sheet (multiply by parts placed on sheet)
        const costPerSheet = totalRubPerPart * plan.placed;
        $('nCost').textContent = costPerSheet.toFixed(2) + ' ₽';
      } else {
        $('nTime').textContent = 'Невозможно рассчитать';
        $('nCost').textContent = 'Невозможно рассчитать';
      }
    } else {
      $('nTime').textContent = 'Нет данных';
      $('nCost').textContent = 'Нет данных';
    }
    
    $('nRot').textContent = plan.rot + '°';
    state.tab = 'nest';
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab==='nest'));
    
    // Update empty layout message
    updateEmptyLayoutMessage();
    
    safeDraw();
    setStatus('Раскладка готова','ok');
  });

  // Tests
  const runTests = makeRunTests({ parseDXF: parseDXFMainThread, sanitizeParsed, computeNesting });
  on($('runTests'),'click', runTests);
  
  // Multi-file nesting events
  const calculateMultiFileBtn = $('calculateMultiFile');
  if (calculateMultiFileBtn) {
    on(calculateMultiFileBtn, 'click', () => {
      updateMultiFileNestingInfo();
      setStatus('Мультифайловая раскладка пересчитана', 'ok');
    });
  }
  
  const multiFileNestBtn = $('multiFileNestBtn');
  if (multiFileNestBtn) {
    on(multiFileNestBtn, 'click', () => {
      // Check if we have any files to include in layout
      const includedFiles = projectState.files.filter(file => file.includeInLayout && file.parsed);
      
      if (includedFiles.length === 0) {
        setStatus('Нет файлов для раскладки. Пожалуйста, выберите файлы с помощью флажков.', 'err');
        return;
      }
      
      // Update multi-file nesting calculations
      updateMultiFileNestingInfo();
      
      // Show the multi-file card
      const multiFileCard = $('multiFileCard');
      if (multiFileCard) {
        multiFileCard.style.display = 'block';
      }
      
      // Show the nesting tab
      state.tab = 'nest';
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'nest'));
      
      // Update the empty layout message
      updateEmptyLayoutMessage();
      
      safeDraw();
      
      setStatus('Раскладка выбранных файлов готова', 'ok');
    });
  }
  
  const globalNestingBtn = $('globalNesting');
  if (globalNestingBtn) {
    on(globalNestingBtn, 'click', performGlobalNesting);
  }

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
    
    if (!parsed || !parsed.entities || parsed.entities.length === 0) {
      throw new Error(`Не найдено объектов в ${file.name}`);
    }
    
    // Update file object with parsed data
    fileObj.parsed = parsed;
    
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
  
  setStatus(`Успешно загружено ${files.length} файлов`, 'ok');
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
    const perM = parseFloat(elements.pPerM.value);
    const perPierce = parseFloat(elements.pPierce.value);
    const gasRubPerMin = parseFloat(elements.gasPrice.value);
    const machRubPerHr = parseFloat(elements.machPrice.value);

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
