# Оффлайн установка ReadLog — Сводка

## Созданные файлы

### Скрипты для подготовки пакета (на машине С интернетом)

| Файл | Назначение | Когда использовать |
|------|-----------|-------------------|
| `build-dist-only.sh` | Создаёт минимальный пакет только с `dist/` | **Рекомендуется** — самый быстрый способ |
| `prepare-offline.sh` | Создаёт полный пакет с исходниками + зависимостями | Если нужна возможность пересборки на сервере |

### Скрипты для установки (на сервере БЕЗ интернета)

| Файл | Назначение | Когда использовать |
|------|-----------|-------------------|
| `install.sh` (внутри пакета) | Простая установка статических файлов | С пакетом от `build-dist-only.sh` |
| `install-offline.sh` | Полная установка с npm-зависимостями | С пакетом от `prepare-offline.sh` |

### Конфигурация

| Файл | Назначение |
|------|-----------|
| `apache-logviewer.conf` | Конфиг Apache (копируется в `/etc/httpd/conf.d/readlog.conf`) |

### Документация

| Файл | Содержимое |
|------|-----------|
| `QUICKSTART.md` | Быстрый старт (3 команды) |
| `README-OFFLINE.md` | Полная документация по всем вариантам установки |
| `INSTALL-STRUCTURE.md` | Структура директорий после установки |

---

## Варианты установки

### Вариант 1: Только статический сайт (рекомендуется)

**Размер пакета:** ~10 MB  
**Требования на сервере:** Apache 2.4+  
**Node.js на сервере:** НЕ нужен

```bash
# На машине с интернетом
./build-dist-only.sh
scp readlog-dist-*.tar.gz server:/tmp/

# На сервере
cd /tmp && tar -xzf readlog-dist-*.tar.gz
cd readlog-dist-* && sudo ./install.sh
```

### Вариант 2: Полная установка с пересборкой

**Размер пакета:** ~100-200 MB  
**Требования на сервере:** Apache 2.4+, Node.js 18+  
**Node.js на сервере:** Нужен

```bash
# На машине с интернетом
./prepare-offline.sh
scp readlog-offline-*.tar.gz server:/tmp/

# На сервере
cd /tmp && tar -xzf readlog-offline-*.tar.gz
cd readlog-offline-* && sudo ./install-offline.sh
```

---

## Что входит в каждый пакет

### Пакет от `build-dist-only.sh`

```
readlog-dist-YYYYMMDD/
├── dist/                    ← Production-сборка (готовый сайт)
│   ├── index.html
│   └── assets/
│       ├── index-*.js
│       └── index-*.css
├── apache-logviewer.conf    ← Конфиг Apache
└── install.sh               ← Скрипт установки
```

### Пакет от `prepare-offline.sh`

```
readlog-offline-YYYYMMDD/
├── src/                     ← Исходный код
├── dist/                    ← Production-сборка
├── node_modules/            ← Установленные зависимости
├── npm-cache/               ← Локальный кэш npm
├── offline-packages/        ← Локальные .tgz пакеты
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.js
├── install-offline.sh       ← Скрипт установки
├── apache-logviewer.conf    ← Конфиг Apache
└── README-OFFLINE.md        ← Документация
```

---

## Структура установки на сервере

```
/opt/readlog/                      ← Приложение (если полная установка)
├── server.js                      ← Node.js сервер
├── config.json                    ← Конфигурация
└── node_modules/                  ← Зависимости

/var/www/html/readlog/             ← Статические файлы (стандартная директория Apache)
├── index.html
└── assets/
    ├── index-*.js
    └── index-*.css

/opt/assembly_visual/logs/         ← Логи Java приложения (источник данных)
/var/log/readlog/                  ← Логи сервиса ReadLog

/etc/httpd/conf.d/readlog.conf     ← Конфиг Apache
/etc/systemd/system/readlog.service ← Systemd сервис
```

---

## Доступ к веб-интерфейсу

После установки веб-интерфейс доступен по адресу:
```
http://server-ip/readlog/
```

---

## Управление сервисом

```bash
# API сервер (если установлен)
sudo systemctl start readlog       # Запуск
sudo systemctl stop readlog        # Остановка
sudo systemctl restart readlog     # Перезапуск
sudo systemctl status readlog      # Статус
sudo journalctl -u readlog -f      # Логи

# Apache
sudo systemctl start httpd
sudo systemctl restart httpd
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

---

## Устранение неполадок

| Проблема | Решение |
|----------|---------|
| 403 Forbidden | Проверить SELinux: `sudo restorecon -Rv /var/www/html/readlog/` |
| 500 Error | Проверить логи: `sudo tail /var/log/httpd/error_log` |
| API не работает | Проверить: `sudo journalctl -u readlog -n 50` |
| Порт закрыт | Открыть: `sudo firewall-cmd --permanent --add-service=http` |
| Веб-интерфейс не открывается | Проверить: `ls -la /var/www/html/readlog/` |

---

## Итого

**Для быстрого развёртывания:**
```bash
./build-dist-only.sh
# →scp→ tar -xzf && sudo ./install.sh
```

**Для полной установки с пересборкой:**
```bash
./prepare-offline.sh
# →scp→ tar -xzf && sudo ./install-offline.sh
```

**Документация:**
- Быстрый старт: `QUICKSTART.md`
- Полная инструкция: `README-OFFLINE.md`
- Структура установки: `INSTALL-STRUCTURE.md`

**Ключевые пути:**
- Приложение: `/opt/readlog/`
- Веб-файлы: `/var/www/html/readlog/`
- Логи Java: `/opt/assembly_visual/logs/`
- URL: `http://server-ip/readlog/`
