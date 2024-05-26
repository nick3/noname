# First stage: resource preparation
FROM node:lts-alpine3.17 as builder

WORKDIR /app

RUN apk add --no-cache unzip

ADD https://github.com/libccy/noname/archive/master.zip /app

RUN unzip master.zip && \
    rm master.zip && \
    mv noname-master/game/server.js . && \
    mv noname-master/node_modules . && \
    rm -rf noname-master

# Second stage: application
FROM node:lts-alpine3.17

WORKDIR /app

# Copy server.js and node_modules from builder stage
COPY --from=builder /app/server.js .
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8080

CMD [ "node", "server.js" ]
