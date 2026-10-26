# Оффлайн установка Log Viewer — Сводка

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
| `apache-logviewer.conf` | Конфиг Apache (HTTP + HTTPS с AD авторизацией) |

### Документация

| Файл | Содержимое |
|------|-----------|
| `QUICKSTART.md` | Быстрый старт (3 команды) |
| `README-OFFLINE.md` | Полная документация по всем вариантам установки |

---

## Варианты установки

### Вариант 1: Только статический сайт (рекомендуется)

**Размер пакета:** ~10 MB  
**Требования на сервере:** Apache 2.4+  
**Node.js на сервере:** НЕ нужен

```bash
# На машине с интернетом
./build-dist-only.sh
scp log-viewer-dist-*.tar.gz server:/tmp/

# На сервере
cd /tmp && tar -xzf log-viewer-dist-*.tar.gz
cd log-viewer-dist-* && sudo ./install.sh
```

### Вариант 2: Полная установка с пересборкой

**Размер пакета:** ~100-200 MB  
**Требования на сервере:** Apache 2.4+, Node.js 18+  
**Node.js на сервере:** Нужен

```bash
# На машине с интернетом
./prepare-offline.sh
scp log-viewer-offline-*.tar.gz server:/tmp/

# На сервере
cd /tmp && tar -xzf log-viewer-offline-*.tar.gz
cd log-viewer-offline-* && sudo ./install-offline.sh
```

---

## Что входит в каждый пакет

### Пакет от `build-dist-only.sh`

```
log-viewer-dist-YYYYMMDD/
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
log-viewer-offline-YYYYMMDD/
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

## AD-авторизация

После установки отредактируйте `/etc/httpd/conf.d/logviewer.conf`:

```apache
<Location />
    AuthType            basic
    AuthName            "Log Viewer — AD Authorization"
    AuthBasicProvider   ldap
    AuthLDAPURL         "ldaps://dc01.company.local:636/DC=company,DC=local?sAMAccountName?sub?(objectClass=person)" TLS
    AuthLDAPBindDN      "CN=ldap_bind,OU=Service,DC=company,DC=local"
    AuthLDAPBindPassword "file:/etc/httpd/conf/ldap_bind_password"
    
    # Доступ только членам группы
    Require ldap-group CN=LogViewers,OU=Groups,DC=company,DC=local
</Location>
```

Создайте файл с паролем:
```bash
sudo install -m 640 -o root -g apache /dev/null /etc/httpd/conf/ldap_bind_password
echo -n "PasswordOfBindUser" | sudo tee /etc/httpd/conf/ldap_bind_password
```

Настройте SELinux:
```bash
sudo setsebool -P httpd_can_connect_ldap on
```

---

## Проверка после установки

```bash
# Статус Apache
sudo systemctl status httpd

# Логи
sudo tail -f /var/log/httpd/error_log

# Файлы сайта
ls -la /var/www/logviewer/

# SELinux контекст
ls -laZ /var/www/logviewer/
```

---

## Обновление

### Быстрое обновление (только dist/)

```bash
# На машине с интернетом
npm run build
tar -czf update.tar.gz dist/
scp update.tar.gz server:/tmp/

# На сервере
sudo tar -xzf /tmp/update.tar.gz -C /var/www/logviewer/ --strip-components=1
sudo systemctl restart httpd
```

---

## Устранение неполадок

| Проблема | Решение |
|----------|---------|
| 403 Forbidden | Проверить SELinux: `sudo restorecon -Rv /var/www/logviewer/` |
| 500 Error | Проверить логи: `sudo tail /var/log/httpd/error_log` |
| Нет доступа к AD | Проверить: `sudo setsebool -P httpd_can_connect_ldap on` |
| Порт закрыт | Открыть: `sudo firewall-cmd --permanent --add-service=http` |

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
