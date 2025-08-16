FROM node:20-alpine
RUN apk add --no-cache python3 make g++

WORKDIR /appm

COPY package.json ./

RUN npm i

COPY . .

EXPOSE 7007

CMD [ "node", "app.js" ]
