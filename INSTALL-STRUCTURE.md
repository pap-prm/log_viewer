# ReadLog — Структура установки

## Обзор

Приложение устанавливается в директорию `/opt/readlog`, веб-файлы размещаются в стандартной директории Apache `/var/www/html/readlog/`

## Структура директорий

```
/opt/readlog/                      ← Корневая директория приложения
├── server.js                      ← Node.js сервер
├── config.json                    ← Конфигурация приложения
├── package.json                   ← Зависимости Node.js
└── node_modules/                  ← Установленные зависимости

/var/www/html/readlog/             ← Статические файлы (стандартная директория Apache)
├── index.html
└── assets/
    ├── index-*.js
    └── index-*.css

/opt/assembly_visual/logs/         ← Логи Java приложения (источник данных)
├── app-2026-10-22.log
└── app.log

/var/log/readlog/                  ← Логи сервиса ReadLog
├── server.log
└── error.log

/etc/httpd/conf.d/readlog.conf     ← Конфиг Apache
/etc/systemd/system/readlog.service ← Systemd сервис
```

## Варианты установки

### Вариант 1: Только статический сайт (Apache)

**Команда:** `./build-dist-only.sh`  
**Размер:** ~10 MB  
**Путь установки веб-файлов:** `/var/www/html/readlog/`  
**Node.js на сервере:** НЕ нужен

```bash
# На машине с интернетом
./build-dist-only.sh
scp readlog-dist-*.tar.gz server:/tmp/

# На сервере
cd /tmp && tar -xzf readlog-dist-*.tar.gz
cd readlog-dist-* && sudo ./install.sh
```

**Что делает install.sh:**
- Создаёт `/var/www/html/readlog/`
- Копирует файлы из `dist/` в `/var/www/html/readlog/`
- Копирует конфиг в `/etc/httpd/conf.d/readlog.conf`
- Настраивает SELinux и firewall
- Перезапускает Apache

---

### Вариант 2: Полная установка (с API и whitelist)

**Команда:** `./prepare-offline.sh`  
**Размер:** ~100-200 MB  
**Путь установки приложения:** `/opt/readlog/`  
**Путь веб-файлов:** `/var/www/html/readlog/`  
**Node.js на сервере:** Нужен

```bash
# На машине с интернетом
./prepare-offline.sh
scp readlog-offline-*.tar.gz server:/tmp/

# На сервере
cd /tmp && tar -xzf readlog-offline-*.tar.gz
cd readlog-offline-* && sudo ./install-offline.sh
```

**Что делает install-offline.sh:**
- Создаёт пользователя `readlog`
- Создаёт `/opt/readlog/` и `/var/log/readlog/`
- Копирует приложение в `/opt/readlog/`
- Устанавливает npm-зависимости
- Собирает production-версию
- **Копирует веб-файлы в `/var/www/html/readlog/`**
- Создаёт systemd-сервис `readlog`
- Настраивает SELinux и firewall

---

## Управление сервисом

```bash
# Запуск/остановка/перезапуск API сервера
sudo systemctl start readlog
sudo systemctl stop readlog
sudo systemctl restart readlog

# Статус
sudo systemctl status readlog

# Логи
sudo journalctl -u readlog -f
tail -f /var/log/readlog/server.log
tail -f /var/log/readlog/error.log

# Управление Apache
sudo systemctl start httpd
sudo systemctl restart httpd
```

---

## Конфигурация

Файл: `/opt/readlog/config.json`

```json
{
  "server": {
    "port": 3001,
    "host": "0.0.0.0"
  },
  "logs": {
    "directory": "/opt/assembly_visual/logs/"
  },
  "security": {
    "whitelist": {
      "enabled": true,
      "ips": ["127.0.0.1", "192.168.1.0/24"]
    },
    "auth": {
      "enabled": false
    }
  }
}
```

После изменения конфигурации:
```bash
sudo systemctl restart readlog
```

---

## Проверка работы

