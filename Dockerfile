
FROM node:latest

WORKDIR /app

ADD . /app

#Environment variables:
ENV DB_TYPE=
ENV DB_HOST=
ENV DB_PORT= 
ENV DB_USER=
ENV DB_PASS=
ENV DB_NAME=
ENV STEAM_ACCNAME=
ENV STEAM_ACCPASS=
ENV STEAM_APIKEY=
ENV DISCORD_TOKEN=

VOLUME /app

RUN npm i && npm i steam-user

ENTRYPOINT [ "node", "/app/index.js" ]