# ReadLog - Веб-сервис для просмотра логов

Веб-сервис для чтения и анализа текстовых логов из папки `/opt/assembly_visual/logs/` с подсветкой ключевых слов, фильтрацией, поиском и live-режимом (аналог `tail -f`).

## Возможности

- **Просмотр логов** с подсветкой уровней (ERROR, WARN, FATAL, INFO, DEBUG, TRACE)
- **Live режим** - автоматическое обновление в реальном времени при появлении новых записей
- **Управление несколькими папками** - добавление и переключение между разными директориями с логами
- **Гибкая настройка обновления** - выбор интервала (мгновенно, 5, 10, 15, 20, 30, 60 сек)
- **Пауза мониторинга** - кнопка Стоп/Старт для временной остановки отображения
- **Автоматическое обнаружение новых файлов** - новые логи сразу появляются в списке
- **Поиск и фильтрация** по уровням и ключевым словам
- **Экспорт** в CSV, копирование в буфер, скачивание файлов
- **Белый список IP** для контроля доступа
- **Авторизация LDAP/AD** (опционально)

## Структура установки

```
/opt/readlog/                      ← Приложение
├── server.js                      ← Node.js сервер
├── websocket.js                   ← WebSocket для live-режима
├── config.json                    ← Конфигурация
└── node_modules/                  ← Зависимости

/var/www/html/readlog/             ← Статические файлы (Apache)
├── index.html
└── assets/

/opt/assembly_visual/logs/         ← Логи Java (источник данных)
/var/log/readlog/                  ← Логи сервиса
/etc/httpd/conf.d/readlog.conf     ← Конфиг Apache
```

## Установка

### 1. Подготовка пакета (на машине с интернетом)

```bash
# Установить зависимости
npm install

# Собрать пакет
./prepare-offline.sh
```

Результат: `readlog-offline-YYYYMMDD.tar.gz`

### 2. Установка на сервере (без интернета)

```bash
# Распаковать архив
cd /tmp
sudo tar -xzf readlog-offline-*.tar.gz
cd readlog-offline-*

# Запустить установку
sudo ./install-offline.sh
```

Скрипт автоматически:
- Создаст пользователя `readlog`
- Создаст директории `/opt/readlog`, `/var/log/readlog`, `/var/www/html/readlog`
- Установит зависимости
- Скопирует файлы
- Настроит systemd-сервис
- Настроит Apache и SELinux
- Настроит права доступа (ACL)

### 3. Настройка прав доступа

```bash
# Установить ACL утилиты
sudo dnf install -y acl

# Добавить пользователя readlog в группу jenkins
sudo usermod -aG jenkins readlog

# Установить ACL для автоматического предоставления прав на новые файлы
sudo setfacl -R -m u:readlog:rX /opt/assembly_visual/logs
sudo setfacl -R -d -m u:readlog:rX /opt/assembly_visual/logs
```

### 4. Запуск

```bash
sudo systemctl start readlog
sudo systemctl start httpd
```

## Конфигурация

Файл: `/opt/readlog/config.json`

### Порт сервера

```json
{
  "server": {
    "port": 5555,
    "host": "0.0.0.0"
  }
}
```

### Путь к логам

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
        "::1",
        "192.168.1.0/24",
        "10.0.0.0/8",
        "10.200.10.12"
      ]
    }
  }
}
```

### Авторизация LDAP (опционально)

```json
{
  "security": {
    "auth": {
      "enabled": true,
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
    }
  }
}
```

## Использование

### Веб-интерфейс

Откройте в браузере: `http://omega-test-02.pmz.motor.loc:5555/`

### Интерфейс

Приложение работает в **Live режиме** (аналог `tail -f`) с расширенными возможностями управления:

#### Верхняя панель управления

- **Стоп/Старт** - приостановка и возобновление отображения новых строк
- **Интервал** - выбор частоты обновления (Мгновенно, 5, 10, 15, 20, 30, 60 сек)
- **Отключить/Подключить** - управление WebSocket соединением
- **Автопрокрутка** - автоматическая прокрутка к новым записям
- **Очистить** - очистка экрана от старых записей
- **Скачать** - экспорт текущего лога

#### Левая панель

- **Папки с логами** - управление несколькими директориями с логами
  - Добавление новых папок через кнопку "+"
  - Переключение между папками
  - Удаление папок (кроме последней)
- **Список файлов** - автоматическое обнаружение новых файлов
  - WebSocket уведомления для мгновенного обновления
  - Резервный механизм - периодический опрос каждые 5 секунд

### Управление папками

#### Добавление папки

1. Нажмите кнопку "+" в секции "Папки с логами"
2. Введите название папки (например, "Логи приложения")
3. Введите путь к папке (например, `/var/log/app/`)
4. Нажмите "Добавить"

#### Переключение между папками

1. Нажмите на нужную папку в списке
2. Список файлов обновится автоматически
3. Выберите файл для просмотра

### Экспорт

- Скачивание полного лога
- Скачивание отфильтрованных записей
- Экспорт в CSV для анализа в Excel
- Копирование в буфер обмена

## Управление сервисом

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
```

## Проверка работы

```bash
# Проверить статус сервиса
sudo systemctl status readlog

# Проверить логи
sudo tail -f /var/log/readlog/server.log

# Проверить API
curl http://localhost:5555/api/info

# Проверить WebSocket
# В консоли браузера (F12):
const ws = new WebSocket('ws://omega-test-02.pmz.motor.loc:5555/ws/logs');
ws.onopen = () => console.log('✓ WebSocket подключён');
```

## Устранение неполадок

### Сервис не запускается

```bash
# Проверить логи
sudo journalctl -u readlog -n 50

# Проверить синтаксис server.js
node -c /opt/readlog/server.js

# Проверить права
sudo chown -R readlog:readlog /opt/readlog
```

### Нет доступа к файлам логов

```bash
# Проверить права на директорию
ls -la /opt/assembly_visual/logs/

# Установить ACL
sudo setfacl -R -m u:readlog:rX /opt/assembly_visual/logs
sudo setfacl -R -d -m u:readlog:rX /opt/assembly_visual/logs

# Проверить чтение
sudo -u readlog cat /opt/assembly_visual/logs/app.log
```

### Новые файлы не появляются

```bash
# Проверить WebSocket подключение
# В консоли браузера (F12):
const ws = new WebSocket('ws://omega-test-02.pmz.motor.loc:5555/ws/files');
ws.onopen = () => console.log('✓ File watcher подключён');
ws.onmessage = (e) => console.log('Уведомление:', JSON.parse(e.data));

# Проверить логи сервера
sudo tail -f /var/log/readlog/server.log
```

### Порт закрыт

```bash
# Проверить firewall
sudo firewall-cmd --list-ports

# Открыть порт
sudo firewall-cmd --permanent --add-port=5555/tcp
sudo firewall-cmd --reload
```

## Удаление

```bash
sudo ./uninstall.sh
```

Скрипт удалит:
- Systemd-сервис `readlog`
- Директории `/opt/readlog`, `/var/www/html/readlog`, `/var/log/readlog`
- Конфиг Apache `/etc/httpd/conf.d/readlog.conf`
- Пользователя `readlog`
- Правила firewall (порт 5555)

**Не удаляется:** `/opt/assembly_visual/logs/` (логи Java)

## Технологии

- **Frontend:** React 18, TypeScript, Tailwind CSS, Vite
- **Backend:** Node.js, Express, WebSocket (ws)
- **File watching:** chokidar
- **Server:** Apache 2.4, systemd
- **OS:** РЕД ОС 8.0.3

## Лицензия

Проект создан для внутреннего использования.
