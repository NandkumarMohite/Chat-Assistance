FROM shrdcomauingridacr01.azurecr.io/node/node:22

# Proxy arguments
ARG HTTP_PROXY
ARG HTTPS_PROXY

# Set proxy environment variables
ENV HTTP_PROXY=$HTTP_PROXY
ENV HTTPS_PROXY=$HTTPS_PROXY

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application source
COPY . .

# Expose application port
EXPOSE 3000

# Start application
CMD ["npm", "start"]