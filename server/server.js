const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const ipRangeCheck = require('ip-range-check');

// Загрузка конфигурации
const configPath = path.join(__dirname, 'config.json');
let config;

try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('✓ Конфигурация загружена:', configPath);
} catch (err) {
  console.error('✗ Ошибка загрузки конфигурации:', err.message);
  process.exit(1);
}

const app = express();
const PORT = config.server.port || 3001;
const HOST = config.server.host || '0.0.0.0';
const LOGS_DIR = config.logs.directory;

// Middleware для логирования
app.use(morgan('combined'));

// Middleware для парсинга JSON
app.use(express.json({ limit: '10mb' }));

// CORS
if (config.security.cors.enabled) {
  app.use(cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (config.security.cors.origins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Не разрешено CORS'));
      }
    }
  }));
}

// Middleware для проверки белого списка IP
function checkWhitelist(req, res, next) {
  if (!config.security.whitelist.enabled) {
    return next();
  }

  const clientIp = req.ip || req.connection.remoteAddress;
  const whitelist = config.security.whitelist.ips;

  // Проверка точного совпадения
  if (whitelist.includes(clientIp)) {
    return next();
  }

  // Проверка диапазонов
  try {
    if (ipRangeCheck(clientIp, whitelist)) {
      return next();
    }
  } catch (err) {
    console.error('Ошибка проверки IP:', err);
  }

  console.warn(`✗ Доступ запрещён для IP: ${clientIp}`);
  return res.status(403).json({
    error: 'Доступ запрещён',
    message: 'Ваш IP-адрес не в белом списке'
  });
}

// Middleware для LDAP авторизации
function checkAuth(req, res, next) {
  if (!config.security.auth.enabled) {
    return next();
  }

  // Проверка Basic Auth заголовка
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Log Viewer"');
    return res.status(401).json({
      error: 'Требуется авторизация',
      message: 'Необходима авторизация LDAP'
    });
  }

  // Декодирование учётных данных
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  // LDAP проверка (упрощённая версия)
  // В production используйте ldapjs или passport-ldapauth
  console.log(`Попытка авторизации: ${username}`);
  
  // TODO: Реальная LDAP проверка
  // const ldap = require('ldapjs');
  // const client = ldap.createClient({ url: config.security.auth.ldap.url });
  // client.bind(config.security.auth.ldap.bindDN, config.security.auth.ldap.bindPassword, (err) => {
  //   if (err) return res.status(500).json({ error: 'LDAP connection error' });
  //   
  //   const searchFilter = config.security.auth.ldap.searchFilter.replace('{{username}}', username);
  //   const opts = {
  //     filter: searchFilter,
  //     scope: 'sub'
  //   };
  //   
  //   client.search(config.security.auth.ldap.baseDN, opts, (err, res) => {
  //     if (err) return res.status(500).json({ error: 'LDAP search error' });
  //     
  //     let authenticated = false;
  //     res.on('searchEntry', (entry) => {
  //       // Проверка пароля и членства в группе
  //       authenticated = true;
  //     });
  //     
  //     res.on('end', () => {
  //       if (authenticated) {
  //         next();
  //       } else {
  //         res.status(401).json({ error: 'Неверные учётные данные' });
  //       }
  //     });
  //   });
  // });

  // Временно пропускаем все авторизованные запросы
  // В production замените на реальную LDAP проверку
  next();
}

// Применяем middleware ко всем API маршрутам
app.use('/api', checkWhitelist);
app.use('/api', checkAuth);

// Проверка существования директории с логами
function checkLogsDirectory() {
  if (!fs.existsSync(LOGS_DIR)) {
    console.error(`✗ Директория с логами не найдена: ${LOGS_DIR}`);
    console.error('  Создайте директорию или измените путь в config.json');
    process.exit(1);
  }
  console.log(`✓ Директория с логами: ${LOGS_DIR}`);
}

