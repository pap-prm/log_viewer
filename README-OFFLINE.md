# ReadLog — Оффлайн установка на РЕД ОС 8.0.3

## Обзор

Этот пакет содержит всё необходимое для установки ReadLog на сервер без доступа к интернету.

**Состав пакета:**
- Исходный код приложения (React + TypeScript + Vite)
- Предзагруженные npm-зависимости
- Готовая production-сборка (папка `dist/`)
- Скрипты установки
- Конфигурация Apache

**Структура установки:**
- Приложение: `/opt/readlog/`
- Веб-файлы: `/var/www/html/readlog/` (стандартная директория Apache)
- Логи Java: `/opt/assembly_visual/logs/`
- Логи сервиса: `/var/log/readlog/`

---

## Вариант 1: Быстрая установка (только статический сайт)

Если нужен **только веб-интерфейс** без API сервера:

### На машине с интернетом — подготовка

```bash
# 1. Собрать production-версию
npm install
npm run build

# 2. Создать архив только с dist/
tar -czf readlog-dist.tar.gz dist/ apache-logviewer.conf
```

### На сервере РЕД ОС — установка

```bash
# 1. Установить Apache
sudo dnf install httpd

# 2. Разместить файлы
sudo mkdir -p /var/www/html/readlog
sudo tar -xzf readlog-dist.tar.gz -C /tmp
sudo cp -r /tmp/dist/* /var/www/html/readlog/
sudo cp /tmp/apache-logviewer.conf /etc/httpd/conf.d/readlog.conf

# 3. Настроить SELinux
sudo semanage fcontext -a -t httpd_sys_content_t "/var/www/html/readlog(/.*)?"
sudo restorecon -Rv /var/www/html/readlog

# 4. Открыть порт в firewall
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload

# 5. Запустить Apache
sudo systemctl enable --now httpd
```

**Готово!** Сайт доступен на `http://server-ip/readlog/`

---

## Вариант 2: Полная установка (с возможностью пересборки)

### ЭТАП 1: Подготовка пакета (на машине С интернетом)

```bash
# 1. Убедитесь, что все зависимости установлены
npm install

# 2. Запустите скрипт подготовки оффлайн-пакета
chmod +x prepare-offline.sh
./prepare-offline.sh

# Результат: файл readlog-offline-YYYYMMDD.tar.gz
```

**Что делает скрипт:**
- Копирует весь исходный код
- Устанавливает и кеширует npm-зависимости
- Создаёт локальные `.tgz` пакеты всех зависимостей
- Собирает production-версию
- Упаковывает всё в один архив

### ЭТАП 2: Передача на сервер

```bash
# Скопируйте архив на целевой сервер
scp readlog-offline-*.tar.gz user@redos-server:/tmp/
```

### ЭТАП 3: Установка (на сервере БЕЗ интернета)

```bash
# 1. Распаковать архив
cd /tmp
tar -xzf readlog-offline-*.tar.gz
cd readlog-offline-*

# 2. Запустить установку
chmod +x install-offline.sh
sudo ./install-offline.sh
```

**Что делает скрипт:**
- Создаёт пользователя `readlog`
- Копирует приложение в `/opt/readlog/`
- **Копирует веб-файлы в `/var/www/html/readlog/`**
- Устанавливает npm-зависимости из локального кэша
- Собирает production-версию (если нужно)
- Настраивает SELinux
- Создаёт systemd-сервис

### ЭТАП 4: Настройка Apache

```bash
# 1. Установить Apache (если ещё не установлен)
sudo dnf install httpd

# 2. Конфиг уже скопирован в /etc/httpd/conf.d/readlog.conf

# 3. Настроить SELinux
sudo setsebool -P httpd_can_network_connect on

# 4. Перезапустить Apache
sudo systemctl restart httpd
```

---

## Вариант 3: Ручная оффлайн-установка

Если скрипты не работают, можно установить вручную:

### На машине с интернетом

```bash
# 1. Установить зависимости
npm install

# 2. Создать tarball всех пакетов
mkdir npm-offline
cd npm-offline

# Получить список всех пакетов и скачать их
npm ls --all --parseable | tail -n +2 | while read pkg; do
    pkg_name=$(basename $pkg)
    npm pack $pkg_name 2>/dev/null || true
done

cd ..

# 3. Создать архив
tar -czf readlog-manual.tar.gz \
    --exclude='node_modules' \
    --exclude='.git' \
    . \
    npm-offline/
```

