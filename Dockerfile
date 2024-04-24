# Alpine linux, node.js
# https://hub.docker.com/_/node/
FROM node:alpine

WORKDIR /opt/api

# Copy package.json and package-lock.json
COPY package*.json ./
COPY yarn.lock ./

# Install dependencies
RUN apk add --no-cache --virtual .deps yarn \
    && yarn \
    && apk del .deps

# Copy source code
COPY . .

# Build the app
RUN yarn run build

# Start the app
CMD ["yarn", "start"]