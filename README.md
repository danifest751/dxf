# DXF PRO - PDF Generation Test

## How to Test PDF Generation

Since modern browsers block loading ES6 modules from local files due to CORS restrictions, you need to serve the files through a web server.

### Option 1: Using the Batch Files (Windows)

Double-click on one of these batch files to start the server:

- `start-server.bat` - Starts the Node.js server (requires Node.js to be installed)
- `start-python-server.bat` - Starts the Python server (requires Python to be installed)

Then open your browser and go to:
- http://localhost:8000/simple-pdf-test.html - Test PDF generation with a simple test
- http://localhost:8000/pdf-test-no-modules.html - Test PDF generation without modules
- http://localhost:8000/index.html - Main application

### Option 2: Using Node.js Server (Manual)

1. Make sure you have Node.js installed on your system
2. Open a terminal/command prompt in the `c:\calc` directory
3. Run the server:
   ```
   node server.js
   ```
4. Open your browser and go to:
   - http://localhost:8000/simple-pdf-test.html - Test PDF generation with a simple test
   - http://localhost:8000/pdf-test-no-modules.html - Test PDF generation without modules
   - http://localhost:8000/index.html - Main application

### Option 3: Using Python Server (Manual)

If you have Python installed:

1. Open a terminal/command prompt in the `c:\calc` directory
2. Run the server:
   ```
   python start-server.py
   ```
   or
   ```
   python -m http.server 8000
   ```
3. Open your browser and go to:
   - http://localhost:8000/simple-pdf-test.html - Test PDF generation with a simple test
   - http://localhost:8000/pdf-test-no-modules.html - Test PDF generation without modules
   - http://localhost:8000/index.html - Main application

## Testing PDF Generation

1. Open http://localhost:8000/simple-pdf-test.html in your browser
2. Click on the "Сгенерировать тестовый PDF" button
3. The PDF should be automatically downloaded by your browser

## Troubleshooting

If you're still getting blank PDFs:

1. Check the browser console for any error messages
2. Make sure you have a stable internet connection (html2pdf.js is loaded from a CDN)
3. Try refreshing the page
4. Make sure JavaScript is enabled in your browser

## Files

- `simple-pdf-test.html` - Simple test page for PDF generation
- `pdf-test-no-modules.html` - Test page that works without ES6 modules
- `start-server.bat` - Batch file to start the Node.js server (Windows)
- `start-python-server.bat` - Batch file to start the Python server (Windows)
- `server.js` - Simple Node.js server to serve files
- `start-server.py` - Python script to serve files
- `pdf-export-html2pdf.js` - Main PDF generation module

# DXF PRO — Калькулятор лазерной резки

Профессиональное веб-приложение для анализа DXF-файлов, расчёта стоимости лазерной резки, оптимизации раскладки деталей и экспорта результатов.

## 🚀 Возможности

### Основные функции
- **Парсинг DXF** — Поддержка LINE, CIRCLE, ARC, LWPOLYLINE, POLYLINE
- **Расчёт стоимости** — Учёт мощности лазера, типа газа, толщины материала
- **Автоматическое определение врезок** — Интеллектуальный анализ контуров
- **Оптимизация раскладки** — Сеточная раскладка с поворотами деталей
- **Интерактивный рендеринг** — Zoom, pan, hover-подсветка
- **Экспорт** — DXF, SVG, CSV, отчёты

### Технические особенности
- **Высокая производительность** — Web Workers, Path2D, оптимизированный рендеринг
- **Надёжность** — Централизованная обработка ошибок, валидация данных
- **Типизация** — JSDoc комментарии для всех функций
- **Тестирование** — Расширенная система unit-тестов
- **Адаптивность** — Responsive дизайн, поддержка высокого DPI

## 📦 Установка и запуск

### Требования
- Современный браузер (Chrome 80+, Firefox 75+, Safari 13+)
- Поддержка ES6+ модулей
- Поддержка Canvas API

### Запуск
1. Клонируйте репозиторий
2. Откройте `index.html` в браузере
3. Или используйте локальный сервер:
   ```bash
   python -m http.server 8000
   # или
   npx serve .
   ```

## 🛠️ Архитектура

### Структура проекта
```
dxf-pro/
├── index.html          # Главная страница
├── main.js             # Основная логика приложения
├── parse.js            # Парсинг DXF файлов
├── render.js           # Рендеринг на Canvas
├── cost.js             # Расчёты стоимости резки
├── nesting.js          # Алгоритмы раскладки
├── annotate.js         # Аннотации и экспорт
├── tests.js            # Unit тесты
├── error-handler.js    # Обработка ошибок
├── config-loader.js    # Загрузка конфигурации
├── performance.js      # Мониторинг производительности
├── styles.css          # Стили интерфейса
└── README.md           # Документация
```

### Модули

#### `main.js` — Основная логика
Координирует работу всех модулей, управляет состоянием приложения и UI событиями.

