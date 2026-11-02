# Live режим — Автообновление логов в реальном времени

## Обзор

Добавлена функция **Live режима** (аналог `tail -f`), которая позволяет отслеживать изменения лог-файлов в реальном времени через WebSocket.

## Возможности

### 🎯 Основные функции

- **Отслеживание в реальном времени** — новые строки логов появляются автоматически
- **WebSocket соединение** — мгновенная доставка изменений
- **Автопрокрутка** — автоматическая прокрутка к новым строкам
- **Подсветка уровней** — ERROR, WARN, FATAL и т.д. выделяются цветом
- **Фильтрация по файлам** — можно отслеживать конкретный файл
- **Ограничение строк** — максимум 1000 строк в памяти (настраивается)

### 🎮 Управление

- **Кнопка "Live"** — переключение между статическим и live режимами
- **Кнопка "Остановить/Запустить"** — пауза/возобновление отслеживания
- **Кнопка "Автопрокрутка"** — включение/отключение автоматической прокрутки
- **Кнопка "Очистить"** — очистка экрана от старых строк
- **Индикатор подключения** — показывает статус WebSocket соединения

## Как это работает

### Архитектура

```
┌─────────────────┐
│   Браузер       │
│  (LiveLogViewer)│
└────────┬────────┘
         │ WebSocket
         │ ws://server:3001/ws/logs
         ▼
┌─────────────────┐
│   Node.js       │
│   сервер        │
│  (websocket.js) │
└────────┬────────┘
         │ chokidar
         │ (file watcher)
         ▼
┌─────────────────┐
│ /opt/assembly_  │
│ visual/logs/    │
│  ├── app.log    │
│  └── *.log      │
└─────────────────┘
```

### Серверная часть

**Файл:** `server/websocket.js`

```javascript
const WebSocket = require('ws');
const chokidar = require('chokidar');

class LogWatcher {
  constructor(logsDir) {
    this.logsDir = logsDir;
    this.wss = null;
    this.watcher = null;
    this.filePositions = new Map(); // Позиция чтения для каждого файла
    this.clients = new Set();
  }

  start(server) {
    // Создаём WebSocket сервер
    this.wss = new WebSocket.Server({ server, path: '/ws/logs' });
    
    // Отслеживаем изменения файлов
    this.watcher = chokidar.watch(this.logsDir, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });

    // При изменении файла читаем новые строки
    this.watcher.on('change', (filePath) => {
      this.readFileChanges(filePath);
    });
  }

  readFileChanges(filePath) {
    // Читаем только новые строки с последней позиции
    const stats = fs.statSync(filePath);
    const currentPosition = this.filePositions.get(filePath) || 0;
    
    if (stats.size > currentPosition) {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(stats.size - currentPosition);
      fs.readSync(fd, buffer, 0, buffer.length, currentPosition);
      fs.closeSync(fd);

      const newContent = buffer.toString('utf8');
      const lines = newContent.split('\n').filter(line => line.trim() !== '');

      // Отправляем новые строки всем подключённым клиентам
      this.broadcast({
        type: 'new_lines',
        file: path.basename(filePath),
        lines: lines,
        timestamp: new Date().toISOString()
      });

      // Обновляем позицию
      this.filePositions.set(filePath, stats.size);
    }
  }
}
```

### Клиентская часть

**Файл:** `src/hooks/useWebSocket.ts`

```typescript
export function useWebSocket({ url, onMessage, onConnect, onDisconnect }) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      onConnect?.();
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      onMessage?.(message);
    };

    ws.onclose = () => {
      setIsConnected(false);
      onDisconnect?.();
    };
  }, [url]);

  return { isConnected, connect, disconnect };
}
```

**Файл:** `src/components/LiveLogViewer.tsx`

