# Assembly Visual Log Viewer

Веб-сервис для чтения текстовых логов Java-приложения из папки, заданной **в конфиг-файле**
(по умолчанию `/opt/assembly_visual/logs/`), с подсветкой ключевых слов
**Error / Warning / Fatal / Exception / Critical / Severe / Panic / Debug / Trace** и т.п.

Доступ к сервису — **только для пользователей указанной группы MS Active Directory**,
проверка через **LDAPS** (порт 636; открытый `ldap://` без StartTLS конфигурация не примет).

Стек: Java 17 + Jetty 11 + UnboundID LDAP SDK. Порт по умолчанию — **5555**.

---

## Возможности

| Функция | Описание |
|---|---|
| Список файлов логов | автоопределение `.log/.txt/.out` в папке из `logs.dir`, размер, дата изменения |
| Подсветка уровней | цвет фона строки по уровню + выделение самих слов (`ERROR`, `WARNING`, `FATAL`, `EXCEPTION`, `FAILED`, `CRITICAL`, `SEVERE`, `PANIC`, `NOTICE`, `DEBUG`, `TRACE`) |
| Учёт формата Java-лога | уровни SLF4J/Log4J в начале строки (`2026-10-22 16:09:01,234 ERROR [main] ...`), stacktrace-строки (`at ...`, `Caused by:`, `... 12 more`) считаются частью ERROR |
| Фильтры | по уровням (чекбоксы) и текстовый поиск с подсветкой совпадений |
| «Хвост» файла | последние 500/2000/5000 строк потоковым чтением (кольцевой буфер) — работает даже с файлами в сотни МБ и с непрерывно пишущимся логом |
| Автообновление | опция «авто-обновление 10с» для наблюдения за свежими записями |
| Безопасность | вход по учётной записи AD (bind по LDAPS), проверка членства в группе (с учётом вложенных групп через `tokenGroups`), HttpOnly/SameSite cookie, защита от directory traversal и LDAP injection, экранирование HTML |

---

## Установка на RedOS 8.0.3

### Шаг 0. Требования

- RedOS 8.0.3, доступ root/sudo, доступ в интернет или к внутреннему репозиторию.
- Хост должен быть в домене MS AD (или хотя бы иметь DNS-доступ к контроллеру домена по порту 636).

### Шаг 1. Java 17 и Maven

```bash
sudo dnf install -y java-17-openjdk-headless maven git
java -version    # должно показать openjdk 17.x
mvn -version
```

Если `maven` недоступен в репозитории RedOS, соберите jar на любой машине с Maven
и скопируйте готовый `target/log-viewer.jar` на сервер (шаг 3).

### Шаг 2. Сборка проекта

```bash
git clone <URL вашего репозитория> log-viewer
cd log-viewer
mvn -q clean package
ls -l target/log-viewer.jar     # толстый jar со всеми зависимостями
```

### Шаг 3. Развёртывание файлов

```bash
# пользователь и группа сервиса
sudo groupadd -r logviewer
sudo useradd -r -g logviewer -d /opt/log-viewer -s /usr/sbin/nologin logviewer

sudo mkdir -p /opt/log-viewer /etc/log-viewer /var/log/log-viewer
sudo cp target/log-viewer.jar /opt/log-viewer/
sudo cp config/config.properties.example /etc/log-viewer/config.properties
sudo chown -R root:logviewer /etc/log-viewer /opt/log-viewer
sudo chmod 640 /etc/log-viewer/config.properties   # в файле пароль сервисной учётки!
```

### Шаг 4. Права на чтение логов

Логи принадлежат `jenkins:jenkins`. Чтобы сервис их читал, добавьте пользователя
`logviewer` в группу `jenkins` **без прав на запись**:

```bash
sudo usermod -aG jenkins logviewer
# убедитесь, что файлы читаемы группой (у вас как раз -rw-r--r--, т.е. world-readable)
ls -l /opt/assembly_visual/logs/
```

