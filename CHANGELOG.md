# 📋 Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-05-12

### ✨ Added
- **Dockerization**: Full Docker and Docker Compose setup for App and Ollama.
- **GPU Acceleration**: Added NVIDIA GPU support via Docker Compose reservations.
- **CI/CD Pipeline**: Created `Jenkinsfile` for automated build, test, and push workflows.
- **Project Banner**: Added `Banner.txt` for a professional CLI startup experience.
- **Config Centralization**: Implemented a single source of truth for environment variables (specifically `BACKEND_URL`).

### 🔧 Changed
- Updated `core/registry.js` to automatically override API base URLs using environment variables.
- Refactored `docker-compose.yml` to support remote registry images (`nandkumarmohite/chat-ai-service`).
- Improved `.env.example` documentation for microservice connectivity.

### 🚀 Deployment
- Supported registry-based deployment for VM environments.

---

## [1.0.0] - 2026-05-05
- Initial release of the Ollama-powered AI Assistant.
- Integrated with Comau Backend API.
- Support for API registry and dynamic tool calling.
