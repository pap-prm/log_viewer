# Инструкция по исправлению ошибки SyntaxError

## Проблема

На сервере установлен старый файл `server.js` с синтаксической ошибкой на строке 373.

## Решение

### Вариант 1: Скопировать исправленный файл с машины разработки

```bash
# На машине разработки скопируйте файл на сервер
scp server/server.js jenkins@omega-test-02:/opt/readlog/

# На сервере исправьте права и перезапустите
ssh jenkins@omega-test-02
sudo chown readlog:readlog /opt/readlog/server.js
sudo systemctl restart readlog
sudo systemctl status readlog
```

### Вариант 2: Исправить вручную на сервере

```bash
# Откройте файл на сервере
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

Сохраните файл (Ctrl+O, Enter, Ctrl+X) и перезапустите:

```bash
sudo systemctl restart readlog
sudo systemctl status readlog
```

### Вариант 3: Использовать готовый файл из архива

Если у вас есть доступ к исправленному файлу в проекте, скопируйте его:

```bash
# На сервере
cd /opt/readlog
sudo cp /path/to/correct/server.js ./server.js
sudo chown readlog:readlog server.js
sudo systemctl restart readlog
```

## Проверка

После исправления проверьте логи:

```bash
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
  Белый список IP: ВЫКЛ
  Авторизация LDAP: ВЫКЛ
  Live режим: ВКЛ (WebSocket)
═══════════════════════════════════════════
```

## Если ошибка повторяется

Проверьте синтаксис файла:

```bash
# Проверка синтаксиса JavaScript
node -c /opt/readlog/server.js
```

Если есть ошибка, она покажет точное место проблемы.

## Быстрая проверка

```bash
# Проверьте статус
sudo systemctl status readlog

# Проверьте логи
sudo journalctl -u readlog -n 20 --no-pager

# Проверьте API
curl http://localhost:3001/api/info
```

## Готовый исправленный файл

Если ничего не помогает, используйте готовый файл из проекта. Он находится в:
- `server/server.js` (в проекте)

Скопируйте его на сервер и перезапустите сервис.
