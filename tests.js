import { near } from './utils.js';
import { calcCutParams, getSupportedPowers, getSupportedGases, getMaxThickness } from './cost.js';
import { computeNesting, partBBox, calculateEfficiency } from './nesting.js';

/**
 * Запускает все тесты приложения
 * @param {Object} params - Параметры для тестов
 * @returns {Function} Функция для запуска тестов
 */
export function makeRunTests({ parseDXF: parseDXFMainThread, sanitizeParsed, computeNesting: computeNestingParam }){
  return async function runTests(){
    const card = document.getElementById('testsCard'); 
    if (card) card.hidden = false;
    
    const out = document.getElementById('testsOut'); 
    if (out) {
      out.textContent = 'Выполняю…'; 
      out.innerHTML = '';
    }

    let passed = 0, failed = 0;

    // Тесты парсера DXF
    const parserCases = [
      {
        name: 'LINE + CIRCLE', 
        dxf: sampleLineCircle(), 
        expect: (r) => near(r.totalLen, 0.298501, 0.005) && r.entities.length >= 2
      },
      {
        name: 'LWPOLYLINE (прямоугольник 100x50, замкнутый)', 
        dxf: sampleLWPoly(), 
        expect: (r) => near(r.totalLen, 0.300, 0.005) && r.entities.find(e => e.type === 'POLY')
      },
      {
        name: 'ARC полукруг r=10', 
        dxf: sampleArcHalf(), 
        expect: (r) => near(r.totalLen, 0.031416, 0.002) && r.entities.find(e => e.type === 'ARC')
      },
      {
        name: 'ARC 350→10 (20° дуга)', 
        dxf: sampleArcWrap(), 
        expect: (r) => r.entities.find(e => e.type === 'ARC') && near(r.totalLen, 0.003491, 0.0005)
      },
      {
        name: 'ARC 0→270 (3/4 окружности)', 
        dxf: sampleArc270(), 
        expect: (r) => r.entities.find(e => e.type === 'ARC') && near(r.totalLen, 0.047124, 0.001)
      },
      {
        name: 'Пустой ENTITIES', 
        dxf: sampleEmptyEntities(), 
        expect: (r) => r.entities.length === 0 && r.pierceCount === 0
      },
      {
        name: 'lowercase section/entities/endsec + lowercase entities', 
        dxf: sampleLowercaseDXF(), 
        expect: (r) => r.entities.length === 2 && near(r.totalLen, 0.298501, 0.005)
      }
    ];

    // Тесты расчётов стоимости
    const costCases = [
      {
        name: 'Корректные параметры резки (1.5кВт, 5мм, азот)',
        test: () => {
          const result = calcCutParams(1.5, 5, 'nitrogen');
          return result.can === true && result.speed > 0 && result.pierce > 0;
        }
      },
      {
        name: 'Недопустимая толщина (1.5кВт, 20мм, азот)',
        test: () => {
          const result = calcCutParams(1.5, 20, 'nitrogen');
          return result.can === false && result.reason.includes('Недостаточная мощность');
        }
      },
      {
        name: 'Недопустимая мощность (5кВт, 5мм, азот)',
        test: () => {
          const result = calcCutParams(5, 5, 'nitrogen');
          return result.can === false && result.reason.includes('Неподдерживаемая мощность');
        }
      },
      {
        name: 'Недопустимый газ (1.5кВт, 5мм, helium)',
        test: () => {
          const result = calcCutParams(1.5, 5, 'helium');
          return result.can === false && result.reason.includes('Неподдерживаемый тип газа');
        }
      },
      {
        name: 'Отрицательная толщина (1.5кВт, -5мм, азот)',
        test: () => {
          const result = calcCutParams(1.5, -5, 'nitrogen');
          return result.can === false && result.reason.includes('Толщина должна быть положительным числом');
        }
      },
      {
        name: 'Поддерживаемые мощности',
        test: () => {
          const powers = getSupportedPowers();
          return Array.isArray(powers) && powers.length > 0 && powers.includes(1.5);
        }
      },
      {
        name: 'Поддерживаемые газы',
        test: () => {
          const gases = getSupportedGases();
          return Array.isArray(gases) && gases.includes('nitrogen') && gases.includes('oxygen');
        }
      },
      {
        name: 'Максимальная толщина',
        test: () => {
          const maxTh = getMaxThickness(1.5, 'nitrogen');
          return typeof maxTh === 'number' && maxTh > 0;
        }
      }
    ];

    // Тесты раскладки
    const nestingCases = [
      {
        name: 'Нестинг 0° 60×40 / 35×20 → 2/лист',
        test: () => {
          const r = computeNesting(60, 40, 0, 0, 999, 35, 20, [0]);
          return r.placed === 2;
        }
      },
      {
        name: 'Нестинг 0/90° 60×40 / 35×20 → 3/лист',
        test: () => {
          const r = computeNesting(60, 40, 0, 0, 999, 35, 20, [0, 90]);
          return r.placed === 3;
        }
      },
      {
        name: 'Нестинг с отступами и зазорами',
        test: () => {
          const r = computeNesting(100, 100, 10, 5, 10, 20, 15, [0]);
          return r.placed > 0 && r.m === 10 && r.g === 5;
        }
      },
      {
        name: 'Bounding box для пустых данных',
        test: () => {
          const bbox = partBBox({ entities: [] });
          return bbox.w === 0 && bbox.h === 0;
        }
      },
      {
        name: 'Эффективность раскладки',
        test: () => {
          const nesting = computeNesting(100, 100, 0, 0, 1, 50, 50, [0]);
          const eff = calculateEfficiency(nesting);
          return typeof eff === 'number' && eff >= 0 && eff <= 100;
        }
      },
      {
        name: 'Валидация входных параметров раскладки',
        test: () => {
          const r1 = computeNesting(-10, 100, 0, 0, 1, 50, 50, [0]);
          const r2 = computeNesting(100, -10, 0, 0, 1, 50, 50, [0]);
          return r1.placed === 0 && r2.placed === 0;
        }
      }
    ];

    // Выполнение тестов парсера
    console.log('Запуск тестов парсера DXF...');
    for (let i = 0; i < parserCases.length; i++) {
      const t = parserCases[i];
      try {
        const parsed = sanitizeParsed(await parseDXFMainThread(t.dxf));
        const ok = !!t.expect(parsed);
        if (out) out.innerHTML += `<div>${ok ? '✅' : '❌'} ${t.name}</div>`;
        ok ? passed++ : failed++;
      } catch (e) {
        if (out) out.innerHTML += `<div>❌ ${t.name} (ошибка: ${e.message})</div>`;
        failed++;
        console.error(`Ошибка в тесте "${t.name}":`, e);
      }
    }

    // Выполнение тестов расчётов стоимости
    console.log('Запуск тестов расчётов стоимости...');
    for (let i = 0; i < costCases.length; i++) {
      const t = costCases[i];
      try {
        const ok = t.test();
        if (out) out.innerHTML += `<div>${ok ? '✅' : '❌'} ${t.name}</div>`;
        ok ? passed++ : failed++;
      } catch (e) {
        if (out) out.innerHTML += `<div>❌ ${t.name} (ошибка: ${e.message})</div>`;
        failed++;
        console.error(`Ошибка в тесте "${t.name}":`, e);
      }
    }

    // Выполнение тестов раскладки
    console.log('Запуск тестов раскладки...');
    for (let i = 0; i < nestingCases.length; i++) {
      const t = nestingCases[i];
      try {
        const ok = t.test();
        if (out) out.innerHTML += `<div>${ok ? '✅' : '❌'} ${t.name}</div>`;
        ok ? passed++ : failed++;
      } catch (e) {
        if (out) out.innerHTML += `<div>❌ ${t.name} (ошибка: ${e.message})</div>`;
        failed++;
        console.error(`Ошибка в тесте "${t.name}":`, e);
      }
    }

    // Итоговый результат
    if (out) {
      out.innerHTML += `<div style="margin-top: 10px; font-weight: bold;">
        Итог: <span class="test-pass">${passed} PASS</span>, <span class="test-fail">${failed} FAIL</span>
      </div>`;
    }

    console.log(`Тесты завершены: ${passed} успешно, ${failed} неудачно`);
    
    // Возвращаем результат для возможного использования
    return { passed, failed, total: passed + failed };
  };
}