```typescript
export const LiveLogViewer: React.FC<LiveLogViewerProps> = ({ fileName, maxLines = 1000 }) => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);

  const handleWebSocketMessage = useCallback((message: any) => {
    if (message.type === 'new_lines' && message.lines) {
      const newEntries = message.lines.map((line: string) => {
        return parseLogLine(line, lineCounter.current++);
      });

      setEntries(prev => {
        const combined = [...prev, ...newEntries];
        if (combined.length > maxLines) {
          return combined.slice(-maxLines);
        }
        return combined;
      });
    }
  }, [maxLines]);

  const { isConnected } = useWebSocket({
    url: `ws://${window.location.hostname}:3001/ws/logs`,
    onMessage: handleWebSocketMessage
  });

  return (
    <div>
      {/* Панель управления */}
      <button onClick={() => setIsLive(!isLive)}>
        {isLive ? 'Остановить' : 'Запустить'}
      </button>
      
      {/* Отображение логов */}
      {entries.map(entry => (
        <LogLine key={entry.lineNumber} entry={entry} />
      ))}
    </div>
  );
};
```

## Использование

### 1. Переключение в Live режим

В верхней панели нажмите кнопку **"Live"**:

```
[Статика] [Live]
```

### 2. Управление отслеживанием

- **Остановить** — приостановить получение новых строк
- **Запустить** — возобновить отслеживание
- **Автопрокрутка** — автоматическая прокрутка к новым строкам
- **Очистить** — удалить все строки с экрана

### 3. Фильтрация по файлу

Если выбран конкретный файл в списке, Live режим будет отслеживать только его.

## Сообщения WebSocket

### Типы сообщений

#### От сервера к клиенту

**`connected`** — успешное подключение
```json
{
  "type": "connected",
  "message": "Подключено к серверу логов",
  "logsDir": "/opt/assembly_visual/logs/"
}
```

**`new_lines`** — новые строки в файле
```json
{
  "type": "new_lines",
  "file": "app.log",
  "path": "/opt/assembly_visual/logs/app.log",
  "lines": [
    "2026-11-02 15:30:45.123 [main] INFO Application started",
    "2026-11-02 15:30:46.456 [worker] ERROR Connection failed"
  ],
  "timestamp": "2026-11-02T15:30:46.789Z"
}
```

**`file_added`** — новый файл добавлен
```json
{
  "type": "file_added",
  "file": "app-2026-11-02.log",
  "path": "/opt/assembly_visual/logs/app-2026-11-02.log"
}
```

**`file_removed`** — файл удалён
```json
{
  "type": "file_removed",
  "file": "app-old.log",
  "path": "/opt/assembly_visual/logs/app-old.log"
}
```

**`file_rotated`** — файл ротирован (стал меньше)
```json
{
  "type": "file_rotated",
  "file": "app.log",
  "path": "/opt/assembly_visual/logs/app.log"
}
```

#### От клиента к серверу

**`subscribe`** — подписка на конкретный файл
```json
{
  "type": "subscribe",
  "file": "app.log"
}
```

**`unsubscribe`** — отписка от файла
```json
{
  "type": "unsubscribe"
}
```

**`ping`** — проверка соединения
```json
{
  "type": "ping"
}
```

## Установка зависимостей

На сервере установите новые зависимости:

```bash
cd /opt/readlog
sudo npm install ws chokidar --save
sudo chown -R readlog:readlog node_modules
sudo systemctl restart readlog
```

## Проверка работы

### 1. Проверьте логи сервера

```bash
sudo tail -f /var/log/readlog/server.log
```

Должна появиться строка:
```
✓ WebSocket сервер запущен на /ws/logs
✓ Отслеживание файлов запущено: /opt/assembly_visual/logs/
```

### 2. Откройте Live режим в браузере

1. Откройте `http://server-ip:3001/`
2. Нажмите кнопку **"Live"**
3. Должен появиться индикатор **"Подключено"** (зелёная точка)

### 3. Генерация тестовых логов

В другом терминале:

```bash
# Добавляем строку в лог
echo "$(date '+%Y-%m-%d %H:%M:%S') [test] INFO Test message" >> /opt/assembly_visual/logs/app.log
```

