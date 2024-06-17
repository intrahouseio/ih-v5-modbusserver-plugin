const util = require('util');
const Modbus = require('modbus-serial');

module.exports = function (plugin) {
  const params = plugin.params;
  let extraChannels = plugin.extraChannels;
  const coilBuffer = Buffer.alloc(8192, 0);
  const discreteBuffer = Buffer.alloc(8192, 0);
  const inputBuffer = Buffer.alloc(131072, 0);
  const holdingBuffer = Buffer.alloc(131072, 0);
  const bufferFactor = 2;
  let filter = filterExtraChannels(extraChannels);
  subExtraChannels(filter);

  function subExtraChannels(filter) {
    plugin.onSub('devices', filter, data => {
      data.forEach(item => {
        let curitem = item.did + '.' + item.prop;
        if (item.value != undefined) {
          if (filter[curitem].fcr == '1') {
            setBit(coilBuffer, filter[curitem].address, item.value);
          }
          if (filter[curitem].fcr == '2') {
            setBit(discreteBuffer, filter[curitem].address, item.value);
          }
          if (filter[curitem].fcr == '3') {
            if (filter[curitem].vartype == 'int8' || filter[curitem].vartype == 'uint8') {
              writeBuffer(holdingBuffer, filter[curitem].address, filter[curitem].vartype, item.value, params.bo8);
            }
            if (filter[curitem].vartype == 'int16' || filter[curitem].vartype == 'uint16') {
              writeBuffer(holdingBuffer, filter[curitem].address, filter[curitem].vartype, item.value, params.bo16);
            }
            if (filter[curitem].vartype == 'float' || filter[curitem].vartype == 'int32' || filter[curitem].vartype == 'uint32') {
              writeBuffer(holdingBuffer, filter[curitem].address, filter[curitem].vartype, item.value, params.bo32);
            }
            if (filter[curitem].vartype == 'double' || filter[curitem].vartype == 'int64' || filter[curitem].vartype == 'uint64') {
              writeBuffer(holdingBuffer, filter[curitem].address, filter[curitem].vartype, item.value, params.bo64);
            }
          }

          if (filter[curitem].fcr == '4') {
            if (filter[curitem].vartype == 'int8' || filter[curitem].vartype == 'uint8') {
              writeBuffer(inputBuffer, filter[curitem].address, filter[curitem].vartype, item.value, params.bo8);
            }
            if (filter[curitem].vartype == 'int16' || filter[curitem].vartype == 'uint16') {
              writeBuffer(inputBuffer, filter[curitem].address, filter[curitem].vartype, item.value, params.bo16);
            }
            if (filter[curitem].vartype == 'float' || filter[curitem].vartype == 'int32' || filter[curitem].vartype == 'uint32') {
              writeBuffer(inputBuffer, filter[curitem].address, filter[curitem].vartype, item.value, params.bo32);
            }
            if (filter[curitem].vartype == 'double' || filter[curitem].vartype == 'int64' || filter[curitem].vartype == 'uint64') {
              writeBuffer(inputBuffer, filter[curitem].address, filter[curitem].vartype, item.value, params.bo64);
            }
          }
        }
      });
      plugin.log("data" + util.inspect(data), 2);
    })
  }

  plugin.onChange('extra', async (recs) => {
    plugin.log('onChange addExtra ' + util.inspect(recs), 2);
    extraChannels = await plugin.extra.get();
    filter = filterExtraChannels(extraChannels)
    subExtraChannels(filter);
  });

  const vector = {
    getCoil: function (addr, unitId) {
      if (params.unitID == unitId) {
        return getBit(coilBuffer, addr);
      }
    },

    getDiscreteInput: function (addr, unitId) {
      if (params.unitID == unitId) {
        return getBit(discreteBuffer, addr);
      }
    },

    getInputRegister: function (addr, unitId) {
      if (params.unitID == unitId) {
        return inputBuffer.readUInt16BE(addr * bufferFactor);
      }
    },

    getMultipleInputRegister: function (addr, length, unitId) {
      if (params.unitID == unitId) {
        let arr = [];
        for (i = addr; i < addr + length; i++) {
          arr.push(inputBuffer.readUInt16BE(i * bufferFactor));
        }
        return arr
      }
    },

    getHoldingRegister: function (addr, unitId) {
      if (params.unitID == unitId) {
        return holdingBuffer.readUInt16BE(addr * bufferFactor);
      }
    },

    getMultipleHoldingRegisters: function (addr, length, unitId) {
      if (params.unitID == unitId) {
        let arr = [];
        for (i = addr; i < addr + length; i++) {
          arr.push(holdingBuffer.readUInt16BE(i * bufferFactor))
        }
        return arr
      }
    },

    setCoil: function (address, value, unitId) {
      if (params.unitID == unitId) {
        const addr = '1.' + address;
        plugin.log('SetCoil' + filter[addr].did + ' value: ' + value + ' unitId: ' + unitId, 2);
        setBit(coilBuffer, address, value);
        if (filter[addr] != undefined) {
          plugin.send({ type: 'command', command: 'setval', did: filter[addr].did, prop: filter[addr].prop, value: value == true ? 1 : 0 });
        }
      }
    },

    setRegister: function (address, value, unitId) {
      plugin.log('SetRegister ' + address + ' value: ' + value + ' unitId: ' + unitId, 2);
      if (params.unitID == unitId) {
        const addr = '3.' + address;
        holdingBuffer.writeUInt16BE(value, address * bufferFactor);
        if (filter[addr] != undefined && (filter[addr].vartype == 'int8' || filter[addr].vartype == 'uint8')) {
          plugin.send({ type: 'command', command: 'setval', did: filter[addr].did, prop: filter[addr].prop, value: readBuffer(holdingBuffer, filter[addr].address, filter[addr].vartype, params.bo8) });
        }
        if (filter[addr] != undefined && (filter[addr].vartype == 'int16' || filter[addr].vartype == 'uint16')) {
          plugin.send({ type: 'command', command: 'setval', did: filter[addr].did, prop: filter[addr].prop, value: readBuffer(holdingBuffer, filter[addr].address, filter[addr].vartype, params.bo16) });
        }
      }
    },

    setRegisterArray: function (address, value, unitId) {
      plugin.log('SetMultipleRegisters ' + address + ' value: ' + value + ' unitId: ' + unitId, 2);
      if (params.unitID == unitId) {
        for (let i = 0; i < value.length; i++) {
          holdingBuffer.writeUInt16BE(value[i], (address + i) * bufferFactor);
        }
        for (let i = 0; i < value.length; i++) {
          let curaddr = address + i;
          let addr = '3.' + curaddr;
          if (filter[addr] != undefined && (filter[addr].vartype == 'int8' || filter[addr].vartype == 'uint8')) {
            plugin.send({ type: 'command', command: 'setval', did: filter[addr].did, prop: filter[addr].prop, value: readBuffer(holdingBuffer, filter[addr].address, filter[addr].vartype, params.bo8) });
          }
          if (filter[addr] != undefined && (filter[addr].vartype == 'int16' || filter[addr].vartype == 'uint16')) {
            plugin.send({ type: 'command', command: 'setval', did: filter[addr].did, prop: filter[addr].prop, value: readBuffer(holdingBuffer, filter[addr].address, filter[addr].vartype, params.bo16) });
          }
          if (filter[addr] != undefined && (filter[addr].vartype == 'float' || filter[addr].vartype == 'int32' || filter[addr].vartype == 'uint32')) {
            plugin.send({ type: 'command', command: 'setval', did: filter[addr].did, prop: filter[addr].prop, value: readBuffer(holdingBuffer, filter[addr].address, filter[addr].vartype, params.bo32) });
          }
          if (filter[addr] != undefined && (filter[addr].vartype == 'double' || filter[addr].vartype == 'int64' || filter[addr].vartype == 'uint64')) {
            plugin.send({ type: 'command', command: 'setval', did: filter[addr].did, prop: filter[addr].prop, value: readBuffer(holdingBuffer, filter[addr].address, filter[addr].vartype, params.bo64) });
          }
        }
      }
    }


  };

  // set the server to answer for modbus requests
  if (params.transport == 'tcp' || params.transport == undefined) {
    plugin.log(`ModbusTCP unitID ${params.unitID} listening on '0.0.0.0':${params.port}`);
    const serverTCP = new Modbus.ServerTCP(vector, { host: '0.0.0.0', port: parseInt(params.port), debug: true, unitID: parseInt(params.unitID) });

    serverTCP.on("socketError", function (err) {
      plugin.log("socketError " + err, 1);
    });
  }
  if (params.transport == 'rtu') {
    const serverSerial = new Modbus.ServerSerial(
      vector,
      {
        port: params.serialport,
        baudRate: params.baudRate,
        parity: params.parity,
        dataBits: params.dataBits,
        stopBits: params.stopBits,
        debug: true,
        unitID: parseInt(params.unitID),
      }
    );
    plugin.log("ServerRTU")
    serverSerial.on("socketError", function (err) {
      plugin.log("socketError " + err, 1);
    });
    serverSerial.on("initialized", function () {
      plugin.log("initialized");
    });

    serverSerial.on("socketError", function (err) {
      plugin.log(err);
      serverSerial.close(closed);
    });
  }


  process.on('exit', terminate);
  process.on('SIGTERM', () => {
    terminate();
    process.exit(0);
  });

  function terminate() {
    console.log('TERMINATE PLUGIN');
    // Здесь закрыть все что нужно
  }

  function filterExtraChannels(channels) {
    let res = { did_prop: [] };
    channels.forEach(item => {
      res.did_prop.push(item.did + "." + item.prop);
      res[item.did + '.' + item.prop] = item;
      res[item.fcr + '.' + item.address] = item;
    })
    return res
  }

  function getBit(buffer, offset) {
    // Приходит упакованное побайтно
    const i = Math.floor(offset / 8);
    const j = offset % 8;

    return buffer[i] & (1 << j) ? 1 : 0;
  }

  function setBit(buffer, offset, value) {
    const i = Math.floor(offset / 8);
    const bit = offset % 8;
    if (value == 0) {
      buffer[i] &= ~(1 << bit);
    } else {
      buffer[i] |= (1 << bit);
    }
  }
  function readBuffer(buffer, address, vartype, byteorder) {
    let buf;
    let i1;
    let i2;
    let offset = address;
    vartype = vartype + byteorder;

    switch (vartype) {
      case 'bool':
        return getBitValue(buffer, offset);
      case 'uint8be':
        return buffer.readUInt8(offset * 2 + 1);
      case 'uint8le':
        return buffer.readUInt8(offset * 2);
      case 'int8be':
        return buffer.readInt8(offset * 2 + 1);
      case 'int8le':
        return buffer.readInt8(offset * 2);
      case 'uint16be':
        return buffer.readUInt16BE(offset * 2);
      case 'uint16le':
        return buffer.readUInt16LE(offset * 2);
      case 'int16be':
        return buffer.readInt16BE(offset * 2);
      case 'int16le':
        return buffer.readInt16LE(offset * 2);
      case 'uint32be':
        return buffer.readUInt32BE(offset * 2);
      case 'uint32le':
        return buffer.readUInt32LE(offset * 2);
      case 'uint32sw':
        // buf = new Buffer(4);
        buf = Buffer.alloc(4);
        buf[0] = buffer[offset * 2 + 2];
        buf[1] = buffer[offset * 2 + 3];
        buf[2] = buffer[offset * 2 + 0];
        buf[3] = buffer[offset * 2 + 1];
        return buf.readUInt32BE(0);
      case 'uint32sb':
        buf = Buffer.alloc(4);
        buf[0] = buffer[offset * 2 + 1];
        buf[1] = buffer[offset * 2 + 0];
        buf[2] = buffer[offset * 2 + 3];
        buf[3] = buffer[offset * 2 + 2];
        return buf.readUInt32BE(0);
      case 'int32be':
        return buffer.readInt32BE(offset * 2);
      case 'int32le':
        return buffer.readInt32LE(offset * 2);
      case 'int32sw':
        buf = Buffer.alloc(4);
        buf[0] = buffer[offset * 2 + 2];
        buf[1] = buffer[offset * 2 + 3];
        buf[2] = buffer[offset * 2 + 0];
        buf[3] = buffer[offset * 2 + 1];
        return buf.readInt32BE(0);
      case 'int32sb':
        buf = Buffer.alloc(4);
        buf[0] = buffer[offset * 2 + 1];
        buf[1] = buffer[offset * 2 + 0];
        buf[2] = buffer[offset * 2 + 3];
        buf[3] = buffer[offset * 2 + 2];
        return buf.readInt32BE(0);
      case 'uint64be':
        return Number(buffer.readBigUInt64BE(offset * 2));
      case 'uint64le':
        return Number(buffer.readBigUInt64LE(offset * 2));
      case 'int64be':
        return Number(buffer.readBigInt64BE(offset * 2));
      case 'int64le':
        return Number(buffer.readBigInt64LE(offset * 2));
      case 'floatbe':
        return buffer.readFloatBE(offset * 2);
      case 'floatle':
        return buffer.readFloatLE(offset * 2);
      case 'floatsw':
        buf = Buffer.alloc(4);
        buf[0] = buffer[offset * 2 + 2];
        buf[1] = buffer[offset * 2 + 3];
        buf[2] = buffer[offset * 2 + 0];
        buf[3] = buffer[offset * 2 + 1];
        return buf.readFloatBE(0);
      case 'floatsb':
        buf = Buffer.alloc(4);
        buf[0] = buffer[offset * 2 + 1];
        buf[1] = buffer[offset * 2 + 0];
        buf[2] = buffer[offset * 2 + 3];
        buf[3] = buffer[offset * 2 + 2];
        return buf.readFloatBE(0);
      case 'doublebe':
        return buffer.readDoubleBE(offset * 2);
      case 'doublele':
        return buffer.readDoubleLE(offset * 2);
      default:
        throw new Error(`Invalid type: ${vartype}`);
    }
  }

  function writeBuffer(buf, address, vartype, value, byteorder) {
    let a0;
    let a1;
    let a2;
    let buffer;
    vartype = vartype + byteorder;

    switch (vartype) {
      case 'uint8be':
        buffer = Buffer.alloc(2);
        buffer[0] = 0;
        buffer.writeUInt8(value & 0xff, 1);
        break;
      case 'uint8le':
        buffer = Buffer.alloc(2);
        buffer[1] = 0;
        buffer.writeUInt8(value & 0xff, 0);
        break;
      case 'int8be':
        buffer = Buffer.alloc(2);
        buffer[0] = 0;
        buffer.writeInt8(value & 0xff, 1);
        break;
      case 'int8le':
        buffer = Buffer.alloc(2);
        buffer[1] = 0;
        buffer.writeInt8(value & 0xff, 0);
        break;
      case 'uint16be':
        buffer = Buffer.alloc(2);
        if (value > 65565) {
          console.log('TOO BIG NUMBER! ' + value);
        }
        buffer.writeUInt16BE(value, 0);
        break;
      case 'uint16le':
        buffer = Buffer.alloc(2);
        buffer.writeUInt16LE(value, 0);
        break;
      case 'int16be':
        // buffer = new Buffer(2);
        buffer = Buffer.alloc(2);
        buffer.writeInt16BE(value, 0);
        break;
      case 'int16le':
        buffer = Buffer.alloc(2);
        buffer.writeInt16LE(value, 0);
        break;
      case 'uint32be':
        buffer = Buffer.alloc(4);
        buffer.writeUInt32BE(value, 0);
        break;
      case 'uint32le':
        buffer = Buffer.alloc(4);
        buffer.writeUInt32LE(value, 0);
        break;
      case 'uint32sw':
        buffer = Buffer.alloc(4);
        buffer.writeUInt32BE(value, 0);
        a0 = buffer[0];
        a1 = buffer[1];
        buffer[0] = buffer[2];
        buffer[1] = buffer[3];
        buffer[2] = a0;
        buffer[3] = a1;
        break;
      case 'uint32sb':
        buffer = Buffer.alloc(4);
        buffer.writeUInt32BE(value, 0);
        a0 = buffer[0];
        a2 = buffer[2];
        buffer[0] = buffer[1];
        buffer[2] = buffer[3];
        buffer[1] = a0;
        buffer[3] = a2;
        break;
      case 'int32be':
        buffer = Buffer.alloc(4);
        buffer.writeInt32BE(value, 0);
        break;
      case 'int32le':
        buffer = Buffer.alloc(4);
        buffer.writeInt32LE(value, 0);
        break;
      case 'int32sw':
        buffer = Buffer.alloc(4);
        buffer.writeInt32BE(value, 0);
        a0 = buffer[0];
        a1 = buffer[1];
        buffer[0] = buffer[2];
        buffer[1] = buffer[3];
        buffer[2] = a0;
        buffer[3] = a1;
        break;
      case 'int32sb':
        buffer = Buffer.alloc(4);
        buffer.writeInt32BE(value, 0);
        a0 = buffer[0];
        a2 = buffer[2];
        buffer[0] = buffer[1];
        buffer[2] = buffer[3];
        buffer[1] = a0;
        buffer[3] = a2;
        break;
      case 'uint64be':
        buffer = Buffer.alloc(8);
        buffer.writeBigUInt64BE(BigInt(value), 0);
        break;
      case 'uint64le':
        buffer = Buffer.alloc(8);
        buffer.writeBigUInt64LE(BigInt(value), 0);
        break;
      case 'int64be':
        buffer = Buffer.alloc(8);
        buffer.writeBigInt64BE(BigInt(value), 0);
        break;
      case 'int64le':
        buffer = Buffer.alloc(8);
        buffer.writeBigInt64LE(BigInt(value), 0);
        break;
      case 'floatbe':
        buffer = Buffer.alloc(4);
        buffer.writeFloatBE(value, 0);
        break;
      case 'floatle':
        buffer = Buffer.alloc(4);
        buffer.writeFloatLE(value, 0);
        break;
      case 'floatsw':
        buffer = Buffer.alloc(4);
        buffer.writeFloatBE(value, 0);
        a0 = buffer[0];
        a1 = buffer[1];
        buffer[0] = buffer[2];
        buffer[1] = buffer[3];
        buffer[2] = a0;
        buffer[3] = a1;
        break;
      case 'floatsb':
        buffer = Buffer.alloc(4);
        buffer.writeFloatBE(value, 0);
        a0 = buffer[0];
        a2 = buffer[2];
        buffer[0] = buffer[1];
        buffer[2] = buffer[3];
        buffer[1] = a0;
        buffer[3] = a2;
        break;
      case 'doublebe':
        buffer = Buffer.alloc(8);
        buffer.writeDoubleBE(value, 0);
        break;
      case 'doublele':
        buffer = Buffer.alloc(8);
        buffer.writeDoubleLE(value, 0);
        break;
      default:
        console.log(`Invalid type: ${vartype}  THROW`);
        throw new Error(`Invalid type: ${vartype}`);
    }
    buffer.copy(buf, address * 2, 0, buffer.length);
  }
};
