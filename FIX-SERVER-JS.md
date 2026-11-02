# Быстрое исправление синтаксической ошибки на сервере

## Проблема

На сервере файл `/opt/readlog/server.js` содержит синтаксическую ошибку на строке 373.

## Причина

При предыдущей установке файл `server.js` был скопирован с ошибкой. Скрипт `install-offline.sh` копировал файл только если его не было в корне, поэтому исправленная версия не была установлена.

## Исправление в проекте

Внесены следующие изменения:

1. **Файл `server/server.js`** — исправлен (строки 366-376)
2. **Скрипт `install-offline.sh`** — теперь всегда перезаписывает `server.js`
3. **Добавлено копирование `websocket.js`** — для поддержки Live режима

## Быстрое исправление на сервере

### Вариант 1: Копирование исправленного файла

```bash
# С машины разработки скопируйте файлы
scp server/server.js server/websocket.js jenkins@omega-test-02:/opt/readlog/

# На сервере
ssh jenkins@omega-test-02
sudo chown readlog:readlog /opt/readlog/server.js /opt/readlog/websocket.js
sudo systemctl restart readlog
sudo systemctl status readlog
```

### Вариант 2: Ручное исправление на сервере

```bash
# Откройте файл
sudo nano /opt/readlog/server.js
```

Найдите строки 366-376 и замените на:

```javascript
      res.json({
        success: true,
        message: 'Файл загружен',
        file: {
          name: req.file.originalname,
          size: req.file.size
        }
      });
    });
  });
}
```

Сохраните (Ctrl+O, Enter, Ctrl+X) и перезапустите:

```bash
sudo systemctl restart readlog
```

### Вариант 3: Проверка синтаксиса

```bash
# Проверьте синтаксис
node -c /opt/readlog/server.js

# Если нет ошибок, перезапустите
sudo systemctl restart readlog
```

## Проверка после исправления

```bash
# Проверьте статус
sudo systemctl status readlog

# Проверьте логи
sudo tail -f /var/log/readlog/server.log
```

Должны появиться строки:
```
✓ Конфигурация загружена: /opt/readlog/config.json
✓ Статические файлы: /opt/readlog/dist
✓ Директория с логами: /opt/assembly_visual/logs/
✓ WebSocket сервер запущен на /ws/logs
✓ Отслеживание файлов запущено: /opt/assembly_visual/logs/

═══════════════════════════════════════════
  Log Viewer Server запущен
═══════════════════════════════════════════
  Адрес: http://0.0.0.0:3001
  WebSocket: ws://0.0.0.0:3001/ws/logs
  Логи: /opt/assembly_visual/logs/
  Белый список IP: ВКЛ
  Разрешённые IP: 127.0.0.1, ::1, 192.168.1.0/24, 10.0.0.0/8, 10.200.10.12
  Авторизация LDAP: ВЫКЛ
  Live режим: ВКЛ (WebSocket)
═══════════════════════════════════════════
```

## Что исправлено в скрипте install-offline.sh

**Было:**
```bash
if [ -f "$APP_DIR/server/server.js" ] && [ ! -f "$APP_DIR/server.js" ]; then
    cp "$APP_DIR/server/server.js" "$APP_DIR/server.js"
```

**Стало:**
```bash
if [ -f "$APP_DIR/server/server.js" ]; then
    cp "$APP_DIR/server/server.js" "$APP_DIR/server.js"
    echo -e "${GREEN}✓ server.js скопирован в корень (перезаписан)${NC}"
fi

if [ -f "$APP_DIR/server/websocket.js" ]; then
    cp "$APP_DIR/server/websocket.js" "$APP_DIR/websocket.js"
    echo -e "${GREEN}✓ websocket.js скопирован в корень${NC}"
fi
```

Теперь файл `server.js` всегда перезаписывается при установке, что гарантирует получение исправленной версии.

## Повторная установка

Если хотите переустановить с нуля:

```bash
# На сервере удалите старую установку
sudo systemctl stop readlog
sudo rm -rf /opt/readlog
sudo rm -rf /var/www/html/readlog
sudo rm -rf /var/log/readlog

# Распакуйте архив заново
cd /tmp
sudo tar -xzf readlog-offline-20261102.tar.gz
cd readlog-offline-20261102

# Запустите установку
sudo ./install-offline.sh
```

Теперь `server.js` будет скопирован с исправлениями.

## Итого

✅ Файл `server/server.js` исправлен в проекте  
✅ Скрипт `install-offline.sh` обновлён — всегда перезаписывает `server.js`  
✅ Добавлено копирование `websocket.js`  
✅ Проект успешно собран  

Для применения изменений скопируйте файлы на сервер или переустановите с нуля.
