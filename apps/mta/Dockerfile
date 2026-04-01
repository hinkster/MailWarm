FROM node:20-alpine
RUN npm install -g haraka
WORKDIR /app
COPY config/ ./config/
COPY plugins/ ./plugins/
COPY package.json ./
RUN npm install --production
EXPOSE 25 587 465
CMD ["haraka", "-c", "/app"]
