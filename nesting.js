/**
 * @typedef {Object} BoundingBox
 * @property {number} w - Ширина
 * @property {number} h - Высота
 * @property {number} minX - Минимальная X координата
 * @property {number} minY - Минимальная Y координата
 */

/**
 * @typedef {Object} GridResult
 * @property {number} cols - Количество колонок
 * @property {number} rows - Количество строк
 * @property {number} placed - Размещённое количество деталей
 * @property {Array.<{x: number, y: number}>} positions - Позиции деталей
 * @property {number} workW - Рабочая ширина
 * @property {number} workH - Рабочая высота
 */

/**
 * @typedef {Object} NestingResult
 * @property {number} cols - Количество колонок
 * @property {number} rows - Количество строк
 * @property {number} placed - Размещённое количество деталей
 * @property {number} rot - Оптимальный поворот
 * @property {number} pw - Ширина детали
 * @property {number} ph - Высота детали
 * @property {Array.<{x: number, y: number}>} positions - Позиции деталей
 * @property {number} sheets - Количество листов
 * @property {number} W - Ширина листа
 * @property {number} H - Высота листа
 * @property {number} m - Отступ
 * @property {number} g - Зазор
 * @property {Array.<number>} rotations - Использованные повороты
 */

/**
 * Вычисляет bounding box для детали
 * @param {Object} parsed - Результат парсинга DXF
 * @returns {BoundingBox} Bounding box детали
 */
export function partBBox(parsed) {
  if (!parsed || !parsed.entities || !Array.isArray(parsed.entities)) {
    return { w: 0, h: 0, minX: 0, minY: 0 };
  }
  
  const b = bounds(parsed.entities);
  
  // Проверка валидности bounds
  const hasBounds = b.minX < Infinity && b.minY < Infinity && 
                   b.maxX > -Infinity && b.maxY > -Infinity;
  
  if (!hasBounds) {
    return { w: 0, h: 0, minX: 0, minY: 0 };
  }
  
  return {
    w: Math.max(0, b.maxX - b.minX),
    h: Math.max(0, b.maxY - b.minY),
    minX: b.minX,
    minY: b.minY
  };
}

/**
 * Вычисляет bounding box для массива сущностей
 * @param {Array} ents - Массив сущностей DXF
 * @returns {Object} Bounding box
 */
function bounds(ents) {
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
      console.warn('Ошибка при обработке сущности:', e, error);
    }
  }
  
  return { minX, minY, maxX, maxY };
}

/**
 * Вычисляет сеточную раскладку деталей
 * @param {number} W - Ширина листа
 * @param {number} H - Высота листа
 * @param {number} m - Отступ от края
 * @param {number} g - Зазор между деталями
 * @param {number} pw - Ширина детали
 * @param {number} ph - Высота детали
 * @param {number} qty - Количество деталей
 * @returns {GridResult} Результат сеточной раскладки
 */
export function computeGrid(W, H, m, g, pw, ph, qty) {
  // Валидация входных параметров
  if (typeof W !== 'number' || !isFinite(W) || W <= 0) {
    return { cols: 0, rows: 0, placed: 0, positions: [], workW: 0, workH: 0 };
  }
  if (typeof H !== 'number' || !isFinite(H) || H <= 0) {
    return { cols: 0, rows: 0, placed: 0, positions: [], workW: 0, workH: 0 };
  }
  if (typeof m !== 'number' || !isFinite(m) || m < 0) m = 0;
  if (typeof g !== 'number' || !isFinite(g) || g < 0) g = 0;
  if (typeof pw !== 'number' || !isFinite(pw) || pw <= 0) {
    return { cols: 0, rows: 0, placed: 0, positions: [], workW: 0, workH: 0 };
  }
  if (typeof ph !== 'number' || !isFinite(ph) || ph <= 0) {
    return { cols: 0, rows: 0, placed: 0, positions: [], workW: 0, workH: 0 };
  }
  if (typeof qty !== 'number' || !isFinite(qty) || qty < 0) qty = 0;
  
  const workW = W - 2 * m;
  const workH = H - 2 * m;
  
  if (workW <= 0 || workH <= 0) {
    return { cols: 0, rows: 0, placed: 0, positions: [], workW, workH };
  }
  
  // Вычисление количества колонок и строк
  const cols = Math.max(0, Math.floor((workW + g) / (pw + g)));
  const rows = Math.max(0, Math.floor((workH + g) / (ph + g)));
  const capacity = cols * rows;
  const placed = Math.min(qty, capacity);
  
  // Генерация позиций
  const positions = [];
  let n = 0;
  
  for (let r = 0; r < rows && n < placed; r++) {
    for (let c = 0; c < cols && n < placed; c++) {
      positions.push({
        x: m + c * (pw + g),
        y: m + r * (ph + g)
      });
      n++;
    }
  }
  
  return { cols, rows, placed, positions, workW, workH };
}

/**
 * Вычисляет оптимальную раскладку деталей с учётом поворотов
 * @param {number} W - Ширина листа
 * @param {number} H - Высота листа
 * @param {number} m - Отступ от края
 * @param {number} g - Зазор между деталями
 * @param {number} qty - Количество деталей
 * @param {number} pw - Ширина детали
 * @param {number} ph - Высота детали
 * @param {Array.<number>} rotations - Доступные повороты в градусах
 * @returns {NestingResult} Результат раскладки
 */