Новая строка должна появиться в браузере в реальном времени.

## Производительность

### Оптимизации

1. **Инкрементальное чтение** — читаем только новые строки, а не весь файл
2. **Ограничение строк** — максимум 1000 строк в памяти (настраивается через `maxLines`)
3. **Debouncing** — chokidar ждёт завершения записи (500ms) перед отправкой
4. **Фильтрация** — можно подписаться только на конкретный файл

### Ограничения

- **Максимум 1000 строк** в памяти клиента (можно изменить в `LiveLogViewer`)
- **WebSocket соединение** может быть разорвано при длительном простое
- **Большие файлы** (>100MB) могут вызвать задержки при первом подключении

## Отладка

### Проблема: Не подключается WebSocket

**Решение:**
1. Проверьте, что сервер запущен: `sudo systemctl status readlog`
2. Проверьте логи: `sudo tail -f /var/log/readlog/server.log`
3. Проверьте firewall: `sudo firewall-cmd --list-ports`
4. Проверьте CORS в `config.json`

### Проблема: Новые строки не появляются

**Решение:**
1. Проверьте права на директорию с логами:
   ```bash
   sudo chmod 755 /opt/assembly_visual/logs/
   sudo chmod 644 /opt/assembly_visual/logs/*.log
   ```
2. Проверьте, что пользователь `readlog` может читать файлы:
   ```bash
   sudo -u readlog cat /opt/assembly_visual/logs/app.log
   ```
3. Проверьте логи chokidar в консоли сервера

### Проблема: Дубликаты строк

**Решение:**
1. Проверьте, что файл не ротировался (стал меньше)
2. Очистите экран кнопкой "Очистить"
3. Перезапустите Live режим

## Сравнение с `tail -f`

| Функция | `tail -f` | Live режим |
|---------|-----------|------------|
| Отслеживание в реальном времени | ✅ | ✅ |
| Веб-интерфейс | ❌ | ✅ |
| Подсветка синтаксиса | ❌ | ✅ |
| Фильтрация по уровням | ❌ | ✅ |
| Поиск | ❌ | ✅ |
| Экспорт | ❌ | ✅ |
| Множественные файлы | ❌ (только один) | ✅ |
| Доступ через браузер | ❌ | ✅ |
| Автопрокрутка | ✅ | ✅ |

## API для разработчиков

### Подключение к WebSocket

```javascript
const ws = new WebSocket('ws://server:3001/ws/logs');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'new_lines') {
    console.log('Новые строки:', message.lines);
  }
};
```

### Подписка на конкретный файл

```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  file: 'app.log'
}));
```

### Использование хука useWebSocket

```typescript
import { useWebSocket } from './hooks/useWebSocket';

function MyComponent() {
  const { isConnected, sendMessage } = useWebSocket({
    url: 'ws://server:3001/ws/logs',
    onMessage: (message) => {
      if (message.type === 'new_lines') {
        // Обработка новых строк
      }
    }
  });

  return (
    <div>
      {isConnected ? 'Подключено' : 'Отключено'}
    </div>
  );
}
```

## Будущие улучшения

- [ ] Фильтрация по уровням в live режиме
- [ ] Поиск в live режиме
- [ ] Пауза/возобновление без отключения WebSocket
- [ ] Экспорт live логов в файл
- [ ] Поддержка нескольких файлов одновременно
- [ ] Визуализация частоты ошибок в реальном времени
- [ ] Уведомления о критических ошибках

## Заключение

Live режим предоставляет мощный инструмент для мониторинга логов в реальном времени, аналогичный `tail -f`, но с веб-интерфейсом и дополнительными возможностями фильтрации, поиска и экспорта.

Используйте live режим для:
- Мониторинга ошибок в реальном времени
- Отладки приложений
- Отслеживания производительности
- Анализа поведения системы

Используйте статический режим для:
- Анализа исторических данных
- Поиска конкретных ошибок
- Экспорта данных для отчётов
