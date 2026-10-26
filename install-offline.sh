#!/bin/bash
# install-offline.sh
# Скрипт установки на сервере БЕЗ интернета

set -e

echo "=== Установка Log Viewer (оффлайн) ==="

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
APP_NAME="log-viewer"
APP_DIR="/opt/log-viewer"
WEB_DIR="/var/www/logviewer"
SERVICE_USER="logviewer"

echo ""
echo -e "${YELLOW}Конфигурация:${NC}"
echo "  Директория приложения: $APP_DIR"
echo "  Директория веб-сервера: $WEB_DIR"
echo "  Пользователь сервиса: $SERVICE_USER"
echo ""

# 1. Проверка Node.js
echo -e "${YELLOW}[1/7] Проверка Node.js...${NC}"
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
echo -e "${YELLOW}[2/7] Создание пользователя сервиса...${NC}"
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd -r -s /sbin/nologin -d "$APP_DIR" "$SERVICE_USER"
    echo -e "${GREEN}Пользователь $SERVICE_USER создан${NC}"
else
    echo -e "${GREEN}Пользователь $SERVICE_USER уже существует${NC}"
fi

# 3. Установка приложения
echo -e "${YELLOW}[3/7] Установка приложения...${NC}"
mkdir -p "$APP_DIR"
cp -r ./* "$APP_DIR/"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
chmod -R 755 "$APP_DIR"
echo -e "${GREEN}Приложение установлено в $APP_DIR${NC}"

# 4. Установка зависимостей (оффлайн)
echo -e "${YELLOW}[4/7] Установка npm-зависисей (оффлайн)...${NC}"
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

# 5. Сборка
echo -e "${YELLOW}[5/7] Сборка production-версии...${NC}"
cd "$APP_DIR"
if [ ! -d "dist" ]; then
    npm run build
fi
echo -e "${GREEN}Сборка завершена${NC}"

# 6. Копирование в веб-директорию
echo -e "${YELLOW}[6/7] Размещение файлов для веб-сервера...${NC}"
mkdir -p "$WEB_DIR"
cp -r "$APP_DIR/dist/"* "$WEB_DIR/"
chown -R root:apache "$WEB_DIR"
chmod -R 755 "$WEB_DIR"

# Настройка SELinux
if command -v semanage &> /dev/null; then
    echo "Настройка SELinux..."
    semanage fcontext -a -t httpd_sys_content_t "$WEB_DIR(/.*)?" 2>/dev/null || true
    restorecon -Rv "$WEB_DIR" 2>/dev/null || true
fi

echo -e "${GREEN}Файлы размещены в $WEB_DIR${NC}"

# 7. Создание systemd-сервиса (для dev-режима, опционально)
echo -e "${YELLOW}[7/7] Создание systemd-сервиса...${NC}"
cat > /etc/systemd/system/${APP_NAME}.service << EOF
[Unit]
Description=Log Viewer - Vite Dev Server
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/npm run dev -- --host 0.0.0.0 --port 3000
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${APP_NAME}.service
echo -e "${GREEN}Systemd-сервис создан и включён${NC}"

# Итоговая информация
echo ""
echo "============================================"
echo -e "${GREEN}Установка завершена успешно!${NC}"
echo "============================================"
echo ""
echo "Файлы сайта: $WEB_DIR"
echo "Исходный код: $APP_DIR"
echo ""
echo -e "${YELLOW}Для работы через Apache:${NC}"
echo "  1. Убедитесь, что Apache установлен:"
echo "     sudo dnf install httpd"
echo ""
echo "  2. Создайте конфиг /etc/httpd/conf.d/logviewer.conf"
echo "     (пример в файле $APP_DIR/apache-logviewer.conf)"
echo ""
echo "  3. Перезапустите Apache:"
echo "     sudo systemctl restart httpd"
echo ""
echo -e "${YELLOW}Для dev-режима (Vite):${NC}"
echo "  sudo systemctl start log-viewer"
echo "  # Сайт будет доступен на http://server:3000"
echo ""
echo -e "${YELLOW}Полезные команды:${NC}"
echo "  systemctl status log-viewer    # Статус сервиса"
echo "  journalctl -u log-viewer -f    # Логи"
echo "  ls -la $WEB_DIR               # Файлы сайта"
echo ""
