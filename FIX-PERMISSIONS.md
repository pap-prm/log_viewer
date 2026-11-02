# Исправление прав доступа для автоматического чтения новых файлов

## Проблема

Сервис `readlog` не может читать новые файлы логов, создаваемые пользователем `jenkins`, из-за недостаточных прав доступа.

## Решение

Настроены ACL (Access Control Lists) для автоматического предоставления прав на чтение новых файлов в директории `/opt/assembly_visual/logs/`.

## Применение на существующем сервере

### Шаг 1: Установите ACL утилиты (если не установлены)

```bash
# На сервере omega-test-02
sudo dnf install -y acl
```

### Шаг 2: Добавьте пользователя readlog в группу jenkins

```bash
sudo usermod -aG jenkins readlog
```

### Шаг 3: Установите ACL на директорию логов

```bash
# Устанавливаем ACL для существующих файлов
sudo setfacl -R -m u:readlog:rX /opt/assembly_visual/logs
sudo setfacl -R -m g:jenkins:rX /opt/assembly_visual/logs
sudo setfacl -R -m o::rX /opt/assembly_visual/logs

# Устанавливаем ACL по умолчанию для новых файлов
sudo setfacl -R -d -m u:readlog:rX /opt/assembly_visual/logs
sudo setfacl -R -d -m g:jenkins:rX /opt/assembly_visual/logs
sudo setfacl -R -d -m o::rX /opt/assembly_visual/logs
```

### Шаг 4: Проверьте права

```bash
# Проверьте ACL на директории
getfacl /opt/assembly_visual/logs

# Проверьте ACL на существующем файле
getfacl /opt/assembly_visual/logs/app.log
```

Должны увидеть что-то вроде:
```
# file: logs
# owner: jenkins
# group: jenkins
user::rwx
user:readlog:r-x
group::r-x
group:jenkins:r-x
mask::r-x
other::r-x
default:user::rwx
default:user:readlog:r-x
default:group::r-x
default:group:jenkins:r-x
default:mask::r-x
default:other::r-x
```

### Шаг 5: Перезапустите сервис

```bash
sudo systemctl restart readlog
```

## Тестирование

### Тест 1: Создайте новый файл

```bash
# Создайте новый файл от имени jenkins
sudo -u jenkins bash -c 'echo "test log entry" > /opt/assembly_visual/logs/test-new-file.log'

# Проверьте права на новый файл
getfacl /opt/assembly_visual/logs/test-new-file.log
```

Должны увидеть, что пользователь `readlog` имеет права на чтение:
```
user:readlog:r--
```

### Тест 2: Проверьте чтение от имени readlog

```bash
# Попробуйте прочитать файл от имени readlog
sudo -u readlog cat /opt/assembly_visual/logs/test-new-file.log
```

Если команда выполняется без ошибок — права настроены правильно.

### Тест 3: Проверьте в веб-интерфейсе

1. Откройте `http://omega-test-02.pmz.motor.loc:5555/`
2. Создайте новый файл:
   ```bash
   sudo -u jenkins bash -c 'echo "$(date): Test entry" > /opt/assembly_visual/logs/test-$(date +%s).log'
   ```
3. В течение 1-2 секунд новый файл должен появиться в списке
4. Кликните на файл — содержимое должно загрузиться

## Альтернативное решение: Изменение umask

Если ACL не работают, можно изменить umask для пользователя jenkins:

```bash
# Откройте профиль jenkins
sudo nano /home/jenkins/.bashrc

# Добавьте в конец файла
umask 0022

# Примените изменения
source /home/jenkins/.bashrc
```

Это обеспечит, что новые файлы будут создаваться с правами 644 (чтение для всех).

## Проверка работы сервиса

```bash
# Проверьте логи сервиса
sudo tail -f /var/log/readlog/server.log

# Проверьте, может ли readlog читать файлы
sudo -u readlog ls -la /opt/assembly_visual/logs/
sudo -u readlog cat /opt/assembly_visual/logs/app.log | head -5
```

## Если проблема сохраняется

### Проверьте SELinux

```bash
# Проверьте статус SELinux
getenforce

# Если SELinux включён, установите правильный контекст
sudo semanage fcontext -a -t var_log_t "/opt/assembly_visual/logs(/.*)?"
sudo restorecon -Rv /opt/assembly_visual/logs/

# Разрешите readlog читать файлы
sudo setsebool -P daemons_enable_cluster_mode 1
```

### Проверьте монтирование файловой системы

```bash
# Проверьте, поддерживает ли файловая система ACL
mount | grep $(df /opt/assembly_visual/logs --output=source | tail -1)

# Если ACL не поддерживаются, перемонтируйте с опцией acl
sudo mount -o remount,acl /opt
```

## Обновление скрипта установки

Скрипт `install-offline.sh` обновлён и теперь автоматически настраивает ACL при установке. Для применения на новых серверах просто запустите обновлённый скрипт.

## Итого

✅ Настроены ACL для автоматического предоставления прав на чтение  
✅ Пользователь readlog добавлен в группу jenkins  
✅ Новые файлы автоматически получают права на чтение  
✅ Скрипт установки обновлён  

Для применения на существующем сервере выполните команды из раздела "Применение на существующем сервере".
