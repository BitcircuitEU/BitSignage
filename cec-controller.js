const { execFile, spawn } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

class CecController {
  constructor(options = {}) {
    this.binary = options.binary || 'cec-client';
    this.logicalAddress = options.logicalAddress ?? 0;
    this._binaryPath = null;
    this._isAvailable = null;
  }

  async ensureAvailable() {
    if (this._isAvailable !== null) {
      return this._isAvailable;
    }

    try {
      const { stdout } = await execFileAsync('which', [this.binary]);
      this._binaryPath = stdout.trim() || this.binary;
      this._isAvailable = true;
    } catch (err) {
      this._isAvailable = false;
      this._binaryPath = null;
    }

    return this._isAvailable;
  }

  async sendCommand(command) {
    const available = await this.ensureAvailable();
    if (!available) {
      throw new Error('cec-client nicht gefunden. Bitte cec-utils installieren.');
    }

    return new Promise((resolve, reject) => {
      const child = spawn(this._binaryPath, ['-s', '-d', '1']);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || `CEC-Command failed with code ${code}`));
        } else {
          resolve(stdout.trim());
        }
      });

      child.stdin.write(`${command}\n`);
      child.stdin.end();
    });
  }

  async turnOn() {
    return this.sendCommand(`on ${this.logicalAddress}`);
  }

  async turnOff() {
    return this.sendCommand(`standby ${this.logicalAddress}`);
  }

  async getPowerStatus() {
    try {
      const output = await this.sendCommand(`pow ${this.logicalAddress}`);
      const match = output.match(/power status:\s*(.+)/i);
      const status = match ? match[1].toLowerCase() : 'unknown';
      return {
        available: true,
        status,
        raw: output,
      };
    } catch (error) {
      return {
        available: false,
        status: 'unavailable',
        error: error.message,
      };
    }
  }
}

module.exports = CecController;