Альтернатива (если добавлять в группу Jenkins нельзя): ACL на папку логов только на чтение:

```bash
sudo setfacl -R -m u:logviewer:rX /opt/assembly_visual/logs
sudo setfacl -R -d -m u:logviewer:rX /opt/assembly_visual/logs   # для новых файлов
```

### Шаг 5. Настройка конфиг-файла

Правим `/etc/log-viewer/config.properties`:

```properties
# папка, ИЗ КАКОЙ ЧИТАЮТСЯ ЛОГИ — задаётся здесь:
logs.dir=/opt/assembly_visual/logs/

server.port=5555

# --- доступ по группе MS AD через LDAPS ---
ldap.url=ldaps://dc01.corp.local:636
ldap.bind.dn=CN=logviewer-svc,OU=Service Accounts,DC=corp,DC=local
ldap.bind.password=ПАРОЛЬ_СЕРВИСНОЙ_УЧЁТКИ
ldap.allowed.groups=LogViewers
```

Сервисная учётная запись в AD (`logviewer-svc`) нужна только для **чтения**
атрибутов пользователей (`sAMAccountName`, `memberOf`, `tokenGroups`) — стандартных
прав «Read» на контейнер пользователей достаточно. Группа `LogViewers` — та самая
группа MS AD, пользователям которой разрешён просмотр логов.

### Шаг 6. Доверие сертификату AD для LDAPS

LDAPS требует проверки TLS-цепочки. Варианты:

**A. Сертификат КД выпущен внутренним CA.** Экспортируйте сертификат корневого CA
(`certmgr.msc` на Windows-машине администратора → Корневые центры сертификации →
экспорт .cer/.crt) и импортируйте в truststore JDK:

```bash
sudo keytool -importcert -trustcacerts -noprompt \
  -alias ad-root-ca -file /tmp/ad-root-ca.crt \
  -keystore /etc/pki/java/cacerts -storepass changeit
```

(в RedOS путь cacerts может быть `/usr/lib/jvm/java-17-openjdk/jre/lib/security/cacerts`
или ссылкой на `/etc/pki/java/cacerts` — проверьте `update-alternatives --display java`).

**B. Отдельный truststore для сервиса** (не трогая системный cacerts):

```bash
sudo keytool -importcert -alias ad-root-ca -file /tmp/ad-root-ca.crt \
  -keystore /etc/log-viewer/ad-truststore.jks -storepass СЕКРЕТ
```

и в конфиге:

```properties
ldap.truststore.path=/etc/log-viewer/ad-truststore.jks
ldap.truststore.password=СЕКРЕТ
```

Проверка связи с AD вручную:

```bash
openssl s_client -connect dc01.corp.local:636 </dev/null   # должен установиться TLS
```

### Шаг 7. HTTPS для самого веб-интерфейса (опционально, но рекомендуется)

Сама страница входа передаёт пароль AD, поэтому включите TLS на сервисе.
Для стенда — самоподписанный сертификат, для prod — сертификат от внутреннего CA:

```bash
sudo keytool -genkeypair -alias logviewer -keyalg RSA -keysize 2048 \
  -validity 730 -storetype PKCS12 \
  -keystore /etc/log-viewer/keystore.p12 -storepass ПАРОЛЬ_KEYSTORE \
  -dname "CN=logviewer.corp.local" -ext SAN=dns:logviewer.corp.local
sudo chown root:logviewer /etc/log-viewer/keystore.p12
sudo chmod 640 /etc/log-viewer/keystore.p12
```

В конфиге:

```properties
server.https.enabled=true
server.https.keystore.path=/etc/log-viewer/keystore.p12
server.https.keystore.password=ПАРОЛЬ_KEYSTORE
```

После этого интерфейс доступен как `https://хост:5555` (cookie автоматически получат флаг Secure).

