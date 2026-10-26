# Быстрый старт — Оффлайн установка Log Viewer

## Самый быстрый способ (3 команды)

### На машине с интернетом:

```bash
# 1. Собрать пакет
chmod +x build-dist-only.sh
./build-dist-only.sh

# 2. Передать на сервер
scp log-viewer-dist-*.tar.gz user@server:/tmp/
```

### На сервере РЕД ОС:

```bash
# 3. Установить
cd /tmp
tar -xzf log-viewer-dist-*.tar.gz
cd log-viewer-dist-*
sudo ./install.sh
```

**Всё!** Сайт доступен на `http://server-ip/`

---

## Что делает скрипт install.sh

1. Копирует файлы в `/var/www/logviewer`
2. Настраивает Apache конфиг
3. Настраивает SELinux
4. Открывает порт в firewall
5. Перезапускает Apache

---

## Требования на сервере

- РЕД ОС 8.0.3
- Apache 2.4+ (`sudo dnf install httpd`)
- **Node.js НЕ нужен** (это только статический сайт)

---

## Если нужна AD-авторизация

После установки отредактируйте `/etc/httpd/conf.d/logviewer.conf`:

```bash
sudo nano /etc/httpd/conf.d/logviewer.conf
```

Раскомментируйте секцию HTTPS + LDAP и укажите:
- Адрес AD сервера
- DN для привязки
- Пароль в файле `/etc/httpd/conf/ldap_bind_password`
- Имя группы AD для доступа

Затем:
```bash
sudo systemctl restart httpd
```

---

## Проверка

```bash
# Статус Apache
sudo systemctl status httpd

# Логи
sudo tail -f /var/log/httpd/error_log

# Файлы сайта
ls -la /var/www/logviewer/
```

---

## Обновление

```bash
# На машине с интернетом — пересобрать
npm run build
tar -czf update.tar.gz dist/

# На сервере — обновить
sudo cp -r dist/* /var/www/logviewer/
sudo systemctl restart httpd
```

---

## Полная установка (с возможностью пересборки)

Если нужна возможность пересобирать на сервере:

```bash
# На машине с интернетом
chmod +x prepare-offline.sh
./prepare-offline.sh

# На сервере
tar -xzf log-viewer-offline-*.tar.gz
cd log-viewer-offline-*
sudo ./install-offline.sh
```

**Требования:** Node.js 18+ на сервере

---

## Полезные ссылки

- Полная документация: `README-OFFLINE.md`
- Конфиг Apache: `apache-logviewer.conf`
- Исходный код: `/opt/log-viewer/` (после полной установки)
