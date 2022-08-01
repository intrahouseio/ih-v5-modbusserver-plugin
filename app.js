const util = require('util');
const Modbus = require('modbus-serial');

module.exports = function(plugin)  {
  const params = plugin.params;
  let extraChannels = plugin.extraChannels;
  const coilBuffer = Buffer.alloc(8192, 0);
  const discreteBuffer = Buffer.alloc(8192, 0);
  const inputBuffer = Buffer.alloc(131072, 0);
  const holdingBuffer = Buffer.alloc(131072, 0);
  const bufferFactor = 2;
  let setCnt = 0;
  let varLength = 0;
  let setBuf = Buffer.alloc(8,0);
  let did, prop, vartype;
  let filter = filterExtraChannels(extraChannels)
  subExtraChannels(filter);

  function subExtraChannels(filter) {
    plugin.onSub('devices', filter, data => {
      data.forEach(item => {
        if (filter[item.did].fcr == '1') {
          setBit(coilBuffer, filter[item.did].address, item.value);
        }
        if (filter[item.did].fcr == '2') {
          setBit(discreteBuffer, filter[item.did].address, item.value);
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
  }
  
  plugin.onChange('extra', async (recs) => {
    plugin.log('onChange addExtra '+util.inspect(recs), 2);
    extraChannels = await plugin.extra.get();
    filter = filterExtraChannels(extraChannels)
    subExtraChannels(filter);
  });

  const vector = {
    getCoil: function(addr, unitId) { 
      if (params.unitID == unitId) { 
        return getBit(coilBuffer, addr);
      } 
    },

    getDiscreteInput: function(addr, unitId) { 
      if (params.unitID == unitId ) { 
        return getBit(discreteBuffer, addr); 
      } 
    },
    
    getInputRegister: function(addr, unitId) { 
      if (params.unitID == unitId ) { 
        return inputBuffer.readUInt16BE(addr * bufferFactor); 
      } 
    },

    getMultipleInputRegister: function(addr, unitId) {   
      if (params.unitID == unitId ) { 
        let arr = [];
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
      if (params.unitID == unitId ) {
        let arr = [];
        for (i=addr; i<addr+length; i++) {
          arr.push(holdingBuffer.readUInt16BE(i * bufferFactor))
        }
        return arr 
      }  
    },

    setCoil: function(address, value, unitId) { 
      const addr = '1.' + address;
      plugin.log('SetCoil' + addr + ' value: '+ value + ' unitId: ' + unitId, 2);  
      if (params.unitID == unitId ) { 
        setBit(coilBuffer, address, value);
        if (filter[addr] != undefined) {
          plugin.log('SetCoil' + filter[addr].did + ' value: '+ value + ' unitId: ' + unitId, 2); 
          plugin.send({ type: 'command', command: 'setval', did: filter[addr].did, prop: filter[addr].prop, value: value == true ? 1 : 0 });
        }  
      } 
    },

    setRegister: function(address, value, unitId) { 
      const addr = '3.' + address;
      plugin.log('SetRegister ' + addr + ' value: '+ value + ' unitId: ' + unitId, 2);  
      if (params.unitID == unitId ) { 
        if (filter[addr] != undefined && (filter[addr].vartype == 'bool' || filter[addr].vartype == 'int16' || filter[addr].vartype == 'uint16' || filter[addr].vartype == 'int8' || filter[addr].vartype == 'uint8')) {
          varLength = 1;
          setCnt = 0;
          vartype = filter[addr].vartype;
          did = filter[addr].did;
          prop = filter[addr].prop;
        }
        if (filter[addr] != undefined && (filter[addr].vartype == 'float' || filter[addr].vartype == 'int32' || filter[addr].vartype == 'uint32')) {
          varLength = 2;
          setCnt = 0;
          vartype = filter[addr].vartype;
          did = filter[addr].did;
          prop = filter[addr].prop;
        }
        if (filter[addr] != undefined && (filter[addr].vartype == 'double' || filter[addr].vartype == 'int64' || filter[addr].vartype == 'uint64')) {
          varLength = 4;
          setCnt = 0;
          vartype = filter[addr].vartype;
          did = filter[addr].did;
          prop = filter[addr].prop;
        }
        
        if (varLength == 2) {
          setBuf.writeUInt16BE(value,setCnt * 2);
          setCnt++;
          if (setCnt == 2) {
            if (vartype == 'float') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readFloatBE(0) });
            if (vartype == 'int32') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readInt32BE(0) });
            if (vartype == 'uint32') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readUint32BE(0) });
            varLength = 0;
          }
        }
        
        if (varLength == 4) {
          setBuf.writeUInt16BE(value,setCnt * 2);   
          setCnt++;
          if (setCnt == 4) {
            if (vartype == 'double') plugin.send({ type: 'command', command: 'setval', did, prop, value: Number(setBuf.readDoubleBE(0)) });
            if (vartype == 'int64') plugin.send({ type: 'command', command: 'setval', did, prop, value: Number(setBuf.readBigInt64BE(0)) });
            if (vartype == 'uint64') plugin.send({ type: 'command', command: 'setval', did, prop, value: Number(setBuf.readBigUInt64BE(0)) });
            varLength = 0;
          }

        }

        if (varLength == 1) {
          setBuf.writeUInt16BE(value, 0);
          if (vartype == 'int8') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readInt8(1) });
          if (vartype == 'uint8') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readUint8(1) });
          if (vartype == 'int16') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readInt16BE(0) });
          if (vartype == 'uint16') plugin.send({ type: 'command', command: 'setval', did, prop, value: setBuf.readUint16BE(0) }); 
          varLength = 0;
        }    
        holdingBuffer.writeUInt16BE(value, address * bufferFactor);     
      } 
      
    }
  };

  // set the server to answer for modbus requests
  plugin.log(`ModbusTCP unitID ${params.unitID} listening on '0.0.0.0':${params.port}`);
  const serverTCP = new Modbus.ServerTCP(vector, { host: '0.0.0.0', port: parseInt(params.port), debug: true, unitID: parseInt(params.unitID) });

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
    res[item.fcr+'.'+item.address] = item;
  })
  return res
  }

  function getBit(buffer, offset) {
    // Приходит упакованное побайтно
    const i = Math.floor(offset / 8);
    const j = offset % 8;
  
    return buffer[i] & (1 << j) ? 1 : 0;
  }

  function setBit(buffer, offset, value){
    const i = Math.floor(offset / 8);
    const bit = offset % 8;
    if(value == 0){
      buffer[i] &= ~(1 << bit);
    }else{
      buffer[i] |= (1 << bit);
    }
  }
  function writeBuffer(buf, address, vartype, value, params) {
    let buffer;
  
    switch (vartype) {
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
        buffer.writeBigUInt64BE(BigInt(value), 0);
        break;
      case 'int64':
        buffer = Buffer.alloc(8);
        buffer.writeBigInt64BE(BigInt(value), 0);
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
