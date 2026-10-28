#!/bin/bash
# prepare-offline.sh
# Скрипт для подготовки оффлайн-пакета (запускать на машине С интернетом)

set -e

echo "=== Подготовка оффлайн-пакета Log Viewer ==="

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

# Создаём директорию для пакета
PACKAGE_DIR="log-viewer-offline-$(date +%Y%m%d)"
mkdir -p "$PACKAGE_DIR"

echo -e "${YELLOW}[1/6] Копирование исходного кода...${NC}"
# Копируем все файлы проекта, кроме node_modules и dist
rsync -av --exclude='node_modules' --exclude='dist' --exclude='.git' \
    --exclude='*.sh' --exclude='offline-packages' --exclude='npm-cache' \
    --exclude='log-viewer-offline-*' \
    ./ "$PACKAGE_DIR/"

echo -e "${YELLOW}[2/6] Установка зависимостей...${NC}"
cd "$PACKAGE_DIR"
npm install

echo -e "${YELLOW}[3/6] Создание оффлайн-кэша npm...${NC}"
# Копируем node_modules для оффлайн установки
mkdir -p npm-cache
npm cache clean --force 2>/dev/null || true
npm install --prefer-offline 2>/dev/null || true

# Создаём tarball всех пакетов
echo -e "${YELLOW}[4/6] Упаковка зависимостей...${NC}"
mkdir -p offline-packages
# Получаем список всех установленных пакетов и создаём их tarball
cd node_modules
for pkg in $(find . -maxdepth 2 -name "package.json" -exec dirname {} \; | sed 's|^\./||' | grep -v "^\."); do
    if [ -f "$pkg/package.json" ]; then
        name=$(node -p "require('./$pkg/package.json').name" 2>/dev/null || echo "")
        version=$(node -p "require('./$pkg/package.json').version" 2>/dev/null || echo "")
        if [ -n "$name" ] && [ -n "$version" ]; then
            echo "  Упаковка: $name@$version"
            cd ../..
            npm pack "$name@$version" --pack-destination "$PACKAGE_DIR/offline-packages" 2>/dev/null || true
            cd "$PACKAGE_DIR/node_modules"
        fi
    fi
done
cd ../..

echo -e "${YELLOW}[5/6] Сборка production-версии...${NC}"
cd "$PACKAGE_DIR"
npm run build

echo -e "${YELLOW}[6/6] Создание архива...${NC}"
cd ..
tar -czf "${PACKAGE_DIR}.tar.gz" "$PACKAGE_DIR"

echo ""
echo -e "${GREEN}=== Готово! ===${NC}"
echo ""
echo "Оффлайн-пакет создан: ${PACKAGE_DIR}.tar.gz"
echo ""
echo "Размер: $(du -h "${PACKAGE_DIR}.tar.gz" | cut -f1)"
echo ""
echo "Инструкция по установке на целевом сервере:"
echo "1. Скопируйте ${PACKAGE_DIR}.tar.gz на сервер"
echo "2. Распакуйте: tar -xzf ${PACKAGE_DIR}.tar.gz"
echo "3. Перейдите в папку: cd ${PACKAGE_DIR}"
echo "4. Запустите: sudo ./install-offline.sh"
