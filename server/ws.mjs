// 최소 WebSocket(RFC 6455) — Node 내장 http·crypto만 쓴다(새 npm 패키지 없음, 2026-11-08 기획서).
// 다루는 것: 핸드셰이크(Sec-WebSocket-Accept), 텍스트 프레임, 클라이언트 마스킹 해제, 길이 7비트·16비트(126)·64비트(127), ping/pong, close.
// 다루지 않는 것: 바이너리 프레임·조각난 메시지(FIN=0)·확장(permessage-deflate) → close 1003. 함께 걷기 메시지는 모두 짧은 JSON 텍스트다.
import {createHash} from 'node:crypto';

const GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const OP=Object.freeze({cont:0x0,text:0x1,binary:0x2,close:0x8,ping:0x9,pong:0xa});
export const acceptKey=key=>createHash('sha1').update(key+GUID).digest('base64');

// 핸드셰이크 응답. 올바르지 않으면 null(호출한 쪽이 400을 보낸다).
export function handshakeResponse(headers){
 const key=headers['sec-websocket-key'];
 if(String(headers.upgrade||'').toLowerCase()!=='websocket'||!key||headers['sec-websocket-version']!=='13')return null;
 return ['HTTP/1.1 101 Switching Protocols','Upgrade: websocket','Connection: Upgrade',`Sec-WebSocket-Accept: ${acceptKey(key)}`,'',''].join('\r\n');
}

// 서버 → 클라이언트 프레임(마스킹 없음). payload는 Buffer 또는 문자열.
export function encodeFrame(opcode,payload=Buffer.alloc(0)){
 const data=Buffer.isBuffer(payload)?payload:Buffer.from(String(payload),'utf8'),n=data.length;
 let head;
 if(n<126){head=Buffer.alloc(2);head[1]=n;}
 else if(n<65536){head=Buffer.alloc(4);head[1]=126;head.writeUInt16BE(n,2);}
 else{head=Buffer.alloc(10);head[1]=127;head.writeBigUInt64BE(BigInt(n),2);}
 head[0]=0x80|opcode;
 return Buffer.concat([head,data]);
}
// 시험용: 클라이언트처럼 마스킹한 프레임
export function encodeMaskedFrame(opcode,payload,mask=Buffer.from([1,2,3,4]),fin=true){
 const data=Buffer.isBuffer(payload)?payload:Buffer.from(String(payload),'utf8'),n=data.length;
 let head;
 if(n<126){head=Buffer.alloc(2);head[1]=0x80|n;}
 else if(n<65536){head=Buffer.alloc(4);head[1]=0x80|126;head.writeUInt16BE(n,2);}
 else{head=Buffer.alloc(10);head[1]=0x80|127;head.writeBigUInt64BE(BigInt(n),2);}
 head[0]=(fin?0x80:0)|opcode;
 const body=Buffer.from(data);for(let i=0;i<n;i++)body[i]^=mask[i&3];
 return Buffer.concat([head,mask,body]);
}

