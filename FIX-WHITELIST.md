# Исправление whitelist: блокировка всех запросов

## Проблема

IP `10.200.20.14` имел доступ к сервису, хотя в whitelist указан только `10.200.10.12`.

**Причина:** Whitelist применялся только к `/api/*` маршрутам, но не к:
- Статическим файлам (HTML, JS, CSS)
- WebSocket соединениям

## Решение

### 1. Применить whitelist ко всем запросам

**server.js:**
```javascript
// Было:
app.use('/api', checkWhitelist);

// Стало:
app.use(checkWhitelist);  // Применяется ко ВСЕМ запросам
```

### 2. Добавить проверку whitelist для WebSocket

**websocket.js:**
```javascript
// Добавлен метод checkWhitelist
checkWhitelist(clientIp) {
  if (!this.config || !this.config.security.whitelist.enabled) {
    return true;
  }

  const whitelist = this.config.security.whitelist.ips;
  const ip = clientIp.replace('::ffff:', '');
  
  // Проверяем точное совпадение
  if (whitelist.includes(ip)) {
    return true;
  }
  
  // Проверяем диапазоны (CIDR)
  for (const range of whitelist) {
    if (range.includes('/')) {
      // Простая проверка для 10.0.0.0/8, 192.168.1.0/24 и т.д.
      // ...
    }
  }
  
  return false;
}

// Добавлена проверка при подключении WebSocket
this.wss = new WebSocket.Server({ 
  server, 
  path: '/ws/logs',
  verifyClient: (info, callback) => {
    const clientIp = info.req.socket.remoteAddress;
    if (this.checkWhitelist(clientIp)) {
      callback(true);
    } else {
      console.warn(`✗ WebSocket подключение отклонено для IP: ${clientIp}`);
      callback(false, 403, 'Forbidden');
    }
  }
});
```

### 3. Обновить config.json

**Было:**
```json
{
  "whitelist": {
    "enabled": true,
    "ips": [
      "127.0.0.1",
      "::1",
      "192.168.1.0/24",
      "10.0.0.0/8",
      "10.200.10.12"
    ]
  }
}
```

**Стало:**
```json
{
  "whitelist": {
    "enabled": true,
    "ips": [
      "127.0.0.1",
      "::1",
      "10.200.10.12"
    ]
  }
}
```

**Убрано:**
- `192.168.1.0/24` - не используется
- `10.0.0.0/8` - слишком широкий диапазон (разрешал все 10.x.x.x)

## Обновление на сервере

### Шаг 1: Скопируйте обновленные файлы

```bash
# На машине разработки
scp server/server.js server/websocket.js server/config.json jenkins@omega-test-02:/tmp/

# На сервере
sudo cp /tmp/server.js /tmp/websocket.js /opt/readlog/
sudo cp /tmp/config.json /opt/readlog/
sudo chown readlog:readlog /opt/readlog/server.js /opt/readlog/websocket.js /opt/readlog/config.json
```

### Шаг 2: Перезапустите сервис

```bash
sudo systemctl restart readlog
```

### Шаг 3: Проверьте логи

```bash
sudo tail -f /var/log/readlog/server.log
```

Должно быть:
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
  Разрешённые IP: 10.200.10.12
  Авторизация LDAP: ВЫКЛ
  Live режим: ВКЛ (WebSocket)
═══════════════════════════════════════════
```

### Шаг 4: Проверьте блокировку

С компьютера с IP `10.200.20.14` попробуйте открыть `http://omega-test-02.pmz.motor.loc:5555/`

Должны получить ошибку **403 Forbidden** для всех запросов.

В логах сервера должно быть:
```
✗ Доступ запрещён для IP: 10.200.20.14
```

## Проверка работы

### С разрешённого IP (10.200.10.12)

```bash
# Должно работать
curl http://omega-test-02.pmz.motor.loc:5555/api/info
```

Ожидается: JSON с информацией о сервере

### С запрещённого IP (10.200.20.14)

```bash
# Должно вернуть 403
curl http://omega-test-02.pmz.motor.loc:5555/api/info
```

Ожидается: HTTP 403 Forbidden

## Добавление новых IP в whitelist

Если нужно добавить IP `10.200.20.14`:

```bash
sudo nano /opt/readlog/config.json
```

Измените:
```json
{
  "whitelist": {
    "enabled": true,
    "ips": [
      "127.0.0.1",
      "::1",
      "10.200.10.12",
      "10.200.20.14"
    ]
  }
}
```

Перезапустите:
```bash
sudo systemctl restart readlog
```

## Поддержка CIDR диапазонов

Можно использовать диапазоны:

```json
{
  "whitelist": {
    "enabled": true,
    "ips": [
      "127.0.0.1",
      "10.200.10.0/24",
      "10.200.20.14"
    ]
  }
}
```

Поддерживаются:
- `/8` - все IP вида `10.x.x.x`
- `/16` - все IP вида `10.200.x.x`
- `/24` - все IP вида `10.200.10.x`

## Итого

✅ Whitelist теперь применяется ко всем запросам (включая статику)  
✅ WebSocket соединения проверяются через whitelist  
✅ Убран слишком широкий диапазон `10.0.0.0/8`  
✅ Добавлена поддержка CIDR диапазонов  
✅ Проект успешно собран  

## Примечание про iptables

Пользователь упомянул, что используется `iptables` вместо `firewalld`. Это не влияет на работу whitelist, так как проверка происходит на уровне приложения (Node.js), а не на уровне firewall.

Whitelist в `config.json` работает независимо от iptables/firewalld.
