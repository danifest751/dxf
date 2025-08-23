import { dpr, screenToWorld, clamp } from './utils.js';

// Дебаунсинг для оптимизации производительности
let drawTimeout = null;
function debouncedDraw(onDraw) {
  if (drawTimeout) return; // Уже запланировано
  drawTimeout = requestAnimationFrame(() => {
    onDraw();
    drawTimeout = null;
  });
}

/**
 * Инициализирует взаимодействие с canvas
 * @param {Object} state - Состояние приложения
 * @param {HTMLCanvasElement} canvas - Canvas элемент
 * @param {Function} onDraw - Функция отрисовки
 */
export function initCanvasInteractions(state, canvas, onDraw) {
  if (!canvas) {
    throw new Error('Canvas элемент не найден');
  }
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Не удалось получить 2D контекст canvas');
  }
  
  function resize() {
    const r = canvas.getBoundingClientRect();
    const newWidth = Math.max(1, Math.floor(r.width * dpr));
    const newHeight = Math.max(1, Math.floor(r.height * dpr));
    
    if (canvas.width !== newWidth || canvas.height !== newHeight) {
      canvas.width = newWidth;
      canvas.height = newHeight;
      console.log('Canvas изменён размер:', newWidth, 'x', newHeight);
    }
    
    try {
      onDraw();
    } catch (e) {
      console.error('Ошибка в onDraw при изменении размера:', e);
    }
  }
  
  window.addEventListener('resize', resize);
  resize();

  // Инициализация свойств состояния если они не существуют
  if (!state.pan) state.pan = { x: 0, y: 0 };
  if (!state.zoom) state.zoom = 1;
  if (!state.tab) state.tab = 'orig';

  const world = () => {
    if (!canvas.width || !canvas.height) {
      console.warn('Canvas имеет нулевые размеры');
      return;
    }
    ctx.setTransform(state.zoom * dpr, 0, 0, -state.zoom * dpr, state.pan.x, canvas.height - state.pan.y);
  };
  
  state.__ctx = ctx;
  state.__world = world;

  let dragging = false, last = { x: 0, y: 0 };
  
  canvas.addEventListener('mousedown', e => {
    dragging = true; 
    last = { x: e.clientX, y: e.clientY }; 
    state.__hover = null; 
    hideTooltip();
  });
  
  window.addEventListener('mouseup', () => dragging = false);
  
  window.addEventListener('mousemove', e => {
    if (dragging) {
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      state.pan.x += dx; 
      state.pan.y += dy; 
      debouncedDraw(onDraw); 
      return;
    }
    
    if (!state.index) return;
    
    try {
      const pt = screenToWorld(state, canvas, e.clientX, e.clientY);
      const found = hitTest(state, pt.x, pt.y, 4 / state.zoom);
      state.__hover = found;
      
      if (found) {
        showTooltip(e.clientX, e.clientY, tooltipText(state, found));
      } else {
        hideTooltip();
      }
      debouncedDraw(onDraw);
    } catch (error) {
      console.warn('Ошибка при обработке hover:', error);
    }
  }, { passive: true });
  
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const k = Math.exp(-e.deltaY * 0.0015);
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * dpr, my = (e.clientY - rect.top) * dpr;
    const x = (mx - state.pan.x) / (state.zoom * dpr);
    const y = (canvas.height - my - state.pan.y) / (state.zoom * dpr);
    
    state.zoom *= k; 
    state.zoom = clamp(state.zoom, 0.05, 50);
    
    const nx = x * state.zoom * dpr + state.pan.x;
    const ny = canvas.height - (y * state.zoom * dpr + state.pan.y);
    state.pan.x += mx - nx; 
    state.pan.y += my - ny; 
    
    debouncedDraw(onDraw);
  }, { passive: false });
}

/**
 * Создаёт текст для tooltip
 * @param {Object} state - Состояние приложения
 * @param {Object} h - Объект hover
 * @returns {string} Текст tooltip
 */
function tooltipText(state, h) {
  try {
    const e = state.parsed.entities[h.id];
    if (!e) return '';
    const base = `${e.type} • L=${(e.len || 0).toFixed(3)} м`;
    return base;
  } catch (error) {
    console.warn('Ошибка при создании tooltip:', error);
    return '';
  }
}

