# Обновление сервера для поддержки Live режима

## Что добавлено

Добавлена функция **Live режима** (аналог `tail -f`) для отслеживания логов в реальном времени через WebSocket.

## Новые файлы

### Серверная часть
- `server/websocket.js` — WebSocket сервер и отслеживание файлов
- `server/package.json` — обновлён (добавлены `ws` и `chokidar`)

### Клиентская часть
- `src/hooks/useWebSocket.ts` — хук для работы с WebSocket
- `src/components/LiveLogViewer.tsx` — компонент live просмотра
- `src/App.tsx` — обновлён (добавлен переключатель режимов)

## Установка на сервере

### 1. Скопируйте новые файлы на сервер

```bash
# С машины разработки
scp server/websocket.js jenkins@omega-test-02:/opt/readlog/
scp server/package.json jenkins@omega-test-02:/opt/readlog/
scp server/server.js jenkins@omega-test-02:/opt/readlog/
```

### 2. Установите новые зависимости

```bash
cd /opt/readlog
sudo npm install ws chokidar --save
sudo chown -R readlog:readlog node_modules
```

### 3. Скопируйте обновлённый фронтенд

```bash
# С машины разработки (после npm run build)
scp -r dist/* jenkins@omega-test-02:/var/www/html/readlog/
```

### 4. Перезапустите сервис

```bash
sudo systemctl restart readlog
sudo systemctl status readlog
```

### 5. Проверьте работу

```bash
# Проверьте логи
sudo tail -f /var/log/readlog/server.log
```

Должны появиться строки:
```
✓ WebSocket сервер запущен на /ws/logs
✓ Отслеживание файлов запущено: /opt/assembly_visual/logs/
```

## Проверка в браузере

1. Откройте `http://omega-test-02.pmz.motor.loc:3001/`
2. В верхней панели найдите переключатель режимов: **[Статика] [Live]**
3. Нажмите **"Live"**
4. Должен появиться индикатор **"Подключено"** (зелёная точка)
5. Новые строки логов будут появляться в реальном времени

## Тестирование

### Генерация тестовых логов

```bash
# В другом терминале
echo "$(date '+%Y-%m-%d %H:%M:%S') [test] INFO Test message $(date +%s)" >> /opt/assembly_visual/logs/app.log
```

Новая строка должна появиться в браузере в течение 1-2 секунд.

### Проверка WebSocket

Откройте консоль браузера (F12) и выполните:

```javascript
const ws = new WebSocket('ws://omega-test-02.pmz.motor.loc:3001/ws/logs');
ws.onmessage = (e) => console.log('Получено:', JSON.parse(e.data));
ws.onopen = () => console.log('Подключено!');
```

## Возможные проблемы

### Проблема: WebSocket не подключается

**Решение:**
```bash
# Проверьте, что порт открыт
sudo firewall-cmd --list-ports

# Если порт 3001 не открыт, добавьте его
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

### Проблема: Ошибка "Cannot find module 'ws'"

**Решение:**
```bash
cd /opt/readlog
sudo npm install ws chokidar --save
sudo chown -R readlog:readlog node_modules
sudo systemctl restart readlog
```

### Проблема: Новые строки не появляются

**Решение:**
```bash
# Проверьте права на директорию с логами
sudo chmod 755 /opt/assembly_visual/logs/
sudo chmod 644 /opt/assembly_visual/logs/*.log

# Проверьте, что пользователь readlog может читать файлы
sudo -u readlog cat /opt/assembly_visual/logs/app.log
```

## Использование

### Переключение режимов

- **Статика** — обычный просмотр файла (как раньше)
- **Live** — отслеживание изменений в реальном времени (как `tail -f`)

### Управление в Live режиме

- **Остановить/Запустить** — пауза/возобновление отслеживания
- **Автопрокрутка** — автоматическая прокрутка к новым строкам
- **Очистить** — удалить все строки с экрана

### Фильтрация по файлу

Если выбран конкретный файл в списке, Live режим будет отслеживать только его.

## Документация

Полная документация: `LIVE-MODE-GUIDE.md`

## Что дальше

После успешной установки вы можете:
1. Использовать Live режим для мониторинга ошибок в реальном времени
2. Отслеживать несколько файлов одновременно
3. Фильтровать логи по уровням (ERROR, WARN, INFO и т.д.)
4. Экспортировать live логи в файл

## Откат изменений

Если что-то пошло не так, можно откатиться:

```bash
# Остановить сервис
sudo systemctl stop readlog

# Удалить новые зависимости
cd /opt/readlog
sudo npm uninstall ws chokidar

# Восстановить старые файлы из бэкапа (если есть)
# sudo cp /path/to/backup/server.js /opt/readlog/
# sudo cp -r /path/to/backup/dist/* /var/www/html/readlog/

# Запустить сервис
sudo systemctl start readlog
```

## Поддержка

При возникновении проблем проверьте:
1. Логи сервера: `sudo journalctl -u readlog -n 50`
2. Логи приложения: `sudo tail -f /var/log/readlog/server.log`
3. Права доступа: `ls -la /opt/readlog/`
4. Firewall: `sudo firewall-cmd --list-all`
