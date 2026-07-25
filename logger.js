const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function write(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(path.join(logDir, 'app.log'), line, 'utf8');
}

module.exports = {
  info(message) { write(`[INFO] ${message}`); },
  error(message) { write(`[ERROR] ${message}`); },
  warn(message) { write(`[WARN] ${message}`); }
};
