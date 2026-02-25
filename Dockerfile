# Use the official Node.js 24 image as the base
FROM node:24-slim

# Create and change to the app directory
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure both package.json AND package-lock.json are copied.
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy local code to the container image.
COPY . .

# Create the /data directory for OpenShift persistence 
# and set permissions so the app can write the database there
RUN mkdir -p /data && chmod 777 /data

# Expose the port the app runs on
EXPOSE 3000

# Run the web service on container startup.
CMD [ "node", "server.js" ]