export function computeNesting(W, H, m, g, qty, pw, ph, rotations = [0, 90]) {
  // Валидация входных параметров
  if (!Array.isArray(rotations) || rotations.length === 0) {
    rotations = [0, 90];
  }
  
  const opts = [];
  const rotSet = Array.from(new Set(rotations.map(r => ((r % 360) + 360) % 360)));
  
  // Вычисление вариантов для каждого поворота
  for (const r of rotSet) {
    const w = (r === 90 || r === 270) ? ph : pw;
    const h = (r === 90 || r === 270) ? pw : ph;
    const gridRes = computeGrid(W, H, m, g, w, h, qty);
    opts.push({ ...gridRes, rot: r, pw: w, ph: h });
  }
  
  // Сортировка по эффективности (количество размещённых деталей, затем по площади)
  opts.sort((a, b) => {
    if (b.placed !== a.placed) return b.placed - a.placed;
    return (b.workW * b.workH) - (a.workW * a.workH);
  });
  
  const best = opts[0] || {
    cols: 0, rows: 0, placed: 0, rot: 0, pw, ph, positions: [],
    workW: 0, workH: 0
  };
  
  // Вычисление количества листов
  const sheets = Math.max(1, Math.ceil(qty / Math.max(best.placed, 1)));
  
  return {
    ...best,
    sheets,
    W, H, m, g,
    rotations: rotSet
  };
}

/**
 * Рисует раскладку на canvas
 * @param {Object} state - Состояние приложения
 * @param {HTMLCanvasElement} canvas - Canvas для рисования
 */
export function drawNesting(state, canvas) {
  if (!canvas || !canvas.getContext) {
    console.error('Canvas не поддерживается');
    return;
  }
  
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const n = state.nesting;
  if (!n) {
    ctx.fillStyle = '#7180a3';
    ctx.font = '14px system-ui';
    ctx.fillText('Сначала рассчитайте раскладку', 18, 28);
    return;
  }
  
  try {
    const pad = 30 * (window.devicePixelRatio || 1);
    const k = Math.min((canvas.width - 2 * pad) / n.W, (canvas.height - 2 * pad) / n.H);
    const ox = (canvas.width - n.W * k) / 2;
    const oy = (canvas.height - n.H * k) / 2;
    
    // Рисование листа
    ctx.fillStyle = '#101828';
    ctx.strokeStyle = '#2b3753';
    ctx.lineWidth = 2;
    ctx.fillRect(ox, oy, n.W * k, n.H * k);
    ctx.strokeRect(ox, oy, n.W * k, n.H * k);
    
    // Рисование рабочей области
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = '#394b78';
    ctx.strokeRect(ox + n.m * k, oy + n.m * k, (n.W - 2 * n.m) * k, (n.H - 2 * n.m) * k);
    ctx.setLineDash([]);
    
    // Рисование деталей
    ctx.strokeStyle = '#77a1ff';
    ctx.fillStyle = 'rgba(109,140,255,0.18)';
    ctx.lineWidth = 2;
    
    const pw = n.pw;
    const ph = n.ph;
    
    for (let i = 0; i < n.positions.length; i++) {
      const p = n.positions[i];
      const x = ox + p.x * k;
      const y = oy + p.y * k;
      const w = pw * k;
      const h = ph * k;
      
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      
      // Номер детали
      ctx.fillStyle = '#d7e0ff';
      ctx.font = `${12 * (window.devicePixelRatio || 1)}px system-ui`;
      ctx.fillText(String(i + 1), x + 4, y + 14);
      ctx.fillStyle = 'rgba(109,140,255,0.18)';
    }
  } catch (error) {
    console.error('Ошибка при рисовании раскладки:', error);
    ctx.fillStyle = '#ff5c5c';
    ctx.font = '14px system-ui';
    ctx.fillText('Ошибка отрисовки', 18, 28);
  }
}

/**
 * Создаёт отчёт по раскладке
 * @param {Object} state - Состояние приложения
 * @returns {string} Текстовый отчёт
 */
export function makeNestingReport(state) {
  const n = state.nesting;
  if (!n) return 'Нет раскладки';
  
  try {
    const lines = [];
    lines.push('=== ОТЧЁТ ПО РАСКЛАДКЕ ===');
    lines.push(`Размер листа: ${n.W} x ${n.H} мм, отступ ${n.m} мм, зазор ${n.g} мм`);
    lines.push(`Поворот детали: ${n.rot}°`);
    lines.push(`На листе: ${n.placed} шт (сетка ${n.cols} x ${n.rows})`);
    lines.push(`Нужно листов: ${n.sheets}`);
    
    const usedArea = n.placed * (n.pw * n.ph);
    const totalArea = n.W * n.H;
    const eff = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;
    
    lines.push(`Эффективность площади: ${eff.toFixed(1)}%`);
    lines.push(`Использованная площадь: ${usedArea.toFixed(0)} мм²`);
    lines.push(`Общая площадь листа: ${totalArea.toFixed(0)} мм²`);
    
    return lines.join('\n');
  } catch (error) {
    console.error('Ошибка при создании отчёта:', error);
    return 'Ошибка создания отчёта';
  }
}

/**
 * Вычисляет эффективность раскладки
 * @param {NestingResult} nesting - Результат раскладки
 * @returns {number} Эффективность в процентах
 */
export function calculateEfficiency(nesting) {
  if (!nesting || !nesting.placed || !nesting.pw || !nesting.ph || !nesting.W || !nesting.H) {
    return 0;
  }
  
  const usedArea = nesting.placed * (nesting.pw * nesting.ph);
  const totalArea = nesting.W * nesting.H;
  
  return totalArea > 0 ? (usedArea / totalArea) * 100 : 0;
}
