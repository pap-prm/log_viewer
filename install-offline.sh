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
if [ ! -d "/opt/assembly_visual/logs" ]; then
    echo -e "${YELLOW}⚠ Директория /opt/assembly_visual/logs не найдена${NC}"
    mkdir -p /opt/assembly_visual/logs
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$LOG_DIR"
chmod 755 /opt/assembly_visual/logs
echo -e "${GREEN}✓ Директории созданы${NC}"

# 4. Установка приложения
echo -e "${YELLOW}[4/8] Установка приложения...${NC}"
# Копируем всё через tar с исключениями (не требует rsync)
# ВАЖНО: node_modules НЕ исключаем - они нужны для оффлайн работы
tar -cf - \
    --exclude='*.tar.gz' \
    --exclude='.git' \
    --exclude='install-offline.sh' \
    --exclude='prepare-offline.sh' \
    --exclude='build-dist-only.sh' \
    --exclude='install-server.sh' \
    --exclude='npm-cache' \
    --exclude='offline-packages' \
    -C ./ . | tar -xf - -C "$APP_DIR/"

# Копируем server.js и package.json из server/ в корень для удобства
if [ -f "$APP_DIR/server/server.js" ] && [ ! -f "$APP_DIR/server.js" ]; then
    cp "$APP_DIR/server/server.js" "$APP_DIR/server.js"
    cp "$APP_DIR/server/package.json" "$APP_DIR/package.json"
    echo -e "${GREEN}✓ server.js скопирован в корень${NC}"
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
if [ -d "node_modules" ] && [ "$(ls -A node_modules 2>/dev/null)" ]; then
    echo -e "${GREEN}✓ node_modules уже присутствуют в пакете ($(ls node_modules | wc -l) пакетов)${NC}"
else
    echo -e "${YELLOW}node_modules не найдены, пытаемся установить...${NC}"
    
    # Пробуем разные способы установки
    if [ -d "npm-cache" ] && [ "$(ls -A npm-cache 2>/dev/null)" ]; then
        echo "Используем локальный npm-кэш..."
        export npm_config_cache="$APP_DIR/npm-cache"
        npm install --offline --prefer-offline 2>/dev/null || true
    fi
    
    if [ -d "offline-packages" ] && ls offline-packages/*.tgz 1>/dev/null 2>&1; then
        echo "Устанавливаем из локальных пакетов..."
        npm install offline-packages/*.tgz --ignore-scripts 2>/dev/null || true
    fi
    
    # Если node_modules всё ещё нет, пробуем online
    if [ ! -d "node_modules" ] || [ ! "$(ls -A node_modules 2>/dev/null)" ]; then
        echo -e "${YELLOW}Попытка установки через npm (требуется интернет)...${NC}"
        npm install 2>/dev/null || {
            echo -e "${RED}✗ Не удалось установить зависимости автоматически${NC}"
            echo -e "${YELLOW}Установите вручную: cd $APP_DIR && npm install${NC}"
        }
    fi
fi

# Исправляем права на node_modules
if [ -d "node_modules" ]; then
    chown -R "$SERVICE_USER:$SERVICE_USER" node_modules
    echo -e "${GREEN}Зависимости установлены${NC}"
else
    echo -e "${RED}ВНИМАНИЕ: node_modules не найден!${NC}"
fi

# 6. Сборка (если нужно)
echo -e "${YELLOW}[6/8] Сборка production-версии...${NC}"
cd "$APP_DIR"
if [ ! -d "dist" ]; then
    npm run build
fi
echo -e "${GREEN}Сборка завершена${NC}"

# 7. Копирование веб-файлов в стандартную директорию Apache
echo -e "${YELLOW}[7/8] Размещение веб-файлов в $WEB_DIR...${NC}"
cp -r "$APP_DIR/dist/"* "$WEB_DIR/"
chown -R root:apache "$WEB_DIR"
chmod -R 755 "$WEB_DIR"

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
echo -e "${GREEN}Веб-файлы размещены в $WEB_DIR${NC}"

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
