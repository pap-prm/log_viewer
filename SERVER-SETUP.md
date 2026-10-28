# Настройка сервера Log Viewer

## Обзор

Серверная часть предоставляет:
- API для чтения логов из указанной директории
- **Гибкую систему безопасности** с независимым включением/отключением:
  - Белый список IP-адресов
  - Авторизация LDAP/AD
- Возможность загрузки/скачивания файлов

## Структура файлов

```
server/
├── config.json      ← Конфигурация (путь к логам, безопасность)
├── server.js        ← Код сервера (Express)
└── package.json     ← Зависимости Node.js
```

## Структура установки на сервере

```
/opt/readlog/                      ← Приложение
├── server.js                      ← Node.js сервер
├── config.json                    ← Конфигурация
└── node_modules/                  ← Зависимости

/var/www/html/readlog/             ← Статические файлы (стандартная директория Apache)
├── index.html
└── assets/

/opt/assembly_visual/logs/         ← Логи Java приложения (источник данных)
/var/log/readlog/                  ← Логи сервиса

/etc/httpd/conf.d/readlog.conf     ← Конфиг Apache
```

## Установка

### На машине разработки (сборка фронтенда)

```bash
npm install
npm run build
# Папка dist/ будет раздаваться сервером
```

### На сервере РЕД ОС

```bash
# Скопировать файлы
scp -r server/ dist/ install-server.sh user@server:/tmp/

# На сервере
cd /tmp
chmod +x install-server.sh
sudo ./install-server.sh

# Приложение будет установлено в /opt/readlog
# Веб-файлы будут размещены в /var/www/html/readlog/
# Логи сервиса: /var/log/readlog/
# Доступ: http://server-ip/readlog/
```

## Конфигурация безопасности

Подробная документация: **SECURITY-CONFIG.md**

### Быстрая настройка

#### Вариант 1: Только белый список IP

```json
{
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

#### Вариант 2: Только авторизация LDAP

```json
{
  "security": {
    "whitelist": {
      "enabled": false
    },
    "auth": {
      "enabled": true,
      "type": "ldap",
      "ldap": {
        "url": "ldaps://dc01.company.local:636",
        "baseDN": "DC=company,DC=local",
        "bindDN": "CN=ldap_bind,OU=Service,DC=company,DC=local",
        "bindPassword": "PasswordOfBindUser",
        "searchFilter": "(sAMAccountName={{username}})",
        "groupDN": "CN=LogViewers,OU=Groups,DC=company,DC=local"
      }
    }
  }
}
```

#### Вариант 3: Оба уровня защиты

```json
{
  "security": {
    "whitelist": {
      "enabled": true,
      "ips": ["192.168.1.0/24"]
    },
    "auth": {
      "enabled": true,
      "type": "ldap",
      "ldap": {
        "url": "ldaps://dc01.company.local:636",
        "baseDN": "DC=company,DC=local",
        "bindDN": "CN=ldap_bind,OU=Service,DC=company,DC=local",
        "bindPassword": "PasswordOfBindUser",
        "groupDN": "CN=LogViewers,OU=Groups,DC=company,DC=local"
      }
    }
  }
}
```

## Конфигурация (config.json)

### Путь к папке с логами

```json
{
  "logs": {
    "directory": "/opt/assembly_visual/logs/"
  }
}
```

### Полный пример конфигурации

```json
{
  "server": {
    "port": 3001,
    "host": "0.0.0.0"
  },
  "logs": {
    "directory": "/opt/assembly_visual/logs/",
    "filePattern": "*.log",
    "maxFileSize": 104857600,
    "maxFiles": 100
  },
  "security": {
    "whitelist": {
      "enabled": true,
      "ips": [
        "127.0.0.1",
        "::1",
        "192.168.1.0/24",
        "10.0.0.0/8"
      ]
    },
    "auth": {
      "enabled": false,
      "type": "ldap",
      "ldap": {
        "url": "ldaps://dc01.company.local:636",
        "baseDN": "DC=company,DC=local",
        "bindDN": "CN=ldap_bind,OU=Service,DC=company,DC=local",
        "bindPassword": "PasswordOfBindUser",
        "searchFilter": "(sAMAccountName={{username}})",
        "groupDN": "CN=LogViewers,OU=Groups,DC=company,DC=local",
        "groupAttribute": "member"
      }
    },
    "cors": {
      "enabled": true,
      "origins": [
        "http://localhost:3000",
        "http://logviewer.company.local"
      ]
    }
  },
  "features": {
    "enableUpload": true,
    "enableDownload": true,
    "maxUploadSize": 52428800
  }
}
```

## API endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/files` | Список файлов логов |
| GET | `/api/files/:name` | Содержимое файла |
| GET | `/api/download/:name` | Скачать файл |
| POST | `/api/upload` | Загрузить файл |
| GET | `/api/info` | Информация о сервере |

## Управление сервисом

```bash
sudo systemctl start readlog
sudo systemctl stop readlog
sudo systemctl restart readlog
sudo systemctl status readlog
sudo journalctl -u readlog -f
```

## Проверка работы

```bash
# Информация о сервере
curl http://server:3001/api/info

# Веб-интерфейс
# Откройте в браузере: http://server-ip/readlog/

# С запрещённого IP — получите 403
# Без авторизации (если auth.enabled=true) — получите 401

# Проверить логи:
sudo tail -f /var/log/readlog/server.log

# Проверить веб-файлы:
ls -la /var/www/html/readlog/
```

## Отладка

### Если доступ запрещён (403):
1. Проверьте свой IP: `curl ifconfig.me`
2. Добавьте его в `security.whitelist.ips`
3. Перезапустите: `sudo systemctl restart readlog`

### Если требуется авторизация (401):
1. Проверьте настройки LDAP в `config.json`
2. Убедитесь, что `auth.enabled = true`
3. Передайте учётные данные: `curl -u user:pass http://server:3001/api/info`

### Если файлы не читаются:
1. Проверьте права: `ls -la /opt/assembly_visual/logs/`
2. Проверьте SELinux: `sudo restorecon -Rv /opt/assembly_visual/logs/`
3. Проверьте путь в `config.json`

## Документация

- **SECURITY-CONFIG.md** — полная документация по настройке безопасности
- **SERVER-SETUP.md** — установка и настройка сервера (этот файл)
- **EXPORT-GUIDE.md** — функции экспорта и сохранения логов
- **README-OFFLINE.md** — оффлайн установка
