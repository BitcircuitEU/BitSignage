const { execFile, spawn } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const OPCODES = Object.freeze({
  ACTIVE_SOURCE: 0x82,
  IMAGE_VIEW_ON: 0x04,
  TEXT_VIEW_ON: 0x0d,
  REQUEST_ACTIVE_SOURCE: 0x85,
  GIVE_PHYSICAL_ADDRESS: 0x83,
  REPORT_PHYSICAL_ADDRESS: 0x84,
  SET_STREAM_PATH: 0x86,
  STANDBY: 0x36,
  GIVE_DEVICE_VENDOR_ID: 0x8c,
  DEVICE_VENDOR_ID: 0x87,
  VENDOR_COMMAND: 0x89,
  VENDOR_COMMAND_WITH_ID: 0xa0,
  USER_CONTROL_PRESSED: 0x44,
  USER_CONTROL_RELEASED: 0x45,
  GIVE_DEVICE_POWER_STATUS: 0x8f,
  REPORT_POWER_STATUS: 0x90,
  GIVE_OSD_NAME: 0x46,
  SET_OSD_NAME: 0x47,
  SET_OSD_STRING: 0x64,
  MENU_REQUEST: 0x8d,
  MENU_STATUS: 0x8e,
  SYSTEM_AUDIO_MODE_REQUEST: 0x70,
  SET_SYSTEM_AUDIO_MODE: 0x72,
});

const SAMSUNG_VENDOR_ID = ['00', '00', 'F0'];
const DEFAULT_PHYSICAL_ADDRESS = '1000';
const DEFAULT_SOURCE_ADDRESS = 4;

const USER_CONTROL_CODES = Object.freeze({
  select: 0x00,
  up: 0x01,
  down: 0x02,
  left: 0x03,
  right: 0x04,
  rootMenu: 0x09,
  setupMenu: 0x0a,
  contentsMenu: 0x0b,
  favoriteMenu: 0x0c,
  exit: 0x0d,
  numberEntryMode: 0x1d,
  number11: 0x1e,
  number12: 0x1f,
  number0: 0x20,
  number1: 0x21,
  number2: 0x22,
  number3: 0x23,
  number4: 0x24,
  number5: 0x25,
  number6: 0x26,
  number7: 0x27,
  number8: 0x28,
  number9: 0x29,
  dot: 0x2a,
  enter: 0x2b,
  clear: 0x2c,
  nextFavorite: 0x2f,
  channelUp: 0x30,
  channelDown: 0x31,
  previousChannel: 0x32,
  soundSelect: 0x33,
  inputSelect: 0x34,
  displayInformation: 0x35,
  help: 0x36,
  pageUp: 0x37,
  pageDown: 0x38,
  power: 0x40,
  volumeUp: 0x41,
  volumeDown: 0x42,
  mute: 0x43,
  play: 0x44,
  stop: 0x45,
  pause: 0x46,
  record: 0x47,
  rewind: 0x48,
  fastForward: 0x49,
  eject: 0x4a,
  forward: 0x4b,
  backward: 0x4c,
  stopRecord: 0x4d,
  pauseRecord: 0x4e,
  angle: 0x50,
  subPicture: 0x51,
  videoOnDemand: 0x52,
  electronicProgramGuide: 0x53,
  timerProgramming: 0x54,
  initialConfiguration: 0x55,
  selectBroadcastType: 0x56,
  selectSoundPresentation: 0x57,
  playFunction: 0x60,
  pausePlayFunction: 0x61,
  recordFunction: 0x62,
  pauseRecordFunction: 0x63,
  stopFunction: 0x64,
  muteFunction: 0x65,
  restoreVolumeFunction: 0x66,
  tuneFunction: 0x67,
  selectMediaFunction: 0x68,
  selectAvInputFunction: 0x69,
  selectAudioInputFunction: 0x6a,
  powerToggleFunction: 0x6b,
  powerOffFunction: 0x6c,
  powerOnFunction: 0x6d,
  blue: 0x71,
  red: 0x72,
  green: 0x73,
  yellow: 0x74,
  data: 0x76,
  anReturn: 0x91,
  anChannelsList: 0x96,
});

