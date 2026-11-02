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
  }

  start(server) {
    // Создаём WebSocket сервер
    this.wss = new WebSocket.Server({ server, path: '/ws/logs' });
    
    console.log('✓ WebSocket сервер запущен на /ws/logs');

    // Обработка подключений
    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      console.log(`✓ WebSocket клиент подключён: ${clientIp}`);
      
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
        console.log(`✓ WebSocket клиент отключён: ${clientIp}`);
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('Ошибка WebSocket:', error);
        this.clients.delete(ws);
      });

      // Отправляем приветственное сообщение
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Подключено к серверу логов',
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
  }
}

module.exports = LogWatcher;