// Вспомогательные функции для создания тестовых DXF
const sampleHeader = () => `0\nSECTION\n2\nENTITIES\n`;
const sampleFooter = () => `0\nENDSEC\n0\nEOF\n`;

function sampleLineCircle() {
  return sampleHeader() + 
         `0\nLINE\n10\n0\n20\n0\n11\n100\n21\n100\n` +
         `0\nCIRCLE\n10\n50\n20\n50\n40\n25\n` + 
         sampleFooter();
}

function sampleLWPoly() {
  return sampleHeader() + 
         `0\nLWPOLYLINE\n70\n1\n10\n0\n20\n0\n10\n100\n20\n0\n10\n100\n20\n50\n10\n0\n20\n50\n` + 
         sampleFooter();
}

function sampleArcHalf() {
  return sampleHeader() + 
         `0\nARC\n10\n0\n20\n0\n40\n10\n50\n0\n51\n180\n` + 
         sampleFooter();
}

function sampleArcWrap() {
  return sampleHeader() + 
         `0\nARC\n10\n0\n20\n0\n40\n10\n50\n350\n51\n10\n` + 
         sampleFooter();
}

function sampleArc270() {
  return sampleHeader() + 
         `0\nARC\n10\n0\n20\n0\n40\n10\n50\n0\n51\n270\n` + 
         sampleFooter();
}

function sampleEmptyEntities() { 
  return sampleHeader() + sampleFooter(); 
}

function sampleLowercaseDXF() {
  return `0\nsection\n2\nentities\n` +
         `0\nline\n10\n0\n20\n0\n11\n100\n21\n100\n` +
         `0\ncircle\n10\n50\n20\n50\n40\n25\n` +
         `0\nendsec\n0\neof\n`;
}