const KEY_ALIASES = Object.freeze({
  ok: 'select',
  confirm: 'select',
  enter: 'enter',
  back: 'anReturn',
  return: 'anReturn',
  exit: 'exit',
  home: 'contentsMenu',
  smarthub: 'contentsMenu',
  smartHub: 'contentsMenu',
  settings: 'setupMenu',
  tools: 'setupMenu',
  menu: 'rootMenu',
  info: 'displayInformation',
  source: 'inputSelect',
  chplus: 'channelUp',
  chminus: 'channelDown',
  volplus: 'volumeUp',
  volminus: 'volumeDown',
  volumeup: 'volumeUp',
  volumedown: 'volumeDown',
  poweron: 'powerOnFunction',
  poweroff: 'powerOffFunction',
  powertoggle: 'powerToggleFunction',
  guide: 'electronicProgramGuide',
  channelList: 'anChannelsList',
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeKeyName(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toHexByte(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error('Leerer Byte-String');
    }
    if (/^0x/i.test(trimmed)) {
      return trimmed.replace(/^0x/i, '').padStart(2, '0').slice(-2).toUpperCase();
    }
    if (/^[0-9a-f]{1,2}$/i.test(trimmed)) {
      return trimmed.padStart(2, '0').toUpperCase();
    }
    if (/^\d+$/.test(trimmed)) {
      const numeric = Number.parseInt(trimmed, 10);
      if (Number.isNaN(numeric)) {
        throw new Error(`Ungültiges Byte: ${value}`);
      }
      return numeric.toString(16).padStart(2, '0').toUpperCase();
    }
    throw new Error(`Ungültiges Byte: ${value}`);
  }

  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0xff) {
    throw new Error(`Byte ausserhalb des Bereichs: ${value}`);
  }
  return numeric.toString(16).padStart(2, '0').toUpperCase();
}

function normalizePayload(payload) {
  if (!payload && payload !== 0) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload.map((byte) => toHexByte(byte));
  }

  if (typeof payload === 'string') {
    return payload
      .split(/[^0-9a-fA-Fx]+/)
      .filter(Boolean)
      .map((byte) => toHexByte(byte));
  }

  throw new Error('Payload muss String oder Array sein');
}

const NORMALIZED_KEY_ALIASES = Object.freeze(
  Object.fromEntries(
    Object.entries(KEY_ALIASES).map(([alias, target]) => [
      normalizeKeyName(alias),
      typeof target === 'number' ? target : normalizeKeyName(target),
    ])
  )
);

function createDefaultKeyMap() {
  const map = {};
  for (const [name, code] of Object.entries(USER_CONTROL_CODES)) {
    map[normalizeKeyName(name)] = code;
  }
  for (const [alias, target] of Object.entries(NORMALIZED_KEY_ALIASES)) {
    const resolved =
      typeof target === 'number' ? target : USER_CONTROL_CODES[target] ?? null;
    if (typeof resolved === 'number') {
      map[alias] = resolved;
    }
  }
  return map;
}