// 받은 바이트를 쌓아 두고 완성된 프레임만 꺼낸다. 결과: {frames:[{fin,opcode,payload}], error:null|{code,reason}}
// maxPayload를 넘거나 마스킹이 없으면(클라이언트는 반드시 마스킹해야 함) 오류.
export function createFrameReader({maxPayload=8192,requireMask=true}={}){
 let buf=Buffer.alloc(0);
 return function push(chunk){
  buf=buf.length?Buffer.concat([buf,chunk]):chunk;
  const frames=[];
  for(;;){
   if(buf.length<2)break;
   const b0=buf[0],b1=buf[1],fin=!!(b0&0x80),rsv=b0&0x70,opcode=b0&0x0f,masked=!!(b1&0x80);
   if(rsv)return {frames,error:{code:1002,reason:'rsv'}};
   if(requireMask&&!masked)return {frames,error:{code:1002,reason:'unmasked'}};
   let len=b1&0x7f,off=2;
   if(len===126){if(buf.length<4)break;len=buf.readUInt16BE(2);off=4;}
   else if(len===127){if(buf.length<10)break;const big=buf.readBigUInt64BE(2);if(big>BigInt(maxPayload))return {frames,error:{code:1009,reason:'too big'}};len=Number(big);off=10;}
   if(len>maxPayload)return {frames,error:{code:1009,reason:'too big'}};
   if(opcode>=0x8&&(len>125||!fin))return {frames,error:{code:1002,reason:'control frame'}};
   const maskAt=off;if(masked)off+=4;
   if(buf.length<off+len)break;
   const payload=Buffer.from(buf.subarray(off,off+len));
   if(masked){const m=buf.subarray(maskAt,maskAt+4);for(let i=0;i<len;i++)payload[i]^=m[i&3];}
   buf=buf.subarray(off+len);
   frames.push({fin,opcode,payload});
  }
  return {frames,error:null};
 };
}

// close 프레임 본문: 2바이트 코드 + 이유(UTF-8, 123바이트 이내)
export const closePayload=(code=1000,reason='')=>{const r=Buffer.from(String(reason).slice(0,60),'utf8').subarray(0,123),b=Buffer.alloc(2+r.length);b.writeUInt16BE(code,0);r.copy(b,2);return b;};
export const parseClose=p=>p.length>=2?{code:p.readUInt16BE(0),reason:p.subarray(2).toString('utf8')}:{code:1005,reason:''};

// 소켓 하나를 감싸 텍스트 메시지 단위로 주고받는다. onText(str)·onClose(code,reason)를 넘긴다.
// maxBuffered: 보내지 못하고 쌓인 바이트가 이만큼 넘으면(받지 못하는 느린 접속) 끊는다. 10Hz 스냅샷이 메모리에 무한히 쌓이지 않게.
export function wrapSocket(socket,{maxPayload=8192,maxBuffered=1<<20,onText,onClose,onPong}={}){
 const read=createFrameReader({maxPayload});let closed=false,closeSent=false;
 const write=b=>{if(!socket.destroyed&&socket.writable)socket.write(b);};
 const conn={
  sendText(s){if(closed)return;if(socket.writableLength>maxBuffered){conn.terminate();return;}write(encodeFrame(OP.text,s));},
  ping(){if(!closed)write(encodeFrame(OP.ping,''));},
  close(code=1000,reason=''){if(closed)return;if(!closeSent){closeSent=true;write(encodeFrame(OP.close,closePayload(code,reason)));}
   finish(code,reason);setTimeout(()=>socket.destroy(),500).unref?.();socket.end();},
  terminate(){finish(1006,'terminated');socket.destroy();},
  get closed(){return closed;},
  get bufferedAmount(){return socket.writableLength;}
 };
 function finish(code,reason){if(closed)return;closed=true;onClose?.(code,reason);}
 socket.setNoDelay?.(true);
 socket.on('data',chunk=>{
  if(closed)return;
  const {frames,error}=read(chunk);
  for(const f of frames){
   if(closed)return;
   if(f.opcode===OP.text){if(!f.fin){conn.close(1003,'fragmented');return;}onText?.(f.payload.toString('utf8'));}
   else if(f.opcode===OP.ping)write(encodeFrame(OP.pong,f.payload));
   else if(f.opcode===OP.pong)onPong?.();
   else if(f.opcode===OP.close){const c=parseClose(f.payload);if(!closeSent){closeSent=true;write(encodeFrame(OP.close,closePayload(c.code===1005?1000:c.code)));}finish(c.code,c.reason);socket.end();return;}
   else{conn.close(1003,'text only');return;}
  }
  if(error)conn.close(error.code,error.reason);
 });
 socket.on('close',()=>finish(1006,'socket closed'));
 socket.on('error',()=>finish(1006,'socket error'));
 return conn;
}