### Шаг 8. systemd-сервис (автозапуск, порт 5555)

```bash
sudo cp systemd/log-viewer.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now log-viewer
sudo systemctl status log-viewer
journalctl -u log-viewer -f        # журнал запуска (там же сводка конфигурации)
```

### Шаг 9. Открытие порта 5555 в firewall (firewalld в RedOS)

Разрешите доступ только из сети предприятия/нужных подсетей:

```bash
sudo firewall-cmd --permanent --add-port=5555/tcp
# или точечно, например только из подсети 10.10.0.0/16:
# sudo firewall-cmd --permanent --add-rich-rule='rule family=ipv4 source address=10.10.0.0/16 port port=5555 protocol=tcp accept'
sudo firewall-cmd --reload
sudo ss -tlnp | grep 5555
```

### Шаг 10. Проверка

1. Откройте в браузере `http://host:5555` (или `https://host:5555`, если включён шаг 7) → страница входа.
2. Введите логин AD (например `ivanovii` или `ivanovii@corp.local`) и пароль **из группы `LogViewers`**
   → список файлов: `app-2026-10-22.log (3.2 МБ)` и `app.log`.
3. Пользователь **не из группы** → сообщение «У вас нет доступа…».
4. Неверный пароль → «Неверный пароль».
5. Включите фильтр ERROR/WARNING/FATAL, наберите в поиске `Exception` — стектрейсы Java
   подсветятся как ERROR, слова `Error/Warning/Fatal` — цветом прямо внутри строк.

---

## Как это работает (безопасность)

```
Браузер ──HTTP(S):5555──► Jetty ──► AppServlet
                                   │  /api/login: bind пользователем ──► LDAPS:636 ──► MS AD
                                   │  проверка memberOf/tokenGroups ∈ ldap.allowed.groups
                                   │  успех → SessionStore (HttpOnly cookie)
                                   └─ /api/files, /api/log (только с активной сессией)
                                          └─ LogService: только файлы из logs.dir,
                                             без выхода за пределы папки
```

- Пароли пользователей нигде не сохраняются — выполняется только LDAP bind к AD по LDAPS.
- `ldap.url` вида `ldap://` без `ldap.starttls=true` считается ошибкой конфигурации — сервис не стартует.
- Имена файлов проходят канонизацию путей: запросы вроде `../../etc/passwd` отклоняются (403).
- Каждая строка лога экранируется перед выводом в HTML (логи Java могут содержать `<`,`>` и прочее).

## Типовые проблемы

| Симптом | Причина / решение |
|---|---|
| `Не найден файл конфигурации` | проверьте `LOGVIEWER_CONFIG` / аргумент запуска |
| Ошибка старта: `Требуется ldaps://` | в конфиге `ldap.url=ldap://...` без StartTLS — исправьте на `ldaps://host:636` |
| `Ошибка TLS при подключении к AD` | корневой сертификат AD не импортирован в truststore (шаг 6); либо hostname в `ldap.url` не совпадает с CN сертификата КД |
| `Сервисная учётная запись не может связаться с AD` | неверный `ldap.bind.dn/password`, КД недоступен по 636, на DC не включён LDAPS (нужен сертификат сервера на КД) |
| «У вас нет доступа» | пользователь не в группе из `ldap.allowed.groups`; укажите CN или полный DN группы; помните про вложенные группы |
| Пустой список файлов | `logs.dir` указан неверно или у `logviewer` нет прав на чтение (шаг 4) |
| Порт занят | `ss -tlnp \| grep 5555`, измените `server.port` |

## Быстрый запуск для разработки (без AD)

```bash
cp config/config.properties.example config.properties
# в config.properties: ldap.enabled=false, logs.dir=./demo-logs
mvn -q clean package
java -jar target/log-viewer.jar config.properties
# http://localhost:5555  (вход принимает любую строку - ТОЛЬКО для отладки!)
```
