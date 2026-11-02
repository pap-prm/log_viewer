#!/bin/bash
# install-offline.sh
# Скрипт установки на сервере БЕЗ интернета

set -e

echo "=== Установка ReadLog (оффлайн) ==="

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Проверка прав
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Ошибка: скрипт должен быть запущен от root${NC}"
    echo "Используйте: sudo ./install-offline.sh"
    exit 1
fi

# Сохраняем исходную директорию (где находится архив)
# Используем readlink -f для получения абсолютного пути
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Если запущено через sudo, SCRIPT_DIR может быть относительным
if [[ "$SCRIPT_DIR" != /* ]]; then
    SCRIPT_DIR="$(pwd)/$SCRIPT_DIR"
fi
echo -e "${YELLOW}Исходная директория: $SCRIPT_DIR${NC}"

# Проверка наличия dist/ в исходной директории
echo -e "${YELLOW}Проверка структуры архива...${NC}"
if [ ! -d "$SCRIPT_DIR/dist" ]; then
    echo -e "${RED}✗ Ошибка: dist/ не найден в $SCRIPT_DIR${NC}"
    echo -e "${YELLOW}Содержимое $SCRIPT_DIR:${NC}"
    ls -la "$SCRIPT_DIR/"
    echo ""
    echo -e "${YELLOW}Возможные причины:${NC}"
    echo -e "${YELLOW}  1. Архив не содержит dist/ (нужно пересобрать на машине с интернетом)${NC}"
    echo -e "${YELLOW}  2. Неправильная структура архива${NC}"
    echo ""
    echo -e "${YELLOW}Для пересборки на машине с интернетом:${NC}"
    echo -e "${YELLOW}  cd /path/to/project${NC}"
    echo -e "${YELLOW}  npm install${NC}"
    echo -e "${YELLOW}  npm run build${NC}"
    echo -e "${YELLOW}  ./prepare-offline.sh${NC}"
    exit 1
fi
echo -e "${GREEN}✓ dist/ найден в $SCRIPT_DIR/dist ($(ls "$SCRIPT_DIR/dist" | wc -l) файлов)${NC}"

# Проверка наличия server-deps/
if [ -d "$SCRIPT_DIR/server-deps" ]; then
    echo -e "${GREEN}✓ server-deps/ найден в $SCRIPT_DIR/server-deps${NC}"
else
    echo -e "${YELLOW}⚠ server-deps/ не найден (серверные зависимости будут установлены из offline-packages/)${NC}"
fi

# Конфигурация
APP_NAME="readlog"
APP_DIR="/opt/readlog"
SERVICE_NAME="readlog"
LOG_DIR="/var/log/readlog"
SERVICE_USER="readlog"
WEB_DIR="/var/www/html/readlog"

echo ""
echo -e "${YELLOW}Конфигурация:${NC}"
echo "  Директория приложения: $APP_DIR"
echo "  Директория веб-файлов: $WEB_DIR"
echo "  Директория логов Java: /opt/assembly_visual/logs/"
echo "  Логи сервиса:          $LOG_DIR"
echo "  Пользователь сервиса:  $SERVICE_USER"
echo ""

# 1. Проверка Node.js
echo -e "${YELLOW}[1/8] Проверка Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js не установлен!${NC}"
    echo ""
    echo "Установите Node.js из локального репозитория или RPM-пакета:"
    echo "  sudo dnf install -y nodejs npm"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}Node.js $NODE_VERSION найден${NC}"

# 2. Создание пользователя
echo -e "${YELLOW}[2/8] Создание пользователя сервиса...${NC}"
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd -r -s /sbin/nologin -d "$APP_DIR" "$SERVICE_USER"
    echo -e "${GREEN}Пользователь $SERVICE_USER создан${NC}"
else
    echo -e "${GREEN}Пользователь $SERVICE_USER уже существует${NC}"
fi

# 3. Создание директорий
echo -e "${YELLOW}[3/8] Создание директорий...${NC}"
mkdir -p "$APP_DIR"
mkdir -p "$LOG_DIR"
mkdir -p "$WEB_DIR"

# Создаём директорию с логами если её нет
if [ ! -d "/opt/assembly_visual/logs" ]; then
    echo -e "${YELLOW}⚠ Директория /opt/assembly_visual/logs не найдена${NC}"
    mkdir -p /opt/assembly_visual/logs
fi

# Настраиваем права на директорию с логами
# Владелец остаётся jenkins (или кто там пишет логи), но readlog должен иметь доступ на чтение
chmod 755 /opt/assembly_visual
chmod 755 /opt/assembly_visual/logs
# Даём всем пользователям право читать логи (файлы обычно 644 от jenkins)
chmod o+rX /opt/assembly_visual
chmod o+rX /opt/assembly_visual/logs

chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$LOG_DIR"
echo -e "${GREEN}✓ Директории созданы${NC}"

# 4. Установка приложения
echo -e "${YELLOW}[4/8] Установка приложения...${NC}"
# Копируем всё через tar с исключениями (не требует rsync)
# ВАЖНО: node_modules и server-deps НЕ исключаем - они нужны для оффлайн работы
# Переходим в исходную директорию перед созданием архива
cd "$SCRIPT_DIR"
tar -cf - \
    --exclude='*.tar.gz' \
    --exclude='.git' \
    --exclude='install-offline.sh' \
    --exclude='prepare-offline.sh' \
    --exclude='build-dist-only.sh' \
    --exclude='install-server.sh' \
    --exclude='npm-cache' \
    --exclude='offline-packages' \
    . | tar -xf - -C "$APP_DIR/"
cd "$APP_DIR"

# Копируем server.js, websocket.js и package.json из server/ в корень для удобства
# ВАЖНО: всегда перезаписываем, чтобы получить исправленную версию
if [ -f "$APP_DIR/server/server.js" ]; then
    cp "$APP_DIR/server/server.js" "$APP_DIR/server.js"
    cp "$APP_DIR/server/package.json" "$APP_DIR/package.json"
    echo -e "${GREEN}✓ server.js скопирован в корень (перезаписан)${NC}"
fi

if [ -f "$APP_DIR/server/websocket.js" ]; then
    cp "$APP_DIR/server/websocket.js" "$APP_DIR/websocket.js"
    echo -e "${GREEN}✓ websocket.js скопирован в корень${NC}"
fi

# Копируем config.json из server/ в корень если нужно
if [ -f "$APP_DIR/server/config.json" ] && [ ! -f "$APP_DIR/config.json" ]; then
    cp "$APP_DIR/server/config.json" "$APP_DIR/config.json"
    echo -e "${GREEN}✓ config.json скопирован в корень${NC}"
fi

# Копируем node_modules из server/ в корень если они там и в корне их нет
if [ -d "$APP_DIR/server/node_modules" ] && [ ! -d "$APP_DIR/node_modules" ]; then
    mv "$APP_DIR/server/node_modules" "$APP_DIR/node_modules"
    echo -e "${GREEN}✓ node_modules перемещены из server/ в корень${NC}"
fi

chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
chmod -R 755 "$APP_DIR"
chmod 600 "$APP_DIR/config.json" 2>/dev/null || true
echo -e "${GREEN}Приложение установлено в $APP_DIR${NC}"

# 5. Установка зависимостей (оффлайн)
echo -e "${YELLOW}[5/8] Установка npm-зависимостей (оффлайн)...${NC}"
cd "$APP_DIR"

# Копируем config.json из server/ в корень если нужно
if [ -f "$APP_DIR/server/config.json" ] && [ ! -f "$APP_DIR/config.json" ]; then
    cp "$APP_DIR/server/config.json" "$APP_DIR/config.json"
    echo -e "${GREEN}✓ config.json скопирован в корень${NC}"
fi

# Проверяем, есть ли node_modules с содержимым
if [ -d "$APP_DIR/node_modules" ] && [ "$(ls -A "$APP_DIR/node_modules" 2>/dev/null)" ]; then
    echo -e "${GREEN}✓ node_modules уже присутствуют в пакете ($(ls "$APP_DIR/node_modules" | wc -l) пакетов)${NC}"
else
    echo -e "${YELLOW}node_modules не найдены${NC}"
fi

# Проверяем наличие серверных зависимостей (express)
if [ ! -d "$APP_DIR/node_modules/express" ]; then
    echo -e "${YELLOW}Серверные зависимости (express) не найдены${NC}"
    
    # Пробуем скопировать из server-deps/ (если есть в пакете)
    if [ -d "$SCRIPT_DIR/server-deps/node_modules" ]; then
        echo -e "${YELLOW}Копируем серверные зависимости из server-deps/...${NC}"
        mkdir -p node_modules
        # Копируем содержимое server-deps/node_modules в node_modules
        cp -r "$SCRIPT_DIR/server-deps/node_modules/." node_modules/ 2>/dev/null || cp -r "$SCRIPT_DIR/server-deps/node_modules/"* node_modules/ 2>/dev/null || true
        echo -e "${GREEN}✓ Серверные зависимости скопированы${NC}"
    # Пробуем из offline-packages/
    elif [ -d "$SCRIPT_DIR/offline-packages" ] && ls "$SCRIPT_DIR/offline-packages"/express-*.tgz 1>/dev/null 2>&1; then
        echo -e "${YELLOW}Устанавливаем серверные зависимости из offline-packages/...${NC}"
        npm install "$SCRIPT_DIR/offline-packages"/express-*.tgz \
                    "$SCRIPT_DIR/offline-packages"/cors-*.tgz \
                    "$SCRIPT_DIR/offline-packages"/morgan-*.tgz \
                    "$SCRIPT_DIR/offline-packages"/ip-range-check-*.tgz \
                    "$SCRIPT_DIR/offline-packages"/multer-*.tgz \
                    --save --ignore-scripts 2>/dev/null || true
    else
        echo -e "${RED}✗ Серверные зависимости не найдены в пакете${NC}"
        echo -e "${YELLOW}Необходимо пересобрать пакет на машине с интернетом${NC}"
        echo -e "${YELLOW}Или установить вручную: cd $APP_DIR && npm install express cors morgan ip-range-check multer${NC}"
    fi
else
    echo -e "${GREEN}✓ Серверные зависимости найдены${NC}"
fi

# Исправляем права на node_modules
if [ -d "$APP_DIR/node_modules" ]; then
    chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/node_modules"
    echo -e "${GREEN}Зависимости установлены${NC}"
else
    echo -e "${RED}ВНИМАНИЕ: node_modules не найден!${NC}"
fi

# 6. Сборка (если нужно)
echo -e "${YELLOW}[6/8] Сборка production-версии...${NC}"
cd "$APP_DIR"

# Проверяем, есть ли dist/ в исходной директории архива
echo -e "${YELLOW}Проверка dist/ в $SCRIPT_DIR/dist...${NC}"
if [ -d "$SCRIPT_DIR/dist" ] && [ "$(ls -A "$SCRIPT_DIR/dist" 2>/dev/null)" ]; then
    echo -e "${YELLOW}Копирование dist/ из архива...${NC}"
    rm -rf "$APP_DIR/dist"
    mkdir -p "$APP_DIR/dist"
    # Копируем содержимое dist/ в APP_DIR/dist/
    cp -r "$SCRIPT_DIR/dist/." "$APP_DIR/dist/" 2>/dev/null || cp -r "$SCRIPT_DIR/dist/"* "$APP_DIR/dist/" 2>/dev/null || {
        echo -e "${RED}✗ Не удалось скопировать dist/${NC}"
        echo -e "${YELLOW}Содержимое $SCRIPT_DIR/dist/:${NC}"
        ls -la "$SCRIPT_DIR/dist/"
        exit 1
    }
    chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/dist"
    chmod -R 755 "$APP_DIR/dist"
    echo -e "${GREEN}✓ dist/ скопирован из архива ($(ls "$APP_DIR/dist" | wc -l) файлов)${NC}"
elif [ -d "$APP_DIR/dist" ] && [ "$(ls -A "$APP_DIR/dist" 2>/dev/null)" ]; then
    echo -e "${GREEN}✓ dist/ уже присутствует в $APP_DIR${NC}"
else
    echo -e "${YELLOW}dist/ не найден, пытаемся собрать...${NC}"
    if [ -f "$APP_DIR/package.json" ]; then
        npm run build 2>/dev/null || {
            echo -e "${RED}✗ Не удалось собрать dist/${NC}"
            echo -e "${YELLOW}Скопируйте dist/ вручную из архива:${NC}"
            echo -e "${YELLOW}  sudo cp -r $SCRIPT_DIR/dist/* $APP_DIR/dist/${NC}"
        }
    fi
fi

echo -e "${GREEN}Сборка завершена${NC}"

# 7. Копирование веб-файлов в стандартную директорию Apache
echo -e "${YELLOW}[7/8] Размещение веб-файлов в $WEB_DIR...${NC}"
if [ -d "$APP_DIR/dist" ] && [ "$(ls -A "$APP_DIR/dist" 2>/dev/null)" ]; then
    rm -rf "$WEB_DIR"
    mkdir -p "$WEB_DIR"
    # Копируем содержимое dist/ в WEB_DIR
    cp -r "$APP_DIR/dist/." "$WEB_DIR/" 2>/dev/null || cp -r "$APP_DIR/dist/"* "$WEB_DIR/" 2>/dev/null || {
        echo -e "${RED}✗ Не удалось скопировать веб-файлы${NC}"
        exit 1
    }
    chown -R root:apache "$WEB_DIR"
    chmod -R 755 "$WEB_DIR"
    echo -e "${GREEN}✓ Веб-файлы размещены в $WEB_DIR ($(ls "$WEB_DIR" | wc -l) файлов)${NC}"
else
    echo -e "${RED}✗ dist/ не найден или пуст в $APP_DIR${NC}"
    echo -e "${YELLOW}Веб-файлы не скопированы. Скопируйте вручную:${NC}"
    echo -e "${YELLOW}  sudo cp -r $APP_DIR/dist/* $WEB_DIR/${NC}"
fi

# Удаление старых конфигов (от предыдущих версий)
if [ -f /etc/httpd/conf.d/logviewer.conf ]; then
    rm -f /etc/httpd/conf.d/logviewer.conf
    echo -e "${GREEN}✓ Удалён старый конфиг logviewer.conf${NC}"
fi

# Копирование конфига Apache
if [ -f "$APP_DIR/apache-logviewer.conf" ]; then
    cp "$APP_DIR/apache-logviewer.conf" /etc/httpd/conf.d/readlog.conf
    echo -e "${GREEN}✓ Конфиг Apache скопирован в /etc/httpd/conf.d/readlog.conf${NC}"
fi

# Настройка SELinux для веб-директории
if command -v semanage &> /dev/null; then
    semanage fcontext -a -t httpd_sys_content_t "$WEB_DIR(/.*)?" 2>/dev/null || true
    restorecon -Rv "$WEB_DIR" 2>/dev/null || true
fi

# 8. Создание systemd-сервиса
echo -e "${YELLOW}[8/8] Создание systemd-сервиса...${NC}"
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=ReadLog — Log Viewer Server
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node $APP_DIR/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

# Логирование
StandardOutput=append:$LOG_DIR/server.log
StandardError=append:$LOG_DIR/error.log

# Безопасность
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
echo -e "${GREEN}Systemd-сервис создан и включён${NC}"

# Настройка SELinux для приложения
if command -v semanage &> /dev/null; then
    echo -e "${YELLOW}Настройка SELinux...${NC}"
    semanage fcontext -a -t usr_t "$APP_DIR(/.*)?" 2>/dev/null || true
    restorecon -Rv "$APP_DIR" 2>/dev/null || true
    setsebool -P httpd_can_network_connect on 2>/dev/null || true
    setsebool -P nis_enabled on 2>/dev/null || true
    echo -e "${GREEN}✓ SELinux настроен${NC}"
fi

# Настройка firewall
if command -v firewall-cmd &> /dev/null; then
    echo -e "${YELLOW}Настройка firewall...${NC}"
    firewall-cmd --permanent --add-port=3001/tcp 2>/dev/null || true
    firewall-cmd --permanent --add-service=http 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    echo -e "${GREEN}✓ Порты открыты${NC}"
fi

# Итоговая информация
echo ""
echo "============================================"
echo -e "${GREEN}Установка завершена успешно!${NC}"
echo "============================================"
echo ""
echo "Директория приложения: $APP_DIR"
echo "Веб-файлы (Apache):    $WEB_DIR"
echo "Директория с логами:   /opt/assembly_visual/logs/"
echo "Логи сервиса:          $LOG_DIR"
echo "Порт API:              3001"
echo ""
echo -e "${YELLOW}Запуск:${NC}"
echo "  sudo systemctl start ${SERVICE_NAME}"
echo "  sudo systemctl start httpd"
echo ""
echo -e "${YELLOW}Проверка:${NC}"
echo "  sudo systemctl status ${SERVICE_NAME}"
echo "  sudo systemctl status httpd"
echo "  curl http://localhost:3001/api/info"
echo "  Откройте в браузере: http://$(hostname -I | awk '{print $1}')/readlog/"
echo ""
echo -e "${YELLOW}Полезные команды:${NC}"
echo "  sudo systemctl start ${SERVICE_NAME}       # Запуск API сервера"
echo "  sudo systemctl stop ${SERVICE_NAME}        # Остановка"
echo "  sudo systemctl restart ${SERVICE_NAME}     # Перезапуск"
echo "  sudo journalctl -u ${SERVICE_NAME} -f      # Логи systemd"
echo "  tail -f $LOG_DIR/server.log                # Логи приложения"
echo ""
echo -e "${YELLOW}Настройка:${NC}"
echo "  sudo nano $APP_DIR/config.json             # Конфигурация API"
echo "  sudo nano /etc/httpd/conf.d/readlog.conf   # Конфиг Apache"
echo ""
