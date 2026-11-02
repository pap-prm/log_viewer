# Обновление ReadLog для работы на порту 5555

## Что исправлено

✅ **Порт сервера изменён на 5555** в `server/config.json`  
✅ **API URL** теперь использует относительный путь `/api` (работает через любой порт)  
✅ **WebSocket URL** теперь корректно определяет порт (по умолчанию 5555)  
✅ **CORS настройки** обновлены для порта 5555  

## Инструкция по обновлению

### Шаг 1: Скопируйте новые файлы на сервер

**На машине разработки:**

```bash
# Копируем собранные файлы фронтенда
scp -r dist/* jenkins@omega-test-02:/var/www/html/readlog/

# Копируем обновлённый config.json
scp server/config.json jenkins@omega-test-02:/opt/readlog/
```

### Шаг 2: На сервере установите права и перезапустите

**На сервере omega-test-02:**

```bash
# Установите права
sudo chown -R root:apache /var/www/html/readlog
sudo chown readlog:readlog /opt/readlog/config.json

# Перезапустите сервис
sudo systemctl restart readlog

# Проверьте статус
sudo systemctl status readlog
```

### Шаг 3: Проверьте порт сервера

```bash
# Проверьте, что сервер слушает порт 5555
sudo netstat -tlnp | grep 5555

# Или
sudo ss -tlnp | grep 5555
```

Должна быть строка:
```
tcp   LISTEN  0  511  0.0.0.0:5555  0.0.0.0:*  users:(("node",pid=...,fd=...))
```

### Шаг 4: Очистите кэш браузера

В браузере нажмите **Ctrl + Shift + R** (или **Ctrl + F5**) для принудительной перезагрузки без кэша.

### Шаг 5: Проверьте работу

1. Откройте `http://omega-test-02.pmz.motor.loc:5555/`
2. Проверьте, что страница загружается
3. Переключитесь в режим **Live**
4. Должен появиться выпадающий список **"Обновление:"** с вариантами от 1 до 60 секунд
5. Проверьте консоль браузера (F12) — не должно быть ошибок `ERR_CONNECTION_REFUSED`

## Проверка API

В консоли браузера (F12 → Console) выполните:

```javascript
fetch('/api/info').then(r => r.json()).then(console.log)
```

Должен вернуться JSON с информацией о сервере.

## Проверка WebSocket

В консоли браузера выполните:

```javascript
const ws = new WebSocket('ws://omega-test-02.pmz.motor.loc:5555/ws/logs');
ws.onopen = () => console.log('✓ WebSocket подключён');
ws.onmessage = (e) => console.log('Получено:', JSON.parse(e.data));
ws.onerror = (e) => console.error('Ошибка:', e);
```

Если WebSocket работает, вы увидите сообщение "✓ WebSocket подключён".

## Логи сервера

Проверьте логи на сервере:

```bash
sudo tail -f /var/log/readlog/server.log
```

Должны быть строки:
```
✓ Конфигурация загружена: /opt/readlog/config.json
✓ Статические файлы: /opt/readlog/dist
✓ Директория с логами: /opt/assembly_visual/logs/
✓ WebSocket сервер запущен на /ws/logs
✓ Отслеживание файлов запущено: /opt/assembly_visual/logs/

═══════════════════════════════════════════
  Log Viewer Server запущен
═══════════════════════════════════════════
  Адрес: http://0.0.0.0:5555
  WebSocket: ws://0.0.0.0:5555/ws/logs
  Логи: /opt/assembly_visual/logs/
  Белый список IP: ВКЛ
  Разрешённые IP: 127.0.0.1, ::1, 192.168.1.0/24, 10.0.0.0/8, 10.200.10.12
  Авторизация LDAP: ВЫКЛ
  Live режим: ВКЛ (WebSocket)
═══════════════════════════════════════════
```

## Если проблема сохраняется

### Проверьте firewall

```bash
# Проверьте, открыт ли порт 5555
sudo firewall-cmd --list-ports

# Если порт не открыт, откройте его
sudo firewall-cmd --permanent --add-port=5555/tcp
sudo firewall-cmd --reload
```

### Проверьте SELinux

```bash
# Проверьте статус SELinux
getenforce

# Если SELinux включён, разрешите Node.js слушать порт 5555
sudo semanage port -a -t http_port_t -p tcp 5555
```

### Проверьте конфигурацию Apache

Если вы используете Apache как прокси, проверьте конфигурацию:

```bash
sudo cat /etc/httpd/conf.d/readlog.conf
```

Убедитесь, что Apache проксирует на порт 5555:

```apache
ProxyPass / http://localhost:5555/
ProxyPassReverse / http://localhost:5555/
```

## Структура URL

После обновления:

- **Веб-интерфейс:** `http://omega-test-02.pmz.motor.loc:5555/`
- **API:** `http://omega-test-02.pmz.motor.loc:5555/api/*`
- **WebSocket:** `ws://omega-test-02.pmz.motor.loc:5555/ws/logs`

## Итого

✅ Порт сервера изменён на 5555  
✅ API URL использует относительный путь  
✅ WebSocket URL корректно определяет порт  
✅ CORS настройки обновлены  
✅ Проект пересобран  

Для применения изменений скопируйте файлы на сервер, перезапустите сервис и очистите кэш браузера.
