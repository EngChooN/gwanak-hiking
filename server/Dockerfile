# 함께 걷기 서버 이미지(2026-11-08). 새 npm 패키지가 없어 npm install 단계도 없다.
# 빌드는 저장소 맨 위에서(src/multi-protocol.js가 필요):  docker build -f server/Dockerfile -t gwanak-multi .
# 실행 예:  docker run -d --name gwanak-multi --restart unless-stopped -p 8787:8787 -v gwanak-multi-data:/data \
#            -e ALLOWED_ORIGINS=https://engchoon.github.io gwanak-multi
# http(ws://)만 연다. wss://(TLS)는 앞단(Cloudflare 터널·클라우드 부하분산기·역방향 프록시)이 맡는다.
FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src/multi-protocol.js ./src/multi-protocol.js
# 채팅 금칙어 기본 목록(산리서치). 끝 글자를 [t]로 적어 파일이 아직 없어도 빌드가 깨지지 않게 한다(없으면 빈 목록으로 뜸)
COPY server/ws.mjs server/rooms.mjs server/multi-server.mjs server/chat-banned-words.tx[t] ./server/
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
CMD ["node","server/multi-server.mjs"]
