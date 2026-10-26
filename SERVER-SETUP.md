# Настройка сервера Log Viewer

## Обзор

Серверная часть предоставляет:
- API для чтения логов из указанной директории
- Белый список IP-адресов для контроля доступа
- Возможность загрузки/скачивания файлов

## Структура файлов

```
server/
├── config.json      ← Конфигурация (путь к логам, белый список)
├── server.js        ← Код сервера (Express)
└── package.json     ← Зависимости Node.js
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

### Белый список IP

```json
{
  "security": {
    "whitelist": {
      "enabled": true,
      "ips": [
        "127.0.0.1",
        "192.168.1.100",
        "192.168.1.0/24",
        "10.0.0.0/8",
        "172.16.0.0/12"
      ]
    }
  }
}
```

Поддерживаются:
- Точные IP: `"192.168.1.100"`
- Подсети (CIDR): `"192.168.1.0/24"`
- IPv6: `"::1"`, `"fe80::/10"`

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
sudo systemctl start log-viewer-server
sudo systemctl stop log-viewer-server
sudo systemctl restart log-viewer-server
sudo systemctl status log-viewer-server
sudo journalctl -u log-viewer-server -f
```

## Проверка работы

```bash
# С разрешённого IP
curl http://server:3001/api/info

# С запрещённого IP — получите 403
# Проверить логи:
sudo tail -f /var/log/log-viewer/server.log
```

## Отладка

Если доступ запрещён:
1. Проверьте свой IP: `curl ifconfig.me`
2. Добавьте его в `security.whitelist.ips`
3. Перезапустите: `sudo systemctl restart log-viewer-server`

Если файлы не читаются:
1. Проверьте права: `ls -la /opt/assembly_visual/logs/`
2. Проверьте SELinux: `sudo restorecon -Rv /opt/assembly_visual/logs/`
3. Проверьте путь в `config.json`