/**
 * Показывает tooltip
 * @param {number} x - X координата
 * @param {number} y - Y координата
 * @param {string} html - HTML содержимое
 */
function showTooltip(x, y, html) {
  try {
    const tt = document.getElementById('tooltip');
    if (!tt) return;
    tt.innerHTML = html;
    tt.style.display = 'block';
    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
  } catch (error) {
    console.warn('Ошибка при показе tooltip:', error);
  }
}

/**
 * Скрывает tooltip
 */
function hideTooltip() {
  try {
    const tt = document.getElementById('tooltip');
    if (tt) tt.style.display = 'none';
  } catch (error) {
    console.warn('Ошибка при скрытии tooltip:', error);
  }
}

/**
 * Строит пути для рендеринга с оптимизацией производительности
 * @param {Object} state - Состояние приложения
 */
export function buildPaths(state) {
  if (!state.parsed || !state.parsed.entities) {
    state.paths = [];
    state.piercePaths = [];
    state.index = null;
    return;
  }
  
  try {
    state.paths = [];
    state.piercePaths = [];
    const ents = state.parsed.entities;
    
    // Ограничение на количество сущностей для производительности
    const maxEntities = 10000;
    const entitiesToProcess = ents.length > maxEntities ? ents.slice(0, maxEntities) : ents;
    
    for (const e of entitiesToProcess) {
      if (!e || !e.raw) continue;
      
      try {
        const p = new Path2D();
        
        switch (e.type) {
          case 'LINE': {
            const { x1, y1, x2, y2 } = e.raw;
            p.moveTo(x1, y1);
            p.lineTo(x2, y2);
            break;
          }
          case 'CIRCLE': {
            const { cx, cy, r } = e.raw;
            p.moveTo(cx + r, cy);
            p.arc(cx, cy, r, 0, Math.PI * 2, false);
            break;
          }
          case 'ARC': {
            const { cx, cy, r, a1 = 0, a2 = 0 } = e.raw;
            let A1 = a1 * Math.PI / 180, A2 = a2 * Math.PI / 180;
            let d = A2 - A1;
            if (d < 0) d += 2 * Math.PI;
            
            // Оптимизация количества шагов для больших дуг
            const maxSteps = 360;
            const minSteps = 12;
            const steps = Math.max(minSteps, Math.min(maxSteps, Math.ceil((r * d) / 1.5)));
            
            for (let k = 0; k <= steps; k++) {
              const a = A1 + d * (k / steps);
              const x = cx + r * Math.cos(a);
              const y = cy + r * Math.sin(a);
              if (k === 0) p.moveTo(x, y);
              else p.lineTo(x, y);
            }
            break;
          }
          case 'POLY': {
            const pts = e.raw.pts || [];
            if (pts.length) {
              p.moveTo(pts[0].x, pts[0].y);
              for (let i = 1; i < pts.length; i++) {
                p.lineTo(pts[i].x, pts[i].y);
              }
              if (e.raw.closed) p.closePath();
            }
            break;
          }
        }
        
        state.paths.push(p);
      } catch (error) {
        console.warn('Ошибка при создании пути для сущности:', e, error);
      }
    }
    
    // Обработка точек врезки
    const piercePts = state.parsed.piercePts || [];
    const maxPiercePoints = 1000; // Ограничение для производительности
    const piercePointsToProcess = piercePts.length > maxPiercePoints ? 
      piercePts.slice(0, maxPiercePoints) : piercePts;
    
    for (const pt of piercePointsToProcess) {
      try {
        const pp = new Path2D();
        const r = 3;
        pp.moveTo(pt[0] + r, pt[1]);
        pp.arc(pt[0], pt[1], r, 0, Math.PI * 2, false);
        state.piercePaths.push(pp);
      } catch (error) {
        console.warn('Ошибка при создании пути врезки:', pt, error);
      }
    }
    
    state.index = buildIndex(state);
    
    if (ents.length > maxEntities) {
      console.warn(`Ограничено количество сущностей: ${maxEntities} из ${ents.length}`);
    }
    
    if (piercePts.length > maxPiercePoints) {
      console.warn(`Ограничено количество точек врезки: ${maxPiercePoints} из ${piercePts.length}`);
    }
    
  } catch (error) {
    console.error('Ошибка при построении путей:', error);
    state.paths = [];
    state.piercePaths = [];
    state.index = null;
  }
}