### На сервере без интернета

```bash
# 1. Распаковать
tar -xzf readlog-manual.tar.gz
cd readlog

# 2. Установить из локальных пакетов
npm install npm-offline/*.tgz --offline

# 3. Собрать
npm run build

# 4. Разместить для Apache
sudo mkdir -p /var/www/html/readlog
sudo cp -r dist/* /var/www/html/readlog/
sudo chown -R root:apache /var/www/html/readlog
```

---

## Проверка установки

```bash
# Проверить веб-файлы
ls -la /var/www/html/readlog/
# Должны быть: index.html, assets/

# Проверить приложение
ls -la /opt/readlog/

# Проверить Apache
sudo systemctl status httpd
curl http://localhost/readlog/

# Проверить API (если установлен)
curl http://localhost:3001/api/info

# Проверить SELinux
getenforce
# Должно быть: Enforcing или Permissive

# Проверить логи
sudo tail -f /var/log/httpd/error_log
sudo tail -f /var/log/readlog/server.log
```

---

## Обновление приложения

### На машине с интернетом

```bash
# 1. Обновить код
# ... внести изменения ...

# 2. Пересобрать
npm run build

# 3. Создать архив только с dist/
tar -czf readlog-update-$(date +%Y%m%d).tar.gz dist/
```

### На сервере

```bash
# 1. Остановить Apache (опционально)
sudo systemctl stop httpd

# 2. Сделать бэкап
sudo cp -r /var/www/html/readlog /var/www/html/readlog.backup.$(date +%Y%m%d)

# 3. Обновить файлы
sudo tar -xzf readlog-update-*.tar.gz --strip-components=1 -C /var/www/html/readlog/

# 4. Запустить Apache
sudo systemctl start httpd
```

---

## Устранение неполадок

### Ошибка 403 Forbidden

```bash
# Проверить права
sudo ls -la /var/www/html/readlog/
# Должно быть: root:apache, 755

# Проверить SELinux
sudo ls -laZ /var/www/html/readlog/
# Должно быть: httpd_sys_content_t

# Исправить SELinux
sudo restorecon -Rv /var/www/html/readlog/
```

### Ошибка 500 Internal Server Error

```bash
# Проверить логи Apache
sudo tail -50 /var/log/httpd/error_log

# Проверить синтаксис конфига
sudo httpd -t
```

### Node.js не найден

```bash
# Установить из локального RPM (если есть)
sudo dnf install --disablerepo='*' /path/to/nodejs.rpm

# Или использовать только статические файлы (без Node.js)
# См. Вариант 1
```

### API сервер не запускается

```bash
# Проверить логи
sudo journalctl -u readlog -n 50

# Проверить конфиг
sudo nano /opt/readlog/config.json

# Проверить права
sudo chown -R readlog:readlog /opt/readlog/
```

---

## Структура файлов после установки

```
/opt/readlog/              ← Исходный код + зависимости (если полная установка)
├── server.js              ← Node.js сервер
├── config.json            ← Конфигурация
├── node_modules/          ← Зависимости
└── package.json

/var/www/html/readlog/     ← Файлы для веб-сервера (стандартная директория Apache)
├── index.html
└── assets/
    ├── index-*.js
    └── index-*.css

/opt/assembly_visual/logs/ ← Логи Java приложения
/var/log/readlog/          ← Логи сервиса ReadLog
```

---

## Требования

**Для подготовки пакета:**
- Node.js 18+
- npm 9+
- Интернет-соединение

**Для установки на сервер:**
- РЕД ОС 8.0.3
- Apache 2.4+
- Node.js 18+ (только для полной установки, вариант 2)
- 100 MB свободного места

**Для быстрого развёртывания (вариант 1):**
- РЕД ОС 8.0.3
- Apache 2.4+
- 10 MB свободного места
- Node.js **НЕ требуется**

---

## Поддержка

При возникновении проблем:

1. Проверьте логи: `sudo journalctl -u httpd -f`
2. Проверьте SELinux: `sudo ausearch -m AVC -ts recent`
3. Проверьте firewall: `sudo firewall-cmd --list-all`
4. Проверьте API: `sudo journalctl -u readlog -f`

---

## Лицензия

Проект создан для внутреннего использования.
