#!/bin/bash
# prepare-offline.sh
# Скрипт для подготовки оффлайн-пакета (запускать на машине С интернетом)

set -e

echo "=== Подготовка оффлайн-пакета Log Viewer ==="

# Создаём директорию для пакета
PACKAGE_DIR="log-viewer-offline-$(date +%Y%m%d)"
mkdir -p "$PACKAGE_DIR"

echo "1. Копирование исходного кода..."
# Копируем все файлы проекта, кроме node_modules и dist
rsync -av --exclude='node_modules' --exclude='dist' --exclude='.git' \
    --exclude='*.sh' --exclude='offline-packages' \
    ./ "$PACKAGE_DIR/"

echo "2. Установка зависимостей и создание кэша..."
cd "$PACKAGE_DIR"
npm install

echo "3. Создание оффлайн-пакета зависимостей..."
# Скачиваем все пакеты в локальную директорию
mkdir -p offline-packages
npm pack --pack-destination offline-packages $(npm ls --all --parseable | tail -n +2 | xargs -I {} basename {})

# Альтернативный способ: копируем весь кэш npm
echo "4. Копирование npm кэша..."
mkdir -p npm-cache
npm cache clean --force
npm install --prefer-offline
cp -r ~/.npm/_cacache npm-cache/ 2>/dev/null || true

echo "5. Сборка production-версии..."
npm run build

echo "6. Создание архива..."
cd ..
tar -czf "${PACKAGE_DIR}.tar.gz" "$PACKAGE_DIR"

echo ""
echo "=== Готово! ==="
echo "Оффлайн-пакет создан: ${PACKAGE_DIR}.tar.gz"
echo ""
echo "Размер: $(du -h "${PACKAGE_DIR}.tar.gz" | cut -f1)"
echo ""
echo "Инструкция по установке на целевом сервере:"
echo "1. Скопируйте ${PACKAGE_DIR}.tar.gz на сервер"
echo "2. Распакуйте: tar -xzf ${PACKAGE_DIR}.tar.gz"
echo "3. Перейдите в папку: cd ${PACKAGE_DIR}"
echo "4. Запустите: ./install-offline.sh"