/**
 * Строит индекс для быстрого поиска
 * @param {Object} state - Состояние приложения
 * @returns {Object} Индекс
 */
function buildIndex(state) {
  if (!state.parsed || !state.parsed.entities) return null;
  
  try {
    const index = [];
    const ents = state.parsed.entities;
    
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e || !e.raw) continue;
      
      try {
        let bounds = null;
        
        switch (e.type) {
          case 'LINE': {
            const { x1, y1, x2, y2 } = e.raw;
            bounds = {
              minX: Math.min(x1, x2),
              minY: Math.min(y1, y2),
              maxX: Math.max(x1, x2),
              maxY: Math.max(y1, y2)
            };
            break;
          }
          case 'CIRCLE': {
            const { cx, cy, r } = e.raw;
            bounds = {
              minX: cx - r,
              minY: cy - r,
              maxX: cx + r,
              maxY: cy + r
            };
            break;
          }
          case 'ARC': {
            const { cx, cy, r } = e.raw;
            bounds = {
              minX: cx - r,
              minY: cy - r,
              maxX: cx + r,
              maxY: cy + r
            };
            break;
          }
          case 'POLY': {
            const pts = e.raw.pts || [];
            if (pts.length > 0) {
              let minX = pts[0].x, minY = pts[0].y, maxX = pts[0].x, maxY = pts[0].y;
              for (const p of pts) {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
              }
              bounds = { minX, minY, maxX, maxY };
            }
            break;
          }
        }
        
        if (bounds) {
          index.push({ id: i, ...bounds });
        }
      } catch (error) {
        console.warn('Ошибка при индексации сущности:', e, error);
      }
    }
    
    return index;
  } catch (error) {
    console.error('Ошибка при построении индекса:', error);
    return null;
  }
}

/**
 * Тест попадания точки в сущность
 * @param {Object} state - Состояние приложения
 * @param {number} x - X координата
 * @param {number} y - Y координата
 * @param {number} tolerance - Допуск
 * @returns {Object|null} Найденная сущность или null
 */
function hitTest(state, x, y, tolerance) {
  if (!state.index) return null;
  
  try {
    for (const item of state.index) {
      if (x >= item.minX - tolerance && x <= item.maxX + tolerance &&
          y >= item.minY - tolerance && y <= item.maxY + tolerance) {
        return item;
      }
    }
    return null;
  } catch (error) {
    console.warn('Ошибка при hit test:', error);
    return null;
  }
}

/**
 * Рисует сущности на canvas
 * @param {Object} state - Состояние приложения
 * @param {HTMLCanvasElement} canvas - Canvas элемент
 * @param {boolean} showAnnotations - Показывать ли аннотации (метки врезок и номера объектов)
 */
export function drawEntities(state, canvas, showAnnotations = false) {
  if (!canvas || !canvas.getContext) {
    console.error('Canvas не поддерживается');
    return;
  }
  
  const ctx = canvas.getContext('2d');
  
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!state.paths || state.paths.length === 0) {
      return;
    }
    
    state.__world();
    
    // Рисование основных путей
    ctx.strokeStyle = '#4f8cff';
    ctx.lineWidth = 0.5 / state.zoom;
    ctx.fillStyle = 'transparent';
    
    for (const path of state.paths) {
      try {
        ctx.stroke(path);
      } catch (error) {
        console.warn('Ошибка при рисовании пути:', error);
      }
    }
    
    // Рисование путей врезки
    if (state.piercePaths && state.piercePaths.length > 0) {
      ctx.strokeStyle = '#ff6060';
      ctx.fillStyle = 'rgba(255, 96, 96, 0.4)';
      
      for (const path of state.piercePaths) {
        try {
          ctx.fill(path);
          ctx.stroke(path);
        } catch (error) {
          console.warn('Ошибка при рисовании пути врезки:', error);
        }
      }
    }
    
    // Подсветка hover элемента
    if (state.__hover) {
      try {
        const hoverPath = state.paths[state.__hover.id];
        if (hoverPath) {
          ctx.strokeStyle = '#ffcd3c';
          ctx.lineWidth = 1.0 / state.zoom;
          ctx.stroke(hoverPath);
        }
      } catch (error) {
        console.warn('Ошибка при подсветке hover:', error);
      }
    }
    
    // Отображение аннотаций если включен режим аннотации
    if (showAnnotations) {
      drawAnnotations(state, canvas, ctx);
    }
    
  } catch (error) {
    console.error('Ошибка при рисовании сущностей:', error);
    // Fallback: показать сообщение об ошибке
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ff5c5c';
    ctx.font = '14px system-ui';
    ctx.fillText('Ошибка отрисовки', 18, 28);
  }
}

