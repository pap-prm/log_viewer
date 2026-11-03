const WebSocket = require('ws');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

class LogWatcher {
  constructor(logsDir) {
    this.logsDir = logsDir;
    this.wss = null;
    this.watcher = null;
    this.filePositions = new Map(); // Отслеживаем позицию чтения для каждого файла
    this.clients = new Set();
    this.config = null;
  }

  checkWhitelist(clientIp) {
    if (!this.config || !this.config.security.whitelist.enabled) {
      return true; // Если whitelist отключен, разрешаем всем
    }

    const whitelist = this.config.security.whitelist.ips;
    
    // Убираем IPv6 prefix если есть
    const ip = clientIp.replace('::ffff:', '');
    
    // Проверяем точное совпадение
    if (whitelist.includes(ip)) {
      return true;
    }
    
    // Проверяем диапазоны (простая проверка для CIDR)
    for (const range of whitelist) {
      if (range.includes('/')) {
        // Простая проверка для диапазонов типа 10.0.0.0/8
        const [network, bits] = range.split('/');
        const networkParts = network.split('.');
        const ipParts = ip.split('.');
        
        if (bits === '8' && ipParts[0] === networkParts[0]) {
          return true;
        } else if (bits === '16' && ipParts[0] === networkParts[0] && ipParts[1] === networkParts[1]) {
          return true;
        } else if (bits === '24' && ipParts[0] === networkParts[0] && ipParts[1] === networkParts[1] && ipParts[2] === networkParts[2]) {
          return true;
        }
      }
    }
    
    return false;
  }

  start(server, config) {
    this.config = config;
    
    // Создаём WebSocket сервер для логов
    this.wss = new WebSocket.Server({ 
      server, 
      path: '/ws/logs',
      verifyClient: (info, callback) => {
        const clientIp = info.req.socket.remoteAddress;
        if (this.checkWhitelist(clientIp)) {
          callback(true);
        } else {
          console.warn(`✗ WebSocket подключение отклонено для IP: ${clientIp}`);
          callback(false, 403, 'Forbidden');
        }
      }
    });
    
    // Создаём WebSocket сервер для уведомлений о файлах
    this.wssFiles = new WebSocket.Server({ 
      server, 
      path: '/ws/files',
      verifyClient: (info, callback) => {
        const clientIp = info.req.socket.remoteAddress;
        if (this.checkWhitelist(clientIp)) {
          callback(true);
        } else {
          console.warn(`✗ WebSocket подключение отклонено для IP: ${clientIp}`);
          callback(false, 403, 'Forbidden');
        }
      }
    });
    
    console.log('✓ WebSocket сервер запущен на /ws/logs');
    console.log('✓ WebSocket сервер запущен на /ws/files');

    // Обработка подключений к /ws/logs
    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      console.log(`✓ WebSocket клиент подключён к /ws/logs: ${clientIp}`);
      
      this.clients.add(ws);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(ws, data);
        } catch (err) {
          console.error('Ошибка обработки сообщения от клиента:', err);
        }
      });

      ws.on('close', () => {
        console.log(`✓ WebSocket клиент отключён от /ws/logs: ${clientIp}`);
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('Ошибка WebSocket /ws/logs:', error);
        this.clients.delete(ws);
      });

      // Отправляем приветственное сообщение
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Подключено к серверу логов',
        logsDir: this.logsDir
      }));
    });

    // Обработка подключений к /ws/files
    this.fileClients = new Set();
    this.wssFiles.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      console.log(`✓ WebSocket клиент подключён к /ws/files: ${clientIp}`);
      
      this.fileClients.add(ws);

      ws.on('close', () => {
        console.log(`✓ WebSocket клиент отключён от /ws/files: ${clientIp}`);
        this.fileClients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('Ошибка WebSocket /ws/files:', error);
        this.fileClients.delete(ws);
      });

      // Отправляем приветственное сообщение
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Подключено к серверу уведомлений о файлах',
        logsDir: this.logsDir
      }));
    });

    // Запускаем отслеживание файлов
    this.startWatching();
  }

  startWatching() {
    // Настраиваем chokidar для отслеживания изменений
    this.watcher = chokidar.watch(this.logsDir, {
      persistent: true,
      ignoreInitial: false,
      followSymlinks: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });

    // Новый файл создан
    this.watcher.on('add', (filePath) => {
      console.log(`✓ Новый файл лога: ${filePath}`);
      this.filePositions.set(filePath, 0);
      this.broadcast({
        type: 'file_added',
        file: path.basename(filePath),
        path: filePath
      });
    });

    // Файл изменён (новые строки)
    this.watcher.on('change', (filePath) => {
      this.readFileChanges(filePath);
    });

    // Файл удалён
    this.watcher.on('unlink', (filePath) => {
      console.log(`✓ Файл лога удалён: ${filePath}`);
      this.filePositions.delete(filePath);
      this.broadcast({
        type: 'file_removed',
        file: path.basename(filePath),
        path: filePath
      });
    });

    // Ошибка отслеживания
    this.watcher.on('error', (error) => {
      console.error('Ошибка отслеживания файлов:', error);
    });

    console.log(`✓ Отслеживание файлов запущено: ${this.logsDir}`);
  }

  readFileChanges(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const currentPosition = this.filePositions.get(filePath) || 0;
      
      // Если файл стал меньше (ротация логов), сбрасываем позицию
      if (stats.size < currentPosition) {
        this.filePositions.set(filePath, 0);
        this.broadcast({
          type: 'file_rotated',
          file: path.basename(filePath),
          path: filePath
        });
        return;
      }

      // Если файл не изменился, ничего не делаем
      if (stats.size === currentPosition) {
        return;
      }

      // Читаем новые строки
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(stats.size - currentPosition);
      fs.readSync(fd, buffer, 0, buffer.length, currentPosition);
      fs.closeSync(fd);

      const newContent = buffer.toString('utf8');
      const lines = newContent.split('\n').filter(line => line.trim() !== '');

      if (lines.length > 0) {
        // Обновляем позицию
        this.filePositions.set(filePath, stats.size);

        // Отправляем новые строки клиентам
        this.broadcast({
          type: 'new_lines',
          file: path.basename(filePath),
          path: filePath,
          lines: lines,
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error(`Ошибка чтения файла ${filePath}:`, err);
    }
  }

  handleClientMessage(ws, data) {
    switch (data.type) {
      case 'subscribe':
        // Клиент подписывается на конкретный файл
        if (data.file) {
          ws.subscribedFile = data.file;
          ws.send(JSON.stringify({
            type: 'subscribed',
            file: data.file
          }));
        }
        break;

      case 'unsubscribe':
        ws.subscribedFile = null;
        ws.send(JSON.stringify({
          type: 'unsubscribed'
        }));
        break;

      case 'ping':
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString()
        }));
        break;
    }
  }

  broadcast(message) {
    const messageStr = JSON.stringify(message);
    
    // Отправляем уведомления о файлах на /ws/files
    if (message.type === 'file_added' || message.type === 'file_removed') {
      this.fileClients?.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageStr);
        }
      });
    }
    
    // Отправляем новые строки на /ws/logs
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        // Если клиент подписан на конкретный файл, отправляем только его
        if (client.subscribedFile) {
          if (message.file === client.subscribedFile || 
              message.path?.endsWith(client.subscribedFile)) {
            client.send(messageStr);
          }
        } else {
          // Иначе отправляем все сообщения
          client.send(messageStr);
        }
      }
    });
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
    }
    if (this.wss) {
      this.wss.close();
    }
    if (this.wssFiles) {
      this.wssFiles.close();
    }
  }
}

module.exports = LogWatcher;
