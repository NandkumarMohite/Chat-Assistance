# Ollama Chat AI

![Ollama Chat AI Banner](./public/banner.png)

## Overview

Ollama Chat AI is a powerful, extensible AI chat application powered by Ollama's thinking models. It features a modular Node.js backend that can dynamically register and interact with various backend APIs, acting as an intelligent intermediary.

## Features

- 🤖 **Ollama Integration**: Seamless connection to local or remote Ollama models (e.g., Qwen, DeepSeek).
- 🛡️ **Production Ready**: Equipped with `helmet` for security, `compression` for performance, `morgan` for logging, and `express-rate-limit` for abuse prevention.
- 🏪 **Dynamic API Registry**: Add new backend capabilities simply by updating `api-registry.json`—no code changes required!
- 🐳 **Docker Ready**: Includes a production-ready `Dockerfile` for easy deployment.
- 🚀 **CI/CD Integrated**: Comes with a pre-configured `Jenkinsfile` for automated builds.
- 🛠️ **Modular Architecture**: Clean separation between core logic, routing, and configuration.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- [Ollama](https://ollama.ai/) installed and running

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd "Chat AI"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your environment:
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=qwen3:latest
   ```

4. Start the server:
   ```bash
   npm start
   ```

### Running with Docker

The Docker image is built to be environment-agnostic. You can choose which configuration profile to use at runtime:

#### 1. Use the Production Profile
```bash
docker build -t ollama-chat-ai .
docker run -p 3000:3000 -e NODE_ENV=production ollama-chat-ai
```

#### 2. Use the Development Profile
```bash
docker run -p 3000:3000 -e NODE_ENV=development ollama-chat-ai
```

#### 3. Use a Custom Configuration File
You can mount your own configuration file and point to it:
```bash
docker run -p 3000:3000 \
  -v $(pwd)/my-config.yml:/usr/src/app/custom-config.yml \
  -e CONFIG_PATH=/usr/src/app/custom-config.yml \
  ollama-chat-ai
```

## API Documentation

- `POST /api/chat`: Send messages to the AI.
- `GET /api/models`: List available Ollama models.
- `GET /api/registry`: View currently registered backend APIs.
- `GET /api/health`: Check server status.

## Contributing

Please refer to the [CHANGELOG.md](./CHANGELOG.md) for version history and contribution updates.

## License

MIT
