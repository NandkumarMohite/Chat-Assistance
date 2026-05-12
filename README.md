# 🤖 Chat AI Microservice

This project is an AI Chat Assistant powered by **Ollama** and integrated with the **Comau Backend API**. It is designed to run as a microservice in a containerized environment.

## 🏗️ Microservice Architecture

The system is composed of three main microservices:
1.  **Chat AI Service**: This Node.js application (Express).
2.  **Ollama Service**: The official Ollama container for running local LLMs.
3.  **Comau Backend**: The core business logic API (external dependency).

## 🚀 Getting Started (Docker Compose)

The easiest way to run the entire stack is using Docker Compose:

```bash
# 1. Start all services
docker-compose up -d

# 2. Pull the required AI model (one-time setup)
docker exec -it ollama-service ollama pull qwen2.5-coder:3b
```

The Chat AI will be available at `http://localhost:3000`.

## ⚙️ Configuration

Environment variables can be configured in a `.env` file. See `.env.example` for details.

| Variable | Description | Default (Local) | Docker Compose Default |
| :--- | :--- | :--- | :--- |
| `PORT` | Port for the Node server | `3000` | `3000` |
| `OLLAMA_URL` | URL of the Ollama service | `http://localhost:11434` | `http://ollama-service:11434` |
| `OLLAMA_MODEL` | Model name to use | `qwen2.5-coder:3b` | `qwen2.5-coder:3b` |
| `BACKEND_URL` | Base URL for Comau API | `http://localhost:8080/api/v1` | `http://comau-backend:8080/api/v1` |

## 🛠️ Development

To run locally for development:

```bash
npm install
npm run dev
```

Ensure you have a local Ollama instance running or point `OLLAMA_URL` to a remote instance.