/**
 * Отображает аннотации на canvas (метки врезок и номера объектов)
 * @param {Object} state - Состояние приложения
 * @param {HTMLCanvasElement} canvas - Canvas элемент
 * @param {CanvasRenderingContext2D} ctx - Контекст canvas
 */
function drawAnnotations(state, canvas, ctx) {
  if (!state.parsed) return;
  
  try {
    // Отображение меток врезок
    if (state.parsed.piercePts && state.parsed.piercePts.length > 0) {
      drawPierceAnnotations(state, canvas, ctx);
    }
    
    // Отображение номеров объектов (только при малом количестве)
    if (state.parsed.entities && state.parsed.entities.length <= 50) {
      drawEntityNumbers(state, canvas, ctx);
    }
    
  } catch (error) {
    console.warn('Ошибка при отображении аннотаций:', error);
  }
}

/**
 * Отображает метки точек врезки
 * @param {Object} state - Состояние приложения
 * @param {HTMLCanvasElement} canvas - Canvas элемент
 * @param {CanvasRenderingContext2D} ctx - Контекст canvas
 */
function drawPierceAnnotations(state, canvas, ctx) {
  const piercePts = state.parsed.piercePts;
  const maxLabels = 100; // Ограничение для производительности
  const limit = Math.min(piercePts.length, maxLabels);
  
  // Настройки текста
  const fontSize = Math.max(8, 12 / state.zoom);
  ctx.font = `${fontSize}px system-ui`;
  ctx.fillStyle = '#ff8080';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2 / state.zoom;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  for (let i = 0; i < limit; i++) {
    const pt = piercePts[i];
    if (!pt || !Array.isArray(pt) || pt.length < 2) continue;
    
    try {
      const label = `P${i + 1}`;
      
      // Обводка текста для лучшей читаемости
      ctx.strokeText(label, pt[0], pt[1]);
      ctx.fillText(label, pt[0], pt[1]);
      
    } catch (error) {
      console.warn('Ошибка при отображении метки врезки:', error);
    }
  }
  
  if (piercePts.length > maxLabels) {
    console.warn(`Ограничено количество меток врезок: ${maxLabels} из ${piercePts.length}`);
  }
}

/**
 * Отображает номера объектов
 * @param {Object} state - Состояние приложения
 * @param {HTMLCanvasElement} canvas - Canvas элемент
 * @param {CanvasRenderingContext2D} ctx - Контекст canvas
 */
function drawEntityNumbers(state, canvas, ctx) {
  const entities = state.parsed.entities;
  
  // Настройки текста
  const fontSize = Math.max(6, 10 / state.zoom);
  ctx.font = `${fontSize}px system-ui`;
  ctx.fillStyle = '#9db4ff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1 / state.zoom;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    if (!entity || !entity.start) continue;
    
    try {
      const label = `${i + 1}`;
      const x = entity.start[0];
      const y = entity.start[1];
      
      // Обводка текста
      ctx.strokeText(label, x, y);
      ctx.fillText(label, x, y);
      
    } catch (error) {
      console.warn('Ошибка при отображении номера объекта:', error);
    }
  }
}

/**
 * Подгоняет вид к содержимому
 * @param {Object} state - Состояние приложения
 * @param {HTMLCanvasElement} canvas - Canvas элемент
 */
