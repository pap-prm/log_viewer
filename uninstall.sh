#!/bin/bash
# uninstall.sh - Полное удаление ReadLog с сервера

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${RED}╔══════════════════════════════════════════╗${NC}"
echo -e "${RED}║   УДАЛЕНИЕ ReadLog                       ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════╝${NC}"
echo ""

# Проверка прав
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Ошибка: скрипт должен быть запущен от root${NC}"
    echo "Используйте: sudo ./uninstall.sh"
    exit 1
fi

# Конфигурация
SERVICE_NAME="readlog"
APP_DIR="/opt/readlog"
LOG_DIR="/var/log/readlog"
WEB_DIR="/var/www/html/readlog"
SERVICE_USER="readlog"

# Подтверждение
echo -e "${YELLOW}Будут удалены:${NC}"
echo "  • Systemd-сервис: $SERVICE_NAME"
echo "  • Директория приложения: $APP_DIR"
echo "  • Директория веб-файлов: $WEB_DIR"
echo "  • Директория логов: $LOG_DIR"
echo "  • Конфиг Apache: /etc/httpd/conf.d/readlog.conf"
echo "  • Пользователь: $SERVICE_USER"
echo "  • Правила firewall (порт 3001)"
echo ""
echo -e "${RED}⚠ Директория /opt/assembly_visual/logs/ НЕ будет удалена${NC}"
echo ""
read -p "Продолжить? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Отменено."
    exit 0
fi

echo ""

# 1. Остановка сервиса
echo -e "${YELLOW}[1/8] Остановка сервиса...${NC}"
if systemctl is-active --quiet ${SERVICE_NAME} 2>/dev/null; then
    systemctl stop ${SERVICE_NAME}
    echo -e "${GREEN}✓ Сервис остановлен${NC}"
else
    echo -e "${YELLOW}⚠ Сервис не запущен${NC}"
fi

# 2. Отключение из автозагрузки
echo -e "${YELLOW}[2/8] Отключение из автозагрузки...${NC}"
if systemctl is-enabled --quiet ${SERVICE_NAME} 2>/dev/null; then
    systemctl disable ${SERVICE_NAME}
    echo -e "${GREEN}✓ Сервис отключён из автозагрузки${NC}"
else
    echo -e "${YELLOW}⚠ Сервис не был включён${NC}"
fi

# 3. Удаление unit-файла
echo -e "${YELLOW}[3/8] Удаление unit-файла systemd...${NC}"
if [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
    rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    systemctl daemon-reload
    echo -e "${GREEN}✓ Unit-файл удалён${NC}"
else
    echo -e "${YELLOW}⚠ Unit-файл не найден${NC}"
fi

# 4. Удаление конфига Apache
echo -e "${YELLOW}[4/8] Удаление конфига Apache...${NC}"
if [ -f "/etc/httpd/conf.d/readlog.conf" ]; then
    rm -f "/etc/httpd/conf.d/readlog.conf"
    # Перезапуск Apache если он запущен
    if systemctl is-active --quiet httpd 2>/dev/null; then
        systemctl reload httpd 2>/dev/null || true
    fi
    echo -e "${GREEN}✓ Конфиг Apache удалён${NC}"
else
    echo -e "${YELLOW}⚠ Конфиг Apache не найден${NC}"
fi

# Удаление старого конфига (если остался)
if [ -f "/etc/httpd/conf.d/logviewer.conf" ]; then
    rm -f "/etc/httpd/conf.d/logviewer.conf"
    echo -e "${GREEN}✓ Старый конфиг logviewer.conf удалён${NC}"
fi

# 5. Удаление директорий
echo -e "${YELLOW}[5/8] Удаление директорий...${NC}"

# Директория приложения
if [ -d "$APP_DIR" ]; then
    rm -rf "$APP_DIR"
    echo -e "${GREEN}✓ Удалена: $APP_DIR${NC}"
else
    echo -e "${YELLOW}⚠ Не найдена: $APP_DIR${NC}"
fi

# Директория веб-файлов
if [ -d "$WEB_DIR" ]; then
    rm -rf "$WEB_DIR"
    echo -e "${GREEN}✓ Удалена: $WEB_DIR${NC}"
else
    echo -e "${YELLOW}⚠ Не найдена: $WEB_DIR${NC}"
fi

# Директория логов
if [ -d "$LOG_DIR" ]; then
    rm -rf "$LOG_DIR"
    echo -e "${GREEN}✓ Удалена: $LOG_DIR${NC}"
else
    echo -e "${YELLOW}⚠ Не найдена: $LOG_DIR${NC}"
fi

# 6. Удаление правил firewall
echo -e "${YELLOW}[6/8] Удаление правил firewall...${NC}"
if command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --remove-port=3001/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    echo -e "${GREEN}✓ Правила firewall удалены${NC}"
else
    echo -e "${YELLOW}⚠ firewall-cmd не найден${NC}"
fi

# 7. Очистка SELinux
echo -e "${YELLOW}[7/8] Очистка SELinux контекстов...${NC}"
if command -v semanage &> /dev/null; then
    semanage fcontext -d "$APP_DIR(/.*)?" 2>/dev/null || true
    semanage fcontext -d "$WEB_DIR(/.*)?" 2>/dev/null || true
    echo -e "${GREEN}✓ SELinux контексты удалены${NC}"
else
    echo -e "${YELLOW}⚠ semanage не найден${NC}"
fi

# 8. Удаление пользователя
echo -e "${YELLOW}[8/8] Удаление пользователя сервиса...${NC}"
if id "$SERVICE_USER" &>/dev/null; then
    userdel "$SERVICE_USER" 2>/dev/null || true
    echo -e "${GREEN}✓ Пользователь $SERVICE_USER удалён${NC}"
else
    echo -e "${YELLOW}⚠ Пользователь $SERVICE_USER не найден${NC}"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Удаление завершено                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Что было удалено:${NC}"
echo "  ✓ Systemd-сервис: $SERVICE_NAME"
echo "  ✓ Директория приложения: $APP_DIR"
echo "  ✓ Директория веб-файлов: $WEB_DIR"
echo "  ✓ Директория логов: $LOG_DIR"
echo "  ✓ Конфиг Apache: /etc/httpd/conf.d/readlog.conf"
echo "  ✓ Пользователь: $SERVICE_USER"
echo "  ✓ Правила firewall (порт 3001)"
echo ""
echo -e "${GREEN}Что НЕ было удалено:${NC}"
echo "  • /opt/assembly_visual/logs/ (логи Java приложения)"
echo ""
echo -e "${YELLOW}Для полного удаления также выполните:${NC}"
echo "  sudo rm -rf /opt/assembly_visual  # если не нужно"
echo ""
