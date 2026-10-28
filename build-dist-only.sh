#!/bin/bash
# build-dist-only.sh
# Создаёт минимальный пакет только с production-сборкой
# Node.js на сервере НЕ нужен

set -e

echo "=== Создание минимального пакета ReadLog (только dist/) ==="

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Ошибка: Node.js не установлен!${NC}"
    echo "Установите Node.js 18+:"
    echo "  curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -"
    echo "  sudo dnf install -y nodejs"
    exit 1
fi

echo -e "${YELLOW}Node.js версия: $(node --version)${NC}"
echo -e "${YELLOW}npm версия: $(npm --version)${NC}"
echo ""

# Проверка наличия node_modules
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/vite" ]; then
    echo -e "${YELLOW}Зависимости не установлены. Выполняю npm install...${NC}"
    npm install
    echo -e "${GREEN}✓ Зависимости установлены${NC}"
    echo ""
fi

# Собираем проект
echo -e "${YELLOW}Сборка production-версии...${NC}"
npm run build

# Создаём директорию для пакета
PACKAGE_NAME="readlog-dist-$(date +%Y%m%d)"
mkdir -p "$PACKAGE_NAME"

# Копируем только необходимое
echo -e "${YELLOW}Копирование файлов...${NC}"
cp -r dist "$PACKAGE_NAME/"
cp apache-logviewer.conf "$PACKAGE_NAME/" 2>/dev/null || echo -e "${YELLOW}⚠ apache-logviewer.conf не найден${NC}"

# Создаём простой скрипт установки
cat > "$PACKAGE_NAME/install.sh" << 'EOF'
#!/bin/bash
# Установка ReadLog — только статические файлы через Apache

set -e

if [ "$EUID" -ne 0 ]; then
    echo "Ошибка: запустите от root: sudo ./install.sh"
    exit 1
fi

WEB_DIR="/opt/readlog/www"

echo "Установка ReadLog..."

# Создаём директорию
mkdir -p "$WEB_DIR"

# Копируем файлы
cp -r dist/* "$WEB_DIR/"
if [ -f "apache-logviewer.conf" ]; then
    cp apache-logviewer.conf /etc/httpd/conf.d/readlog.conf
fi

# Настраиваем права
chown -R root:apache "$WEB_DIR"
chmod -R 755 "$WEB_DIR"

# SELinux
if command -v semanage &> /dev/null; then
    semanage fcontext -a -t httpd_sys_content_t "$WEB_DIR(/.*)?" 2>/dev/null || true
    restorecon -Rv "$WEB_DIR" 2>/dev/null || true
fi

# Firewall
if command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-service=http 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
fi

# Перезапуск Apache
systemctl restart httpd

echo ""
echo "✓ Установка завершена!"
echo "✓ Сайт доступен на: http://$(hostname -I | awk '{print $1}')/"
echo ""
echo "Файлы размещены в: $WEB_DIR"
echo "Конфиг Apache: /etc/httpd/conf.d/readlog.conf"
EOF

chmod +x "$PACKAGE_NAME/install.sh"

# Создаём архив
echo -e "${YELLOW}Создание архива...${NC}"
tar -czf "${PACKAGE_NAME}.tar.gz" "$PACKAGE_NAME"

# Очистка
rm -rf "$PACKAGE_NAME"

echo ""
echo -e "${GREEN}=== Готово! ===${NC}"
echo ""
echo "Создан пакет: ${PACKAGE_NAME}.tar.gz"
echo "Размер: $(du -h "${PACKAGE_NAME}.tar.gz" | cut -f1)"
echo ""
echo "Инструкция по установке:"
echo "  1. scp ${PACKAGE_NAME}.tar.gz user@server:/tmp/"
echo "  2. На сервере: cd /tmp && tar -xzf ${PACKAGE_NAME}.tar.gz"
echo "  3. cd ${PACKAGE_NAME} && sudo ./install.sh"
echo ""
echo "Требования на сервере:"
echo "  - Apache 2.4+"
echo "  - Node.js НЕ требуется"
echo "  - Файлы будут размещены в /opt/readlog/www/"
