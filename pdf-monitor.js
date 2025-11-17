const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

async function getPdfInfo(pdfPath) {
  const absolutePath = path.resolve(pdfPath);
  try {
    const stats = await fs.promises.stat(absolutePath);
    return {
      path: absolutePath,
      exists: true,
      size: stats.size,
      modifiedAt: stats.mtime,
      modifiedAtISO: stats.mtime.toISOString(),
    };
  } catch (error) {
    return {
      path: absolutePath,
      exists: false,
      error: error.code === 'ENOENT' ? 'PDF nicht gefunden' : error.message,
    };
  }
}

function createPdfMonitor(pdfPath, onChange) {
  const absolutePath = path.resolve(pdfPath);
  const watcher = chokidar.watch(absolutePath, {
    persistent: true,
    ignoreInitial: true,
  });

  const trigger = (eventType) => {
    if (typeof onChange === 'function') {
      onChange(eventType);
    }
  };

  watcher
    .on('add', () => trigger('add'))
    .on('change', () => trigger('change'))
    .on('unlink', () => trigger('unlink'))
    .on('error', (error) => trigger(`error: ${error.message}`));

  return watcher;
}

module.exports = {
  getPdfInfo,
  createPdfMonitor,
};
