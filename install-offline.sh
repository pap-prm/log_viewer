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
    echo ""
    echo "Или из оффлайн RPM (если есть в пакете):"
    if [ -d "rpm-packages" ]; then
        echo "  sudo dnf install --disablerepo='*' rpm-packages/*.rpm"
    fi
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
# Директория с логами должна существовать
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
cp -r ./* "$APP_DIR/"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
chmod -R 755 "$APP_DIR"
chmod 600 "$APP_DIR/config.json"
echo -e "${GREEN}Приложение установлено в $APP_DIR${NC}"

# 5. Установка зависимостей (оффлайн)
echo -e "${YELLOW}[5/8] Установка npm-зависисей (оффлайн)...${NC}"
cd "$APP_DIR"

# Способ 1: из локального кэша
if [ -d "npm-cache" ]; then
    echo "Используем локальный npm-кэш..."
    export npm_config_cache="$APP_DIR/npm-cache"
    npm ci --offline --prefer-offline 2>/dev/null || npm install --offline --prefer-offline
fi

# Способ 2: из offline-packages
if [ -d "offline-packages" ] && [ "$(ls -A offline-packages/*.tgz 2>/dev/null)" ]; then
    echo "Устанавливаем из локальных пакетов..."
    npm install offline-packages/*.tgz --offline --ignore-scripts 2>/dev/null || true
fi

# Способ 3: если node_modules уже есть в пакете
if [ -d "node_modules" ]; then
    echo -e "${GREEN}node_modules уже присутствуют в пакете${NC}"
else
    echo -e "${YELLOW}Попытка установки из кэша npm...${NC}"
    npm ci --offline 2>/dev/null || npm install --offline 2>/dev/null || {
        echo -e "${YELLOW}Оффлайн-установка не удалась, пробуем online...${NC}"
        npm ci 2>/dev/null || npm install
    }
fi

echo -e "${GREEN}Зависимости установлены${NC}"

# 6. Сборка
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