// API: Получить список файлов
app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(LOGS_DIR)
      .filter(file => file.endsWith('.log'))
      .map(file => {
        const filePath = path.join(LOGS_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
          path: filePath
        };
      })
      .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    res.json({
      success: true,
      directory: LOGS_DIR,
      files: files
    });
  } catch (err) {
    console.error('Ошибка чтения списка файлов:', err);
    res.status(500).json({
      success: false,
      error: 'Не удалось прочитать список файлов',
      details: err.message
    });
  }
});

// API: Получить содержимое файла
app.get('/api/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(LOGS_DIR, filename);

  // Проверка безопасности: предотвращаем выход за пределы директории
  if (!filePath.startsWith(LOGS_DIR)) {
    return res.status(403).json({
      success: false,
      error: 'Доступ запрещён'
    });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Файл не найден'
      });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);

    res.json({
      success: true,
      file: {
        name: filename,
        size: stats.size,
        lastModified: stats.mtime.toISOString()
      },
      content: content
    });
  } catch (err) {
    console.error('Ошибка чтения файла:', err);
    res.status(500).json({
      success: false,
      error: 'Не удалось прочитать файл',
      details: err.message
    });
  }
});

// API: Скачать файл
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(LOGS_DIR, filename);

  if (!filePath.startsWith(LOGS_DIR)) {
    return res.status(403).json({
      success: false,
      error: 'Доступ запрещён'
    });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Файл не найден'
      });
    }

    res.download(filePath, filename);
  } catch (err) {
    console.error('Ошибка скачивания файла:', err);
    res.status(500).json({
      success: false,
      error: 'Не удалось скачать файл',
      details: err.message
    });
  }
});

// API: Загрузить файл (опционально)
if (config.features.enableUpload) {
  const multer = require('multer');
  const upload = multer({
    dest: LOGS_DIR,
    limits: {
      fileSize: config.features.maxUploadSize || 52428800
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'text/plain' || file.originalname.endsWith('.log')) {
        cb(null, true);
      } else {
        cb(new Error('Разрешены только текстовые файлы'));
      }
    }
  });

  app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Файл не загружен'
      });
    }

    const newPath = path.join(LOGS_DIR, req.file.originalname);
    fs.renameSync(req.file.path, newPath);

    res.json({
      success: true,
      message: 'Файл загружен',
      file: {
        name: req.file.originalname,
        size: req.file.size
      }
    });
  });
}

// API: Информация о сервере
app.get('/api/info', (req, res) => {
  res.json({
    success: true,
    server: {
      version: '1.0.0',
      logsDirectory: LOGS_DIR,
      whitelistEnabled: config.security.whitelist.enabled,
      authEnabled: config.security.auth.enabled,
      features: {
        upload: config.features.enableUpload,
        download: config.features.enableDownload
      }
    }
  });
});

// Раздача статических файлов (фронтенд)
app.use(express.static(path.join(__dirname, '../dist')));

// Все остальные запросы -> index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Ошибка сервера:', err);
  res.status(500).json({
    success: false,
    error: 'Внутренняя ошибка сервера',
    details: err.message
  });
});

// Запуск сервера
checkLogsDirectory();

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  Log Viewer Server запущен');
  console.log('═══════════════════════════════════════════');
  console.log(`  Адрес: http://${HOST}:${PORT}`);
  console.log(`  Логи: ${LOGS_DIR}`);
  console.log(`  Белый список IP: ${config.security.whitelist.enabled ? 'ВКЛ' : 'ВЫКЛ'}`);
  if (config.security.whitelist.enabled) {
    console.log(`  Разрешённые IP: ${config.security.whitelist.ips.join(', ')}`);
  }
  console.log(`  Авторизация LDAP: ${config.security.auth.enabled ? 'ВКЛ' : 'ВЫКЛ'}`);
  console.log('═══════════════════════════════════════════');
  console.log('');
});
