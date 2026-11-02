# Инструкция по установке ReadLog на сервере БЕЗ интернета

## Проблема с предыдущей версией

В предыдущей версии скрипта `install-offline.sh` была ошибка с путями:
- Скрипт пытался скопировать `dist/*` из текущей директории
- Но текущая директория менялась на `/opt/readlog`
- Поэтому копирование не работало

## Исправленная версия

В новой версии скрипт:
1. Сохраняет исходную директорию архива в переменную `SCRIPT_DIR`
2. Использует абсолютные пути для копирования файлов
3. Правильно копирует `dist/`, `server-deps/`, `offline-packages/`

## Установка

### 1. Распакуйте архив на сервере

```bash
cd /tmp
sudo tar -xzf readlog-offline-20261102.tar.gz
cd readlog-offline-20261102
```

### 2. Запустите установку

```bash
sudo ./install-offline.sh
```

Скрипт автоматически:
- Создаст пользователя `readlog`
- Создаст директории `/opt/readlog`, `/var/log/readlog`, `/var/www/html/readlog`
- Скопирует файлы из архива в `/opt/readlog`
- Установит зависимости из `server-deps/` или `offline-packages/`
- Скопирует `dist/` в `/opt/readlog/dist/` и `/var/www/html/readlog/`
- Создаст systemd-сервис `readlog`
- Настроит Apache и SELinux

### 3. Проверьте установку

```bash
# Проверьте статус сервиса
sudo systemctl status readlog

# Проверьте логи
sudo tail -f /var/log/readlog/server.log

# Проверьте API
curl http://localhost:5555/api/info

# Откройте в браузере
# http://omega-test-02.pmz.motor.loc:5555/
```

## Что исправлено

### Пути в скрипте

**Было:**
```bash
tar -cf - ... -C ./ . | tar -xf - -C "$APP_DIR/"
cp -r dist/* "$APP_DIR/dist/"
```

**Стало:**
```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tar -cf - ... -C "$SCRIPT_DIR" . | tar -xf - -C "$APP_DIR/"
cp -r "$SCRIPT_DIR/dist/"* "$APP_DIR/dist/"
```

### Проверка наличия dist/

**Было:**
```bash
if [ -d "dist" ]; then
    cp -r dist/* "$APP_DIR/dist/"
```

**Стало:**
```bash
if [ -d "$SCRIPT_DIR/dist" ]; then
    cp -r "$SCRIPT_DIR/dist/"* "$APP_DIR/dist/"
```

### Копирование серверных зависимостей

**Было:**
```bash
if [ -d "server-deps/node_modules" ]; then
    cp -r server-deps/node_modules/* node_modules/
```

**Стало:**
```bash
if [ -d "$SCRIPT_DIR/server-deps/node_modules" ]; then
    cp -r "$SCRIPT_DIR/server-deps/node_modules/"* node_modules/
```

## Структура после установки

```
/opt/readlog/                      ← Приложение
├── server.js                      ← Node.js сервер
├── config.json                    ← Конфигурация
├── package.json                   ← Зависимости
├── node_modules/                  ← Установленные пакеты
├── dist/                          ← Статические файлы (fallback)
│   ├── index.html
│   └── assets/
│       ├── index-*.js
│       └── index-*.css
└── ...

/var/www/html/readlog/             ← Статические файлы (Apache)
├── index.html
└── assets/
    ├── index-*.js
    └── index-*.css

/opt/assembly_visual/logs/         ← Логи Java (источник данных)
/var/log/readlog/                  ← Логи сервиса
/etc/httpd/conf.d/readlog.conf     ← Конфиг Apache
/etc/systemd/system/readlog.service ← Systemd сервис
```

## Устранение неполадок

### Ошибка: "dist/*: Нет такого файла или каталога"

Это означает, что в архиве нет папки `dist/`. Проверьте:

```bash
# Проверьте наличие dist/ в архиве
ls -la /tmp/readlog-offline-20261102/dist/

# Если dist/ нет, пересоберите на машине с интернетом
cd /path/to/project
npm install
npm run build
./prepare-offline.sh
```

### Ошибка: "Серверные зависимости не найдены"

Это означает, что в архиве нет `server-deps/` или `offline-packages/`. Проверьте:

```bash
# Проверьте наличие server-deps/ в архиве
ls -la /tmp/readlog-offline-20261102/server-deps/

# Если server-deps/ нет, пересоберите на машине с интернетом
cd /path/to/project
./prepare-offline.sh
```

### Ошибка: "Cannot find module 'express'"

Это означает, что зависимости не установлены. Установите вручную:

```bash
cd /opt/readlog
sudo npm install express cors morgan ip-range-check multer --save
sudo chown -R readlog:readlog node_modules
sudo systemctl restart readlog
```

### Ошибка: "EACCES: permission denied, mkdir '/opt/assembly_visual/logs'"

Это означает, что у пользователя `readlog` нет прав на директорию с логами. Исправьте:

```bash
sudo chmod 755 /opt/assembly_visual
sudo chmod 755 /opt/assembly_visual/logs
sudo chmod o+rX /opt/assembly_visual
sudo chmod o+rX /opt/assembly_visual/logs
sudo systemctl restart readlog
```

### Ошибка: "Не разрешено CORS"

Это означает, что в `config.json` не добавлен origin сервера. Отредактируйте:

```bash
sudo nano /opt/readlog/config.json
```

Добавьте в `cors.origins`:

```json
{
  "security": {
    "cors": {
      "enabled": true,
      "origins": [
        "http://localhost:5555",
        "http://omega-test-02.pmz.motor.loc:5555",
        "http://omega-test-02.pmz.motor.loc",
        "http://10.200.4.105:5555",
        "http://10.200.4.105"
      ]
    }
  }
}
```

Перезапустите сервис:

```bash
sudo systemctl restart readlog
```

## Удаление

Для полного удаления используйте скрипт `uninstall.sh`:

```bash
cd /tmp/readlog-offline-20261102
sudo chmod +x uninstall.sh
sudo ./uninstall.sh
```

Скрипт удалит:
- Systemd-сервис `readlog`
- Директории `/opt/readlog`, `/var/www/html/readlog`, `/var/log/readlog`
- Конфиг Apache `/etc/httpd/conf.d/readlog.conf`
- Пользователя `readlog`
- Правила firewall (порт 3001)

**НЕ удаляется:** `/opt/assembly_visual/logs/` (логи Java)

## Полезные команды

```bash
# Запуск/остановка/перезапуск
sudo systemctl start readlog
sudo systemctl stop readlog
sudo systemctl restart readlog

# Статус
sudo systemctl status readlog

# Логи
sudo journalctl -u readlog -f
sudo tail -f /var/log/readlog/server.log
sudo tail -f /var/log/readlog/error.log

# API
curl http://localhost:5555/api/info

# Веб-интерфейс
# http://omega-test-02.pmz.motor.loc:5555/
```

## Контакты

При возникновении проблем проверьте:
1. Логи: `sudo journalctl -u readlog -n 50`
2. Права: `ls -la /opt/readlog/`
3. Конфиг: `cat /opt/readlog/config.json`
4. Структура: `tree /opt/readlog/ -L 2`