#### `parse.js` — Парсинг DXF
- Парсинг DXF файлов в формате ASCII
- Поддержка основных сущностей (LINE, CIRCLE, ARC, POLYLINE)
- Автоматическое определение точек врезки
- Валидация входных данных

#### `render.js` — Рендеринг
- Высокопроизводительный рендеринг на Canvas
- Интерактивность (zoom, pan, hover)
- Оптимизация для больших файлов
- Поддержка высокого DPI

#### `cost.js` — Расчёты стоимости
- Реалистичные формулы для разных типов резки
- Учёт мощности лазера (0.5-2.0 кВт)
- Поддержка газов (кислород, азот, воздух)
- Валидация параметров

#### `nesting.js` — Раскладка деталей
- Сеточная раскладка с оптимизацией
- Поддержка поворотов деталей
- Расчёт эффективности использования материала
- Валидация входных параметров

#### `annotate.js` — Аннотации и экспорт
- Создание аннотированных DXF
- Экспорт в SVG и CSV
- Обработка длинных строк
- Безопасный экспорт

#### `error-handler.js` — Обработка ошибок
- Централизованная обработка ошибок
- Валидация данных
- Уведомления пользователя
- Логирование

## 📊 Использование

### Загрузка DXF файла
1. Перетащите DXF файл в область загрузки
2. Или нажмите "Открыть DXF" и выберите файл
3. Дождитесь завершения парсинга

### Настройка параметров резки
1. Укажите мощность лазера (0.5-2.0 кВт)
2. Выберите тип газа (кислород, азот, воздух)
3. Введите толщину материала
4. Нажмите "Рассчитать" для получения параметров

### Раскладка деталей
1. Укажите размеры листа
2. Введите количество деталей
3. Настройте отступы и зазоры
4. Выберите допустимые повороты
5. Получите оптимальную раскладку

### Экспорт результатов
- **DXF с аннотациями** — Исходный файл с комментариями
- **DXF с маркерами** — Файл с отмеченными точками врезки
- **SVG** — Векторная графика для веб
- **CSV** — Таблица с данными сущностей
- **Отчёт по раскладке** — Текстовый отчёт

## 🧪 Тестирование

### Запуск тестов
Нажмите кнопку "Запустить тесты" в интерфейсе для выполнения всех unit-тестов.

### Покрытие тестами
- **Парсер DXF** — Тестирование различных форматов и сущностей
- **Расчёты стоимости** — Валидация формул и граничных случаев
- **Раскладка** — Проверка алгоритмов и валидации
- **Рендеринг** — Тестирование отрисовки и интерактивности

## ⚙️ Конфигурация

### Файл `config.json`
```
{
  "cutting": {
    "baseCutSpeeds": {
      "0.5": 3500,
      "1.0": 2500,
      "1.5": 2000,
      "2.0": 1600
    },
    "powerMultipliers": {
      "0.5": 0.7,
      "1.0": 1.0,
      "1.5": 1.4,
      "2.0": 1.8
    }
  },
  "performance": {
    "maxEntities": 10000,
    "maxPiercePoints": 1000,
    "maxArcSteps": 360
  }
}
```

## 🔧 Разработка

### Добавление новых функций
1. Создайте модуль в отдельном файле
2. Добавьте JSDoc типизацию
3. Напишите unit-тесты
4. Интегрируйте с основным приложением

### Стиль кода
- Используйте ES6+ синтаксис
- Добавляйте JSDoc комментарии
- Обрабатывайте ошибки через `error-handler.js`
- Следуйте принципам модульности

### Отладка
- Используйте `console.log` для отладки
- Проверяйте консоль браузера на ошибки
- Запускайте тесты для проверки функциональности

## 📈 Производительность

### Оптимизации
- **Web Workers** для парсинга больших файлов
- **Path2D** для кэширования путей
- **Дебаунсинг** для плавного рендеринга
- **Ограничения** на количество сущностей
- **Lazy loading** для больших данных

### Ограничения
- Максимум 10,000 сущностей для рендеринга
- Максимум 1,000 точек врезки
- Максимум 360 шагов для дуг
- Файлы до 10MB

## 🐛 Известные проблемы

### Ограничения
- Поддержка только ASCII DXF (не бинарные)
- Простая сеточная раскладка (не оптимальная)
- Нет поддержки 3D сущностей

### Планы развития
- [ ] Оптимальная раскладка (алгоритм Nesting)
- [ ] Поддержка бинарных DXF
- [ ] 3D сущности
- [ ] Интеграция с CAM системами
- [ ] Мобильная версия

## 📄 Лицензия

MIT License — свободное использование и модификация.

## 🤝 Вклад в проект

1. Форкните репозиторий
2. Создайте ветку для новой функции
3. Внесите изменения с тестами
4. Создайте Pull Request

## 📞 Поддержка

При возникновении проблем:
1. Проверьте консоль браузера на ошибки
2. Запустите тесты
3. Создайте issue с описанием проблемы

---

**DXF PRO** — профессиональное решение для лазерной резки металла.
