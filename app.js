const util = require('util');
const Modbus = require('modbus-serial');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = function(plugin)  {
  const params = plugin.params;
  let extraChannels = plugin.extraChannels;
  const coilBuffer = Buffer.alloc(131070, 0);
  const discreteBuffer = Buffer.alloc(131070, 0);
  const inputBuffer = Buffer.alloc(131070, 0);
  const holdingBuffer = Buffer.alloc(1000, 0);
  const bufferFactor = 2;
  let setCnt = 0;
  let varLength = 1;
  let setBuf = Buffer.alloc(8,0);
  let did, prop, vartype, address;
  const filter = filterExtraChannels(extraChannels);
  plugin.log('ExtraChannels' + util.inspect(filter));
  plugin.onSub('devices', filter, data => {
    data.forEach(item => {
      if (filter[item.did].fcr == '1') {
        writeBuffer(coilBuffer, filter[item.did].address, filter[item.did].vartype, item.value, params);
      }
      if (filter[item.did].fcr == '2') {
        writeBuffer(discreteBuffer, filter[item.did].address, filter[item.did].vartype, item.value, params);
      }
      if (filter[item.did].fcr == '3') {
        writeBuffer(holdingBuffer, filter[item.did].address, filter[item.did].vartype, item.value, params);
        //plugin.log("buf" + holdingBuffer.toString('hex'));
      }
      if (filter[item.did].fcr == '4') {
        writeBuffer(inputBuffer, filter[item.did].address, filter[item.did].vartype, item.value, params);
      }
    });
    plugin.log("data" + util.inspect(data));
  })

  const vector = {
    getCoil: function(addr, unitId) { 
      if (params.unitID == unitId) { 
        return coilBuffer.readUInt8(addr * bufferFactor); 
      } 
    },

    getDiscreteInput: function(addr, unitId) { 
      if (params.unitID == unitId ) { 
        return discreteBuffer.readUInt8(addr * bufferFactor); 
      } 
    },
    
    getInputRegister: function(addr, unitId) { 
      if (params.unitID == unitId ) { 
        return inputBuffer.readUInt16BE(addr * bufferFactor); 
      } 
    },
    getMultipleInputRegister: function(addr, unitId) { 
      let arr = [];
      if (params.unitID == unitId ) { 
        for (i=addr; i<addr+length; i++) {
          arr.push(inputBuffer.readUInt16BE(i * bufferFactor));
        }
        return arr 
      }
     },
    getHoldingRegister: function(addr, unitId) { 
      if (params.unitID == unitId ) { 
        return holdingBuffer.readUInt16BE(addr * bufferFactor); 
      } 
    },
    getMultipleHoldingRegisters: function(addr, length,  unitId) {
      let arr = [];
      if (params.unitID == unitId ) { 
        for (i=addr; i<addr+length; i++) {
          arr.push(holdingBuffer.readUInt16BE(i * bufferFactor))
        }
        return arr 
      }
      
    },

    setCoil: function(addr, value, unitId) { 
      if (params.unitID == unitId ) { 
        coilBuffer.writeUInt8(value, addr * bufferFactor); 
      } 
    },

    setRegister: function(addr, value, unitId) { 
      
   
      if (params.unitID == unitId ) { 
        plugin.log('SetRegister ' + util.inspect(filter[addr]));
        if (filter[addr] != undefined && (filter[addr].vartype == 'bool' || filter[addr].vartype == 'int16' || filter[addr].vartype == 'uint16' || filter[addr].vartype == 'int8' || filter[addr].vartype == 'uint8')) {
          varLength = 1;
          setCnt = 0;
          vartype = filter[addr].vartype;
          did = filter[addr].did;
          prop = filter[addr].prop;
          address = addr;
        }
        if (filter[addr] != undefined && (filter[addr].vartype == 'float' || filter[addr].vartype == 'int32' || filter[addr].vartype == 'uint32')) {
          varLength = 2;
          setCnt = 0;
          vartype = filter[addr].vartype;
          did = filter[addr].did;
          prop = filter[addr].prop;
          address = addr;
        }
        if (filter[addr] != undefined && (filter[addr].vartype == 'double' || filter[addr].vartype == 'int64' || filter[addr].vartype == 'uint64')) {
          varLength = 4;
          setCnt = 0;
          vartype = filter[addr].vartype;
          did = filter[addr].did;
          prop = filter[addr].prop;
          address = addr;
        }
        
        if (varLength == 2) {
          setBuf.writeUInt16BE(value,setCnt * 2);
          setCnt++;
          if (setCnt == 2) {
            if (vartype == 'float') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readFloatBE(0) });
            if (vartype == 'int32') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readInt32BE(0) });
            if (vartype == 'uint32') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readUint32BE(0) });
            setBuf.copy(holdingBuffer, address * 2, 0, 4);
          }
        }
        
        if (varLength == 4) {
          plugin.log("addr" + addr * bufferFactor + ' ' + value + ' ' + unitId);
          setBuf.writeUInt16BE(value,setCnt * 2);  
          plugin.log("buf" + setBuf.toString('hex'));
          setCnt++;
          if (setCnt == 4) {
            if (vartype == 'double') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readDoubleBE(0) });
            if (vartype == 'int64') {
              let value;
              const i1 = setBuf.readInt32BE(0);
              const i2 = setBuf.readUInt32BE(4);
              if (i1 >= 0)  value = i1 * 0x100000000 + i2; else value = i1 * 0x100000000 - i2;
              plugin.send({ type: 'command', command: 'setval', did, prop, value: value});
            }
            if (vartype == 'uint64') {
              plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readUInt32BE(0) * 0x100000000 + setBuf.readUInt32BE(4) });
            }
            setBuf.copy(holdingBuffer, address * 2, 0, 8);
          }

        }

        if (varLength == 1) {
          if (vartype == 'bool') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readUint8(0) });
          if (vartype == 'int8') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readInt8(0) });
          if (vartype == 'uint8') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readUint8(0) });
          if (vartype == 'int16') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readInt16BE(0) });
          if (vartype == 'uint16') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readUint16BE(0) }); 
          holdingBuffer.writeUInt16BE(value, addr * bufferFactor); 
        }

        
        
      } 
      
    }
  };

  // set the server to answer for modbus requests
  plugin.log(`ModbusTCP unitID ${params.unitID} listening on ${params.host}:${params.port}`);
  const serverTCP = new Modbus.ServerTCP(vector, { host: params.host, port: parseInt(params.port), debug: true, unitID: parseInt(params.unitID) });

  serverTCP.on("socketError", function(err) {
      plugin.log("socketError " +err);
      serverTCP.close(closed);
  });

  function closed() {
      plugin.log("server closed");
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
  let res = {did_prop: []};
  channels.forEach(item => {
    res.did_prop.push(item.did+"."+item.prop);
    res[item.did] = item;
    res[item.address] = item;
  })
  return res
  }
  
  function writeBuffer(buf, address, vartype, value, params) {
    let a0;
    let a1;
    let a2;
    let buffer;
  
    switch (vartype) {
      case 'bool':
        buffer = Buffer.alloc(2);
        buffer[0] = 0;
        buffer.writeUInt8(value & 0xff, 1);
        break;
      case 'uint8':
        buffer = Buffer.alloc(2);
        buffer[0] = 0;
        buffer.writeUInt8(value & 0xff, 1);
        break;
      case 'int8':
        buffer = Buffer.alloc(2);
        buffer[0] = 0;
        buffer.writeInt8(value & 0xff, 1);
        break;
      case 'uint16':
        buffer = Buffer.alloc(2);
        if (value > 65565) {
          plugin.log('TOO BIG NUMBER! ' + value);
        }
        buffer.writeUInt16BE(value, 0);
        break;
      case 'int16':
        buffer = Buffer.alloc(2);
        buffer.writeInt16BE(value, 0);
        break;
      case 'uint32':
        buffer = Buffer.alloc(4);
        buffer.writeUInt32BE(value, 0);
        break;
      case 'int32':
        buffer = Buffer.alloc(4);
        buffer.writeInt32BE(value, 0);
        break;
      case 'uint64':
        buffer = Buffer.alloc(8);
        buffer.writeUInt32BE(value >> 32, 0);
        buffer.writeUInt32BE(value & 0xffffffff, 4);
        break;
      case 'int64':
        buffer = Buffer.alloc(8);
        buffer.writeInt32BE(value >> 32, 0);
        buffer.writeUInt32BE(value & 0xffffffff, 4);
        break;
      case 'float':
        buffer = Buffer.alloc(4);
        buffer.writeFloatBE(value, 0);
        break;
      case 'double':
        buffer = Buffer.alloc(8);
        buffer.writeDoubleBE(value, 0);
        break;
      default:
        console.log(`Invalid type: ${vartype}  THROW`);
        throw new Error(`Invalid type: ${vartype}`);
    }
    buffer.copy(buf, address*2, 0, buffer.length);
  }
};
