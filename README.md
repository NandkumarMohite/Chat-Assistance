# 🤖 Comau Chat Assistant Microservice

This project is a high-performance AI Chat Assistant powered by **Ollama** and integrated with the **Comau Backend API**. It is architected to run as a microservice in a containerized environment with full CI/CD support.

---

## 🚀 Quick Start (Docker)

The fastest way to get started locally:

```bash
# 1. Start all services
docker-compose up -d

# 2. Pull the AI model (required once)
docker exec -it ollama-service ollama pull qwen2.5-coder:3b
```
The application will be available at `http://localhost:3000`.

---

## 🏗️ Architecture

- **Comau Chat Assistant Service**: Node.js (Express) application handling logic and API orchestration.
- **Ollama Service**: Official container for local LLM inference.
- **Comau Backend**: Core business logic API (external dependency).

---

## ⚙️ Configuration

We use a **Single Source of Truth** pattern. All configurations are managed via the `.env` file.

| Variable | Default (Local) | Docker Compose Value | Description |
| :--- | :--- | :--- | :--- |
| `BACKEND_URL` | `http://localhost:8080/api/v1` | `${BACKEND_URL}` | Base URL for the external Backend API. |
| `OLLAMA_URL` | `http://localhost:11434` | `http://ollama-service:11434` | Internal Docker address for Ollama. |
| `OLLAMA_MODEL` | `qwen2.5-coder:3b` | `qwen2.5-coder:3b` | Fallback AI model (used if router/analyzer not set). |
| `OLLAMA_ROUTER_MODEL` | `qwen2.5-coder:3b` | `qwen2.5-coder:3b` | Model used for API routing & intent classification. |
| `OLLAMA_ANALYZER_MODEL` | `qwen2.5-coder:3b` | `qwen3` | Model used for data analysis & response generation. |

---

## 🧠 Dual-Model Architecture

The system uses **two separate AI models** for different tasks, allowing you to optimize for both **speed** (routing) and **quality** (analysis).

### How It Works

| Step | Model | What It Does |
| :--- | :--- | :--- |
| 1. Classify intent & pick API | `OLLAMA_ROUTER_MODEL` | Understands the user's question, selects the right API, extracts parameters (path params, query params, dates) |
| 2. Build URL & call API | **No model (pure code)** | Builds the URL from extracted params, calls the real backend API, gets raw data |
| 3. Interpret results | `OLLAMA_ANALYZER_MODEL` | Reads the API response and generates a human-readable answer |
| 4. Chart analysis | `OLLAMA_ANALYZER_MODEL` | Recommends the best chart type for data visualization |
| 5. Follow-up analysis | `OLLAMA_ANALYZER_MODEL` | Answers questions like "which station has worst OEE?" |
| 6. Period comparison | `OLLAMA_ANALYZER_MODEL` | Compares current vs previous period data and highlights trends |

### Recommended Setup

```env
# Fast & small — speed matters for routing (runs first on every query)
OLLAMA_ROUTER_MODEL=qwen2.5-coder:3b

# Smart & large — quality matters for analysis (produces the final answer)
OLLAMA_ANALYZER_MODEL=qwen3
```

> **Tip:** The router model should be **fast** because it runs first on every query. The analyzer model should be **smart** because it produces the final answer the user sees. You can use the **same model** for both if you prefer simplicity — just set `OLLAMA_MODEL` and leave the other two unset.

### UI Display

The sidebar shows which models are configured for each role (read-only — not user-selectable). Model assignment is controlled entirely via the `.env` file.

---

## 🏎️ GPU Acceleration (NVIDIA)

This project is pre-configured for NVIDIA GPU support in Docker. 
**Prerequisites:**
1. NVIDIA Container Toolkit installed.
2. WSL2 enabled (if on Windows).

Docker will automatically use your GPU for inference, making the AI significantly faster than on CPU.

---

## ⛓️ CI/CD (Jenkins)

The project includes a `Jenkinsfile` for automated deployment:
1. **Build**: Pulls Node image and builds the service.
2. **Push**: Tags and pushes the image to `nandkumarmohite/chat-ai-service`.
3. **Deploy**: Triggers a pull and restart on your target VM.

**Jenkins Requirements:**
- Credential ID `registry-pass`: Docker Hub token.
- Credential ID `backend-api-url`: Production Backend API URL.

---

## 📦 VM Deployment

To deploy on a new VM:
1. Copy `docker-compose.yml` and `.env` to the server.
2. Run `docker-compose up -d`.
3. Run `docker exec -it ollama-service ollama pull qwen2.5-coder:3b`.

---

## 🛠️ Development

```bash
npm install
npm start
```
Check `CHANGELOG.md` for recent version updates.
