# The multiplayer server (which also serves the game, music and sound effects) in a container.
FROM node:22-alpine
WORKDIR /app
COPY multiplayer/package*.json multiplayer/
RUN cd multiplayer && npm install --omit=dev --no-audit --no-fund
COPY multiplayer/ multiplayer/
COPY music/ music/
COPY sfx/ sfx/
COPY favicon.ico ./
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/ || exit 1
USER node
CMD ["node", "multiplayer/server.js"]
