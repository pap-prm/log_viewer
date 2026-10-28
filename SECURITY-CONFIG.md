# Конфигурация безопасности Log Viewer

## Обзор

Сервер поддерживает два уровня безопасности, которые можно включать/отключать независимо:

1. **Белый список IP** — проверка IP-адреса клиента
2. **Авторизация LDAP/AD** — проверка учётных данных пользователя

## Схема работы

```
Запрос клиента
    ↓
[1] Проверка белого списка IP (если whitelist.enabled = true)
    ├─ IP в списке → продолжить
    ├─ IP не в списке → 403 Forbidden
    └─ whitelist.enabled = false → пропустить
    ↓
[2] Проверка авторизации LDAP (если auth.enabled = true)
    ├─ Авторизован → продолжить
    ├─ Не авторизован → 401 Unauthorized
    └─ auth.enabled = false → пропустить
    ↓
[3] Обработка запроса API
```

## Конфигурация (server/config.json)

### Вариант 1: Только белый список IP (без авторизации)

```json
{
  "security": {
    "whitelist": {
      "enabled": true,
      "ips": [
        "127.0.0.1",
        "192.168.1.0/24",
        "10.0.0.0/8"
      ]
    },
    "auth": {
      "enabled": false
    }
  }
}
```

**Результат:** Доступ разрешён только с указанных IP-адресов, авторизация не требуется.

---

### Вариант 2: Только авторизация LDAP (без белого списка)

```json
{
  "security": {
    "whitelist": {
      "enabled": false
    },
    "auth": {
      "enabled": true,
      "type": "ldap",
      "ldap": {
        "url": "ldaps://dc01.company.local:636",
        "baseDN": "DC=company,DC=local",
        "bindDN": "CN=ldap_bind,OU=Service,DC=company,DC=local",
        "bindPassword": "PasswordOfBindUser",
        "searchFilter": "(sAMAccountName={{username}})",
        "groupDN": "CN=LogViewers,OU=Groups,DC=company,DC=local",
        "groupAttribute": "member"
      }
    }
  }
}
```

**Результат:** Любой IP может подключиться, но требуется авторизация через LDAP/AD.

---

### Вариант 3: Белый список + авторизация LDAP (максимальная защита)

```json
{
  "security": {
    "whitelist": {
      "enabled": true,
      "ips": [
        "127.0.0.1",
        "192.168.1.0/24"
      ]
    },
    "auth": {
      "enabled": true,
      "type": "ldap",
      "ldap": {
        "url": "ldaps://dc01.company.local:636",
        "baseDN": "DC=company,DC=local",
        "bindDN": "CN=ldap_bind,OU=Service,DC=company,DC=local",
        "bindPassword": "PasswordOfBindUser",
        "searchFilter": "(sAMAccountName={{username}})",
        "groupDN": "CN=LogViewers,OU=Groups,DC=company,DC=local",
        "groupAttribute": "member"
      }
    }
  }
}
```

**Результат:** Доступ только с указанных IP + требуется авторизация LDAP.

---

### Вариант 4: Без ограничений (только для разработки)

```json
{
  "security": {
    "whitelist": {
      "enabled": false
    },
    "auth": {
      "enabled": false
    }
  }
}
```

**Результат:** Полный доступ без ограничений. **Не рекомендуется для production!**

---

## Параметры конфигурации

### whitelist

| Параметр | Тип | Описание |
|----------|-----|----------|
| `enabled` | boolean | Включить/отключить проверку IP |
| `ips` | array | Список разрешённых IP и подсетей (CIDR) |

**Примеры IP:**
- Точный IP: `"192.168.1.100"`
- Подсеть: `"192.168.1.0/24"` (все IP от 192.168.1.1 до 192.168.1.254)
- Диапазон: `"10.0.0.0/8"` (все IP от 10.0.0.0 до 10.255.255.255)
- IPv6: `"::1"` (localhost), `"fe80::/10"`

---

### auth

| Параметр | Тип | Описание |
|----------|-----|----------|
| `enabled` | boolean | Включить/отключить авторизацию |
| `type` | string | Тип авторизации (пока только `"ldap"`) |
| `ldap` | object | Настройки LDAP подключения |

#### ldap

| Параметр | Тип | Описание |
|----------|-----|----------|
| `url` | string | URL LDAP сервера (`ldaps://` для SSL) |
| `baseDN` | string | Базовый DN для поиска пользователей |
| `bindDN` | string | DN для подключения к LDAP (service account) |
| `bindPassword` | string | Пароль для bindDN |
| `searchFilter` | string | Фильтр поиска пользователя (`{{username}}` заменяется на логин) |
| `groupDN` | string | DN группы, членство в которой требуется |
| `groupAttribute` | string | Атрибут группы для проверки членства |

---

## Настройка LDAP/AD

### Шаг 1: Создать service account в AD

