FROM node
#Create working directory
RUN mkdir -p /app
WORKDIR /app
#Install app dependencies
COPY package.json /app/
RUN npm install
#Bundle app resources
COPY . /app

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

ENTRYPOINT [ "node", "index.js" ]