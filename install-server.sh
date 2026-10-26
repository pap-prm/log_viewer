#!/bin/bash
# install-server.sh - Установка сервера Log Viewer на РЕД ОС

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Установка сервера Log Viewer ===${NC}"

# Проверка прав
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Ошибка: скрипт должен быть запущен от root${NC}"
    exit 1
fi

# Конфигурация
APP_DIR="/opt/log-viewer"
SERVICE_USER="logviewer"
LOG_DIR="/var/log/log-viewer"

echo -e "${YELLOW}[1/7] Создание пользователя сервиса...${NC}"
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd -r -s /sbin/nologin -d "$APP_DIR" "$SERVICE_USER"
    echo -e "${GREEN}✓ Пользователь $SERVICE_USER создан${NC}"
else
    echo -e "${GREEN}✓ Пользователь $SERVICE_USER уже существует${NC}"
fi

echo -e "${YELLOW}[2/7] Создание директорий...${NC}"
mkdir -p "$APP_DIR"
mkdir -p "$LOG_DIR"
mkdir -p /opt/assembly_visual/logs
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$LOG_DIR"
echo -e "${GREEN}✓ Директории созданы${NC}"

echo -e "${YELLOW}[3/7] Установка Node.js (если не установлен)...${NC}"
if ! command -v node &> /dev/null; then
    echo "Установка Node.js..."
    dnf install -y nodejs npm
    echo -e "${GREEN}✓ Node.js установлен${NC}"
else
    echo -e "${GREEN}✓ Node.js уже установлен: $(node --version)${NC}"
fi

echo -e "${YELLOW}[4/7] Копирование файлов сервера...${NC}"
cp -r server/* "$APP_DIR/"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
chmod 600 "$APP_DIR/config.json"
echo -e "${GREEN}✓ Файлы скопированы в $APP_DIR${NC}"

echo -e "${YELLOW}[5/7] Установка зависимостей Node.js...${NC}"
cd "$APP_DIR"
sudo -u "$SERVICE_USER" npm install --production
echo -e "${GREEN}✓ Зависимости установлены${NC}"

echo -e "${YELLOW}[6/7] Создание systemd-сервиса...${NC}"
cat > /etc/systemd/system/log-viewer-server.service << EOF
[Unit]
Description=Log Viewer Server
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
systemctl enable log-viewer-server
echo -e "${GREEN}✓ Systemd-сервис создан и включён${NC}"

echo -e "${YELLOW}[7/7] Настройка firewall...${NC}"
if command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=3001/tcp
    firewall-cmd --reload
    echo -e "${GREEN}✓ Порт 3001 открыт в firewall${NC}"
else
    echo -e "${YELLOW}⚠ Firewall не настроен (firewall-cmd не найден)${NC}"
fi

# Настройка SELinux
if command -v semanage &> /dev/null; then
    echo -e "${YELLOW}Настройка SELinux...${NC}"
    semanage fcontext -a -t httpd_sys_content_t "$APP_DIR(/.*)?" 2>/dev/null || true
    restorecon -Rv "$APP_DIR" 2>/dev/null || true
    setsebool -P httpd_can_network_connect on 2>/dev/null || true
    echo -e "${GREEN}✓ SELinux настроен${NC}"
fi

echo ""
echo "═══════════════════════════════════════════"
echo -e "${GREEN}✓ Установка завершена!${NC}"
echo "═══════════════════════════════════════════"
echo ""
echo "Конфигурация: $APP_DIR/config.json"
echo "Логи: $LOG_DIR/"
echo ""
echo -e "${YELLOW}Важно:${NC}"
echo "1. Отредактируйте конфигурацию:"
echo "   sudo nano $APP_DIR/config.json"
echo ""
echo "2. Укажите путь к папке с логами:"
echo "   \"directory\": \"/opt/assembly_visual/logs/\""
echo ""
echo "3. Настройте белый список IP:"
echo "   \"ips\": [\"192.168.1.0/24\", \"10.0.0.0/8\"]"
echo ""
echo "4. Запустите сервер:"
echo "   sudo systemctl start log-viewer-server"
echo ""
echo "5. Проверьте статус:"
echo "   sudo systemctl status log-viewer-server"
echo ""
echo -e "${YELLOW}Полезные команды:${NC}"
echo "  sudo systemctl start log-viewer-server    # Запуск"
echo "  sudo systemctl stop log-viewer-server     # Остановка"
echo "  sudo systemctl restart log-viewer-server  # Перезапуск"
echo "  sudo journalctl -u log-viewer-server -f   # Логи"
echo "  tail -f $LOG_DIR/server.log              # Логи приложения"
echo ""
