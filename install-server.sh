#!/bin/bash
# install-server.sh - Установка сервера ReadLog на РЕД ОС

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Установка сервера ReadLog ===${NC}"

# Проверка прав
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Ошибка: скрипт должен быть запущен от root${NC}"
    exit 1
fi

# Конфигурация
APP_DIR="/opt/readlog"
SERVICE_USER="readlog"
SERVICE_NAME="readlog"
LOG_DIR="/var/log/readlog"
WEB_DIR="/var/www/html/readlog"

echo -e "${YELLOW}[1/8] Создание пользователя сервиса...${NC}"
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd -r -s /sbin/nologin -d "$APP_DIR" "$SERVICE_USER"
    echo -e "${GREEN}✓ Пользователь $SERVICE_USER создан${NC}"
else
    echo -e "${GREEN}✓ Пользователь $SERVICE_USER уже существует${NC}"
fi

echo -e "${YELLOW}[2/8] Создание директорий...${NC}"
mkdir -p "$APP_DIR"
mkdir -p "$LOG_DIR"
mkdir -p "$WEB_DIR"
# Директория с логами должна уже существовать
if [ ! -d "/opt/assembly_visual/logs" ]; then
    echo -e "${YELLOW}⚠ Директория /opt/assembly_visual/logs не найдена${NC}"
    echo -e "${YELLOW}  Создаю пустую директорию (позже укажите реальный путь в config.json)${NC}"
    mkdir -p /opt/assembly_visual/logs
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$LOG_DIR"
# Даём пользователю readlog право читать логи
chmod 755 /opt/assembly_visual/logs
echo -e "${GREEN}✓ Директории созданы${NC}"

echo -e "${YELLOW}[3/8] Установка Node.js (если не установлен)...${NC}"
if ! command -v node &> /dev/null; then
    echo "Установка Node.js..."
    dnf install -y nodejs npm
    echo -e "${GREEN}✓ Node.js установлен${NC}"
else
    echo -e "${GREEN}✓ Node.js уже установлен: $(node --version)${NC}"
fi

echo -e "${YELLOW}[4/8] Копирование файлов сервера...${NC}"
cp -r server/* "$APP_DIR/"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
chmod 600 "$APP_DIR/config.json"
echo -e "${GREEN}✓ Файлы скопированы в $APP_DIR${NC}"

echo -e "${YELLOW}[5/8] Установка зависимостей Node.js...${NC}"
cd "$APP_DIR"
sudo -u "$SERVICE_USER" npm install --production
echo -e "${GREEN}✓ Зависимости установлены${NC}"

echo -e "${YELLOW}[6/8] Копирование веб-файлов в $WEB_DIR...${NC}"
# Копируем dist/ если он есть
if [ -d "dist" ]; then
    cp -r dist/* "$WEB_DIR/"
    chown -R root:apache "$WEB_DIR"
    chmod -R 755 "$WEB_DIR"
    echo -e "${GREEN}✓ Веб-файлы скопированы в $WEB_DIR${NC}"
else
    echo -e "${YELLOW}⚠ Папка dist/ не найдена. Веб-файлы не скопированы.${NC}"
    echo -e "${YELLOW}  Выполните 'npm run build' на машине разработки и скопируйте dist/ вручную${NC}"
fi

# Копирование конфига Apache
if [ -f "apache-logviewer.conf" ]; then
    cp apache-logviewer.conf /etc/httpd/conf.d/readlog.conf
    echo -e "${GREEN}✓ Конфиг Apache скопирован в /etc/httpd/conf.d/readlog.conf${NC}"
fi

echo -e "${YELLOW}[7/8] Создание systemd-сервиса...${NC}"
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
echo -e "${GREEN}✓ Systemd-сервис создан и включён${NC}"

echo -e "${YELLOW}[8/8] Настройка firewall и SELinux...${NC}"
if command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=3001/tcp
    firewall-cmd --permanent --add-service=http
    firewall-cmd --reload
    echo -e "${GREEN}✓ Порты открыты в firewall${NC}"
else
    echo -e "${YELLOW}⚠ Firewall не настроен (firewall-cmd не найден)${NC}"
fi

# Настройка SELinux
if command -v semanage &> /dev/null; then
    echo -e "${YELLOW}Настройка SELinux...${NC}"
    # Разрешаем приложению читать логи из /opt/assembly_visual/logs
    semanage fcontext -a -t usr_t "$APP_DIR(/.*)?" 2>/dev/null || true
    semanage fcontext -a -t httpd_sys_content_t "$WEB_DIR(/.*)?" 2>/dev/null || true
    restorecon -Rv "$APP_DIR" 2>/dev/null || true
    restorecon -Rv "$WEB_DIR" 2>/dev/null || true
    # Разрешаем httpd/node подключаться к сети
    setsebool -P httpd_can_network_connect on 2>/dev/null || true
    setsebool -P nis_enabled on 2>/dev/null || true
    echo -e "${GREEN}✓ SELinux настроен${NC}"
fi

echo ""
echo "═══════════════════════════════════════════"
echo -e "${GREEN}✓ Установка завершена!${NC}"
echo "═══════════════════════════════════════════"
echo ""
echo "Директория приложения: $APP_DIR"
echo "Веб-файлы (Apache):    $WEB_DIR"
echo "Директория с логами:   /opt/assembly_visual/logs/"
echo "Логи сервиса:          $LOG_DIR"
echo "Порт API:              3001"
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
echo "4. Запустите серверы:"
echo "   sudo systemctl start ${SERVICE_NAME}"
echo "   sudo systemctl start httpd"
echo ""
echo "5. Проверьте статус:"
echo "   sudo systemctl status ${SERVICE_NAME}"
echo "   sudo systemctl status httpd"
echo ""
echo -e "${YELLOW}Полезные команды:${NC}"
echo "  sudo systemctl start ${SERVICE_NAME}       # Запуск API сервера"
echo "  sudo systemctl stop ${SERVICE_NAME}        # Остановка"
echo "  sudo systemctl restart ${SERVICE_NAME}     # Перезапуск"
echo "  sudo systemctl status ${SERVICE_NAME}      # Статус"
echo "  sudo journalctl -u ${SERVICE_NAME} -f      # Логи systemd"
echo "  tail -f $LOG_DIR/server.log                # Логи приложения"
echo "  curl http://localhost:3001/api/info        # Проверка API"
echo ""
echo -e "${YELLOW}Доступ к веб-интерфейсу:${NC}"
echo "  http://$(hostname -I | awk '{print $1}')/readlog/"
echo ""
