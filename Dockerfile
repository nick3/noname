FROM node:lts-alpine3.17

WORKDIR /app

# Install http-server
RUN npm install -g http-server

# Add start.sh
ADD start.sh .
RUN chmod +x start.sh

EXPOSE 8080

# Start http-server and node server.js
CMD [ "./start.sh" ]
