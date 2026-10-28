# ReadLog — Быстрый старт

## Установка в /opt/readlog

### Самый быстрый способ (3 команды)

#### На машине с интернетом:

```bash
# 1. Собрать пакет
chmod +x build-dist-only.sh
./build-dist-only.sh

# 2. Передать на сервер
scp readlog-dist-*.tar.gz user@server:/tmp/
```

#### На сервере РЕД ОС:

```bash
# 3. Установить
cd /tmp
tar -xzf readlog-dist-*.tar.gz
cd readlog-dist-*
sudo ./install.sh
```

**Всё!** Файлы размещены в `/opt/readlog/www/`

---

## Структура установки

```
/opt/readlog/
├── www/                    ← Статические файлы для Apache
│   ├── index.html
│   └── assets/
│       ├── index-*.js
│       └── index-*.css
├── server.js               ← Node.js сервер (если полная установка)
├── config.json             ← Конфигурация
└── node_modules/           ← Зависимости (если полная установка)

/opt/assembly_visual/logs/  ← Логи Java приложения (источник данных)
/var/log/readlog/           ← Логи сервиса ReadLog
```

---

## Что делает install.sh

1. Создаёт директорию `/opt/readlog/www/`
2. Копирует файлы из `dist/` в `/opt/readlog/www/`
3. Копирует конфиг Apache в `/etc/httpd/conf.d/readlog.conf`
4. Настраивает права и SELinux
5. Открывает порт в firewall
6. Перезапускает Apache

---

## Требования на сервере

- РЕД ОС 8.0.3
- Apache 2.4+ (`sudo dnf install httpd`)
- **Node.js НЕ нужен** (для минимальной установки)

---

## Если нужна серверная часть (с API и whitelist)

```bash
# На машине с интернетом
chmod +x prepare-offline.sh
./prepare-offline.sh

# На сервере
tar -xzf readlog-offline-*.tar.gz
cd readlog-offline-*
sudo ./install-offline.sh
```

**Требования:** Node.js 18+ на сервере

---

## Конфигурация

После установки отредактируйте `/opt/readlog/config.json`:

```bash
sudo nano /opt/readlog/config.json
```

### Настройка пути к логам

```json
{
  "logs": {
    "directory": "/opt/assembly_visual/logs/"
  }
}
```

### Настройка белого списка IP

```json
{
  "security": {
    "whitelist": {
      "enabled": true,
      "ips": [
        "127.0.0.1",
        "192.168.1.0/24",
        "10.0.0.0/8"
      ]
    }
  }
}
```

---

## Управление сервисом

```bash
sudo systemctl start readlog       # Запуск
sudo systemctl stop readlog        # Остановка
sudo systemctl restart readlog     # Перезапуск
sudo systemctl status readlog      # Статус
sudo journalctl -u readlog -f      # Логи
```

---

## Проверка

```bash
# Проверить файлы
ls -la /opt/readlog/www/

# Проверить API (если сервер установлен)
curl http://localhost:3001/api/info

# Проверить логи
sudo tail -f /var/log/readlog/server.log
```

---

## Полезные ссылки

- Полная документация: `README-OFFLINE.md`
- Настройка безопасности: `SECURITY-CONFIG.md`
- Настройка сервера: `SERVER-SETUP.md`
- Функции экспорта: `EXPORT-GUIDE.md`