```
OU: Service Accounts
CN: ldap_bind
Password: StrongPassword123
Права: только чтение
```

### Шаг 2: Создать группу доступа

```
OU: Groups
CN: LogViewers
Члены: пользователи, которым нужен доступ
```

### Шаг 3: Настроить config.json

```json
{
  "auth": {
    "enabled": true,
    "type": "ldap",
    "ldap": {
      "url": "ldaps://dc01.company.local:636",
      "baseDN": "DC=company,DC=local",
      "bindDN": "CN=ldap_bind,OU=Service Accounts,DC=company,DC=local",
      "bindPassword": "StrongPassword123",
      "searchFilter": "(sAMAccountName={{username}})",
      "groupDN": "CN=LogViewers,OU=Groups,DC=company,DC=local",
      "groupAttribute": "member"
    }
  }
}
```

### Шаг 4: Установить зависимости для LDAP

```bash
cd /opt/log-viewer
npm install ldapjs
```

### Шаг 5: Реализовать LDAP проверку в server.js

Раскомментируйте и доработайте код в `checkAuth()` middleware.

---

## Проверка работы

### Тест белого списка

```bash
# С разрешённого IP (должно работать)
curl http://server:3001/api/info

# С запрещённого IP (должен быть 403)
# Ожидается: {"error":"Доступ запрещён","message":"Ваш IP-адрес не в белом списке"}
```

### Тест авторизации

```bash
# Без авторизации (должен быть 401)
curl http://server:3001/api/info
# Ожидается: {"error":"Требуется авторизация"}

# С авторизацией
curl -u username:password http://server:3001/api/info
# Ожидается: {"success":true,...}
```

---

## Логи

При включённой проверке IP:
```
✗ Доступ запрещён для IP: 192.168.1.50
```

При включённой авторизации:
```
Попытка авторизации: ivanov
```

---

## Перезапуск после изменения конфига

```bash
sudo systemctl restart log-viewer-server
```

Или в dev-режиме:
```bash
cd /opt/log-viewer
npm run dev
```

---

## Рекомендации

| Сценарий | Whitelist | Auth |
|----------|-----------|------|
| Локальная разработка | ❌ | ❌ |
| Внутренняя сеть (доверенная) | ✅ | ❌ |
| Внешний доступ | ✅ | ✅ |
| Только авторизованные пользователи | ❌ | ✅ |

**Best Practice:** Используйте оба уровня защиты для production-среды.

---

## Troubleshooting

### Проблема: 403 даже с разрешённого IP

**Решение:**
1. Проверьте свой IP: `curl ifconfig.me`
2. Убедитесь, что IP в списке `whitelist.ips`
3. Проверьте логи: `sudo journalctl -u log-viewer-server`

### Проблема: 401 даже с правильным паролем

**Решение:**
1. Проверьте настройки LDAP в `config.json`
2. Убедитесь, что service account работает
3. Проверьте членство пользователя в группе `groupDN`
4. Включите детальное логирование в `checkAuth()`

### Проблема: LDAP connection error

**Решение:**
1. Проверьте доступность LDAP сервера: `telnet dc01.company.local 636`
2. Убедитесь, что сертификат LDAP доверенный
3. Проверьте `bindDN` и `bindPassword`

---

## Безопасность

⚠️ **Важно:**

1. **Не храните пароли в config.json** в production — используйте переменные окружения или vault
2. **Всегда используйте LDAPS** (порт 636) вместо LDAP (порт 387)
3. **Ограничьте права service account** — только чтение, без возможности изменения
4. **Регулярно меняйте пароли** service account
5. **Мониторьте логи** на предмет подозрительных попыток доступа

---

## Примеры использования

### Пример 1: Доступ только из офиса

```json
{
  "whitelist": {
    "enabled": true,
    "ips": ["192.168.10.0/24"]
  },
  "auth": {
    "enabled": false
  }
}
```

### Пример 2: Доступ для всех, но только авторизованным

```json
{
  "whitelist": {
    "enabled": false
  },
  "auth": {
    "enabled": true,
    "ldap": {
      "groupDN": "CN=LogViewers,OU=Groups,DC=company,DC=local"
    }
  }
}
```

### Пример 3: Максимальная защита

```json
{
  "whitelist": {
    "enabled": true,
    "ips": ["10.0.0.0/8", "172.16.0.0/12"]
  },
  "auth": {
    "enabled": true,
    "ldap": {
      "url": "ldaps://dc01.company.local:636",
      "groupDN": "CN=LogViewers,OU=Groups,DC=company,DC=local"
    }
  }
}
```

---

## Изменение настроек на лету

Текущая реализация требует перезапуска сервера после изменения `config.json`:

```bash
sudo nano /opt/log-viewer/config.json
sudo systemctl restart log-viewer-server
```

Для hot-reload можно добавить watching файла конфигурации (опционально).