export function fitView(state, canvas) {
  if (!state.parsed || !state.parsed.entities || !canvas) return;
  
  try {
    const ents = state.parsed.entities;
    if (ents.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const e of ents) {
      if (!e || !e.raw) continue;
      
      try {
        switch (e.type) {
          case 'LINE': {
            const { x1, y1, x2, y2 } = e.raw;
            minX = Math.min(minX, x1, x2);
            minY = Math.min(minY, y1, y2);
            maxX = Math.max(maxX, x1, x2);
            maxY = Math.max(maxY, y1, y2);
            break;
          }
          case 'CIRCLE': {
            const { cx, cy, r } = e.raw;
            minX = Math.min(minX, cx - r);
            minY = Math.min(minY, cy - r);
            maxX = Math.max(maxX, cx + r);
            maxY = Math.max(maxY, cy + r);
            break;
          }
          case 'ARC': {
            const { cx, cy, r } = e.raw;
            minX = Math.min(minX, cx - r);
            minY = Math.min(minY, cy - r);
            maxX = Math.max(maxX, cx + r);
            maxY = Math.max(maxY, cy + r);
            break;
          }
          case 'POLY': {
            const pts = e.raw.pts || [];
            for (const p of pts) {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            }
            break;
          }
        }
      } catch (error) {
        console.warn('Ошибка при вычислении bounds для fitView:', error);
      }
    }
    
    if (minX === Infinity) return;
    
    const width = maxX - minX;
    const height = maxY - minY;
    const padding = Math.max(width, height) * 0.1;
    
    const canvasWidth = canvas.width / dpr;
    const canvasHeight = canvas.height / dpr;
    
    const scaleX = canvasWidth / (width + 2 * padding);
    const scaleY = canvasHeight / (height + 2 * padding);
    const scale = Math.min(scaleX, scaleY, 50); // Ограничение максимального зума
    
    state.zoom = scale;
    state.pan.x = canvas.width / 2 - (minX + width / 2) * scale * dpr;
    state.pan.y = canvas.height / 2 + (minY + height / 2) * scale * dpr;
    
  } catch (error) {
    console.error('Ошибка при fitView:', error);
  }
}

/**
 * Рисует метки врезок
 * @param {Object} state - Состояние приложения
 * @param {HTMLCanvasElement} canvas - Canvas элемент
 */
export function drawPierceLabels(state, canvas) {
  if (!canvas || !canvas.getContext || !state.parsed || !state.parsed.piercePts) {
    return;
  }
  
  const ctx = canvas.getContext('2d');
  
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const piercePts = state.parsed.piercePts;
    const limit = Math.min(piercePts.length, 600); // Ограничение для производительности
    
    ctx.font = `${12 * (window.devicePixelRatio || 1)}px system-ui`;
    ctx.fillStyle = '#ff8080';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i < limit; i++) {
      try {
        const pt = piercePts[i];
        if (!pt || !Array.isArray(pt) || pt.length < 2) continue;
        
        const screenPt = worldToScreen(state, canvas, pt[0], pt[1]);
        if (screenPt) {
          ctx.fillText(`P${i + 1}`, screenPt.x, screenPt.y);
        }
      } catch (error) {
        console.warn('Ошибка при рисовании метки врезки:', error);
      }
    }
    
    if (piercePts.length > limit) {
      console.warn(`Ограничено количество меток врезок: ${limit} из ${piercePts.length}`);
    }
    
  } catch (error) {
    console.error('Ошибка при рисовании меток врезок:', error);
  }
}

/**
 * Преобразует мировые координаты в экранные
 * @param {Object} state - Состояние приложения
 * @param {HTMLCanvasElement} canvas - Canvas элемент
 * @param {number} x - X координата
 * @param {number} y - Y координата
 * @returns {Object|null} Экранные координаты или null
 */
function worldToScreen(state, canvas, x, y) {
  try {
    if (!canvas.width || !canvas.height) return null;
    
    const screenX = x * state.zoom * dpr + state.pan.x;
    const screenY = canvas.height - (y * state.zoom * dpr + state.pan.y);
    
    return { x: screenX, y: screenY };
  } catch (error) {
    console.warn('Ошибка при преобразовании координат:', error);
    return null;
  }
}