```bash
# Проверить веб-файлы
ls -la /var/www/html/readlog/

# Проверить приложение
ls -la /opt/readlog/

# Проверить API
curl http://localhost:3001/api/info

# Проверить логи
sudo systemctl status readlog
sudo tail -f /var/log/readlog/server.log

# Проверить SELinux
ls -laZ /var/www/html/readlog/
```

---

## Обновление

### Быстрое обновление (только веб-файлы)

```bash
# На машине с интернетом
npm run build
tar -czf update.tar.gz dist/
scp update.tar.gz server:/tmp/

# На сервере
sudo tar -xzf /tmp/update.tar.gz --strip-components=1 -C /var/www/html/readlog/
sudo systemctl restart httpd
```

### Полное обновление

```bash
# На машине с интернетом
./prepare-offline.sh
scp readlog-offline-*.tar.gz server:/tmp/

# На сервере
cd /tmp && tar -xzf readlog-offline-*.tar.gz
cd readlog-offline-*
sudo ./install-offline.sh
```

---

## Удаление

```bash
# Остановить сервис
sudo systemctl stop readlog
sudo systemctl disable readlog

# Удалить файлы приложения
sudo rm -rf /opt/readlog
sudo rm -rf /var/log/readlog

# Удалить веб-файлы
sudo rm -rf /var/www/html/readlog

# Удалить конфиги
sudo rm /etc/httpd/conf.d/readlog.conf
sudo rm /etc/systemd/system/readlog.service

# Перезагрузить systemd
sudo systemctl daemon-reload
sudo systemctl restart httpd

# Удалить пользователя (опционально)
sudo userdel readlog
```

---

## Troubleshooting

### Ошибка: Permission denied при чтении логов

```bash
# Проверить права на директорию с логами
ls -la /opt/assembly_visual/logs/

# Дать права на чтение
sudo chmod 755 /opt/assembly_visual/logs/
sudo chmod 644 /opt/assembly_visual/logs/*.log

# Проверить SELinux
sudo restorecon -Rv /opt/assembly_visual/logs/
```

### Ошибка: 403 Forbidden

```bash
# Проверить свой IP
curl ifconfig.me

# Добавить IP в whitelist
sudo nano /opt/readlog/config.json
# Добавить IP в массив "ips"

# Перезапустить сервис
sudo systemctl restart readlog
```

### Ошибка: Порт 3001 уже занят

```bash
# Проверить кто занимает порт
sudo ss -tulpn | grep 3001

# Изменить порт в конфиге
sudo nano /opt/readlog/config.json
# Изменить "port": 3001 на другой

# Перезапустить сервис
sudo systemctl restart readlog
```

### Сервис не запускается

```bash
# Проверить логи
sudo journalctl -u readlog -n 50

# Проверить синтаксис config.json
sudo node -e "console.log(JSON.parse(require('fs').readFileSync('/opt/readlog/config.json')))"

# Проверить права
ls -la /opt/readlog/
sudo chown -R readlog:readlog /opt/readlog/
```

### Веб-интерфейс не открывается

```bash
# Проверить что Apache запущен
sudo systemctl status httpd

# Проверить веб-файлы
ls -la /var/www/html/readlog/

# Проверить SELinux
ls -laZ /var/www/html/readlog/
sudo restorecon -Rv /var/www/html/readlog/

# Проверить конфиг Apache
sudo httpd -t
```

---

## Итого

| Параметр | Значение |
|----------|----------|
| Директория приложения | `/opt/readlog/` |
| Директория веб-файлов | `/var/www/html/readlog/` |
| Директория с логами | `/opt/assembly_visual/logs/` |
| Логи сервиса | `/var/log/readlog/` |
| Пользователь сервиса | `readlog` |
| Имя сервиса systemd | `readlog` |
| Порт API | `3001` |
| Конфиг Apache | `/etc/httpd/conf.d/readlog.conf` |
| Конфиг приложения | `/opt/readlog/config.json` |
| URL веб-интерфейса | `http://server-ip/readlog/` |