class CecController {
  constructor(options = {}) {
    this.binary = options.binary || 'cec-client';
    this.targetAddress = this._normalizeNibble(
      options.targetAddress ?? options.logicalAddress ?? 0
    );
    this.logicalAddress = this.targetAddress;
    this.sourceAddress = this._normalizeNibble(
      options.sourceAddress ?? DEFAULT_SOURCE_ADDRESS
    );
    this.physicalAddress = this._normalizePhysicalAddress(
      options.physicalAddress ?? DEFAULT_PHYSICAL_ADDRESS
    );
    this.keyMap = createDefaultKeyMap();

    if (options.keyMap && typeof options.keyMap === 'object') {
      for (const [name, code] of Object.entries(options.keyMap)) {
        this.keyMap[normalizeKeyName(name)] = this._normalizeByte(code);
      }
    }

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

  async sendCommand(command, options) {
    return this.sendCommands([command], options);
  }

  async sendCommands(commands, { timeoutMs = 7000 } = {}) {
    const commandList = Array.isArray(commands)
      ? commands.filter(Boolean)
      : [commands];
    if (!commandList.length) {
      throw new Error('Keine CEC-Kommandos übergeben.');
    }

    const available = await this.ensureAvailable();
    if (!available) {
      throw new Error('cec-client nicht gefunden. Bitte cec-utils installieren.');
    }

    return new Promise((resolve, reject) => {
      const child = spawn(this._binaryPath, ['-s', '-d', '1']);
      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`CEC-Kommando Timeout nach ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(stderr.trim() || `CEC-Command failed with code ${code}`));
        } else {
          resolve(stdout.trim());
        }
      });

      for (const cmd of commandList) {
        child.stdin.write(`${cmd}\n`);
      }
      child.stdin.end();
    });
  }

  async turnOn(target = this.targetAddress) {
    return this.sendCommand(`on ${target}`);
  }

  async imageViewOn(target = this.targetAddress) {
    return this._sendTx({
      opcode: OPCODES.IMAGE_VIEW_ON,
      target,
    });
  }

  async textViewOn(target = this.targetAddress) {
    return this._sendTx({
      opcode: OPCODES.TEXT_VIEW_ON,
      target,
    });
  }

  async turnOff(target = this.targetAddress) {
    return this.sendCommand(`standby ${target}`);
  }

  async standby(target = this.targetAddress) {
    return this._sendTx({ opcode: OPCODES.STANDBY, target });
  }

  async getPowerStatus(target = this.targetAddress) {
    try {
      const output = await this.sendCommand(`pow ${target}`);
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

  async requestPowerStatus(target = this.targetAddress) {
    return this._sendTx({
      target,
      opcode: OPCODES.GIVE_DEVICE_POWER_STATUS,
    });
  }

  async setActiveSource(physicalAddress = this.physicalAddress) {
    const params = this._physicalAddressToBytes(physicalAddress);
    return this._sendTx({
      opcode: OPCODES.ACTIVE_SOURCE,
      params,
      target: 0x0f,
    });
  }

  async requestActiveSource() {
    return this._sendTx({
      opcode: OPCODES.REQUEST_ACTIVE_SOURCE,
      target: 0x0f,
    });
  }

  async reportPhysicalAddress(
    physicalAddress = this.physicalAddress,
    deviceType = 0x04
  ) {
    const params = [
      ...this._physicalAddressToBytes(physicalAddress),
      toHexByte(deviceType),
    ];
    return this._sendTx({
      opcode: OPCODES.REPORT_PHYSICAL_ADDRESS,
      params,
      target: 0x0f,
    });
  }

  async requestPhysicalAddress(target = 0x0f) {
    return this._sendTx({
      opcode: OPCODES.GIVE_PHYSICAL_ADDRESS,
      target,
    });
  }

  async setStreamPath(physicalAddress = this.physicalAddress) {
    const params = this._physicalAddressToBytes(physicalAddress);
    return this._sendTx({
      opcode: OPCODES.SET_STREAM_PATH,
      params,
      target: 0x0f,
    });
  }

  async setOsdName(name, target = 0x0f) {
    const params = this._stringToAsciiBytes(name, 13);
    return this._sendTx({
      opcode: OPCODES.SET_OSD_NAME,
      params,
      target,
    });
  }

  async giveOsdName(target = this.targetAddress) {
    return this._sendTx({
      opcode: OPCODES.GIVE_OSD_NAME,
      target,
    });
  }

  async sendKey(key, { target = this.targetAddress, holdMs = 120 } = {}) {
    const code = this._resolveUserControlCode(key);
    const pressFrame = this._buildTxFrame({
      opcode: OPCODES.USER_CONTROL_PRESSED,
      params: [code],
      target,
    });
    const releaseFrame = this._buildTxFrame({
      opcode: OPCODES.USER_CONTROL_RELEASED,
      target,
    });

    const result = await this.sendCommand(pressFrame);
    const waitTime = Math.max(holdMs, 0);
    if (waitTime) {
      await sleep(waitTime);
    }
    await this.sendCommand(releaseFrame);

    return {
      key,
      code: `0x${code.toString(16).padStart(2, '0')}`,
      result,
    };
  }

  async sendKeySequence(
    keys,
    { target = this.targetAddress, delayMs = 250 } = {}
  ) {
    if (!Array.isArray(keys) || !keys.length) {
      throw new Error('keys muss ein nicht-leeres Array sein.');
    }
    const responses = [];
    for (let i = 0; i < keys.length; i += 1) {
      responses.push(await this.sendKey(keys[i], { target }));
      if (i < keys.length - 1 && delayMs > 0) {
        await sleep(delayMs);
      }
    }
    return responses;
  }

  async sendVendorCommand(payload, { target = this.targetAddress } = {}) {
    const params = normalizePayload(payload);
    return this._sendTx({
      opcode: OPCODES.VENDOR_COMMAND,
      params,
      target,
    });
  }

  async sendVendorCommandWithId(
    payload,
    {
      target = this.targetAddress,
      vendorId = SAMSUNG_VENDOR_ID,
    } = {}
  ) {
    const params = [
      ...vendorId.map((byte) => toHexByte(byte)),
      ...normalizePayload(payload),
    ];
    return this._sendTx({
      opcode: OPCODES.VENDOR_COMMAND_WITH_ID,
      params,
      target,
    });
  }

  async sendSamsungKey(key, options = {}) {
    return this.sendKey(key, options);
  }

  async enableSystemAudio(target = 0x05) {
    return this._sendTx({
      target,
      opcode: OPCODES.SET_SYSTEM_AUDIO_MODE,
      params: ['01'],
    });
  }

  async disableSystemAudio(target = 0x05) {
    return this._sendTx({
      target,
      opcode: OPCODES.SET_SYSTEM_AUDIO_MODE,
      params: ['00'],
    });
  }

  async ping(target = this.targetAddress) {
    return this.sendCommand(`ping ${target}`);
  }

  async scanDevices() {
    const available = await this.ensureAvailable();
    if (!available) {
      throw new Error('cec-client nicht gefunden. Bitte cec-utils installieren.');
    }
    const raw = await this.sendCommand('scan');
    const devices = this._parseScanOutput(raw);
    return { devices, raw };
  }

  _resolveUserControlCode(key) {
    if (typeof key === 'number') {
      return this._normalizeByte(key);
    }

    const normalized = normalizeKeyName(key);
    if (!normalized) {
      throw new Error(`Ungültiger Key: ${key}`);
    }

    const mapped = this.keyMap[normalized];
    if (typeof mapped === 'number') {
      return mapped;
    }

    const aliasTarget = NORMALIZED_KEY_ALIASES[normalized];
    if (typeof aliasTarget === 'number') {
      return aliasTarget;
    }
    if (typeof aliasTarget === 'string') {
      const aliasCode = this.keyMap[aliasTarget];
      if (typeof aliasCode === 'number') {
        return aliasCode;
      }
    }

    if (/^0x[0-9a-f]{2}$/i.test(key)) {
      return this._normalizeByte(parseInt(key, 16));
    }

    throw new Error(`Unbekannter User-Control-Key: ${key}`);
  }

  _sendTx({
    opcode,
    params = [],
    target = this.targetAddress,
    source = this.sourceAddress,
  }) {
    const frame = this._buildTxFrame({ opcode, params, target, source });
    return this.sendCommand(frame);
  }

  _buildTxFrame({
    opcode,
    params = [],
    target = this.targetAddress,
    source = this.sourceAddress,
  }) {
    const src = this._normalizeNibble(source);
    const dst = this._normalizeNibble(target);
    const header = `${src.toString(16)}${dst.toString(16)}`.toUpperCase();
    const payloadBytes = [opcode, ...params].map((byte) => toHexByte(byte));
    return `tx ${header}:${payloadBytes.join(':')}`;
  }

  _normalizeNibble(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Math.max(0, Math.min(15, Math.trunc(numeric)));
  }

  _normalizeByte(value) {
    if (typeof value === 'string') {
      return parseInt(toHexByte(value), 16);
    }
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0xff) {
      throw new Error(`Byte ausserhalb des Bereichs: ${value}`);
    }
    return numeric;
  }

  _normalizePhysicalAddress(value) {
    if (Array.isArray(value) && value.length === 2) {
      return `${toHexByte(value[0])}${toHexByte(value[1])}`;
    }

    if (typeof value === 'number') {
      return value.toString(16).padStart(4, '0').substring(0, 4).toUpperCase();
    }

    const str = String(value ?? DEFAULT_PHYSICAL_ADDRESS).trim();
    if (!str) {
      return DEFAULT_PHYSICAL_ADDRESS;
    }

    if (str.includes('.')) {
      const segments = str.split('.').map((segment) => Number.parseInt(segment, 10) || 0);
      return segments
        .slice(0, 4)
        .map((segment) => segment.toString(16))
        .join('')
        .padEnd(4, '0')
        .substring(0, 4)
        .toUpperCase();
    }

    const digits = str.replace(/[^0-9a-f]/gi, '').padEnd(4, '0');
    return digits.substring(0, 4).toUpperCase() || DEFAULT_PHYSICAL_ADDRESS;
  }

  _physicalAddressToBytes(value = this.physicalAddress) {
    const normalized = this._normalizePhysicalAddress(value);
    return [normalized.slice(0, 2), normalized.slice(2, 4)];
  }

  _stringToAsciiBytes(value, maxLength) {
    const safeString = Buffer.from(
      String(value ?? '')
        .normalize('NFKD')
        .replace(/[^\x20-\x7E]/g, '?'),
      'ascii'
    );
    return Array.from(safeString.slice(0, maxLength)).map((byte) =>
      toHexByte(byte)
    );
  }

  _parseScanOutput(output = '') {
    const lines = output.split(/\r?\n/);
    const devices = [];
    let current = null;

    const pushCurrent = () => {
      if (current) {
        devices.push(current);
        current = null;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      const deviceMatch = line.match(/^device\s+#(\d+):\s*(.+)$/i);
      if (deviceMatch) {
        pushCurrent();
        current = {
          logicalAddress: Number.parseInt(deviceMatch[1], 10),
          name: deviceMatch[2],
        };
        continue;
      }
      if (!current) {
        continue;
      }

      const lower = line.toLowerCase();
      if (lower.startsWith('address:')) {
        current.physicalAddress = line.split(':').slice(1).join(':').trim();
        continue;
      }
      if (lower.startsWith('vendor:')) {
        const vendorMatch = line.match(/^vendor:\s*([^(]+?)(?:\s*\((0x[0-9a-f]+)\))?$/i);
        current.vendorName = vendorMatch?.[1]?.trim() || line.split(':').slice(1).join(':').trim();
        current.vendorId = vendorMatch?.[2] || null;
        continue;
      }
      if (lower.startsWith('osd name:')) {
        current.osdName = line.split(':').slice(1).join(':').trim();
        continue;
      }
      if (lower.startsWith('osd string:')) {
        current.osdString = line.split(':').slice(1).join(':').trim();
        continue;
      }
      if (lower.startsWith('device type:')) {
        current.deviceType = line.split(':').slice(1).join(':').trim();
        continue;
      }
      if (lower.startsWith('cec version:')) {
        current.cecVersion = line.split(':').slice(1).join(':').trim();
        continue;
      }
      if (lower.startsWith('power status:')) {
        current.powerStatus = line.split(':').slice(1).join(':').trim();
        continue;
      }
      if (lower.startsWith('language:')) {
        current.language = line.split(':').slice(1).join(':').trim();
      }
    }

    pushCurrent();
    return devices;
  }
}

module.exports = CecController;
