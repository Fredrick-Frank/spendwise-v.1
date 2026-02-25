FROM node:24-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

# --- OPENSHIFT ANYUID COMPATIBILITY ---
# 1. Create the data directory
# 2. Change ownership to group 0 (root group)
# 3. Change permissions so the group has write access (775)
RUN mkdir -p /data && \
    chown -R :0 /data && \
    chmod -R g+w /data && \
    chmod -R 775 /data

EXPOSE 3000

# OpenShift will run this as a random UID belonging to group 0
CMD [ "node", "server.js" ]