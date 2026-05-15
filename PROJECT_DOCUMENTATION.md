# Comau Chat Assistant — Complete Project Documentation

> **Version:** 1.0.0  
> **Last Updated:** May 13, 2026  
> **Description:** AI Chat Bot powered by Ollama Thinking Model — a natural-language interface to Comau backend APIs.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Project Structure](#3-project-structure)
4. [Tech Stack](#4-tech-stack)
5. [Core Modules — Deep Dive](#5-core-modules--deep-dive)
6. [Routes — API Endpoints](#6-routes--api-endpoints)
7. [Frontend](#7-frontend)
8. [API Registry — The Config-Driven Engine](#8-api-registry--the-config-driven-engine)
9. [Request Lifecycle — End-to-End Flow](#9-request-lifecycle--end-to-end-flow)
10. [Environment Variables & Configuration](#10-environment-variables--configuration)
11. [Docker & Deployment](#11-docker--deployment)
12. [CI/CD — Jenkins Pipeline](#12-cicd--jenkins-pipeline)
13. [How to Add a New API (Zero-Code)](#13-how-to-add-a-new-api-zero-code)
14. [Dependency Chains — Multi-Step Workflows](#14-dependency-chains--multi-step-workflows)
15. [Security Considerations](#15-security-considerations)
16. [Known Limitations & Improvement Areas](#16-known-limitations--improvement-areas)

---

## 1. Project Overview

**Comau Chat Assistant** is an AI-powered chatbot microservice that lets users interact with Comau's manufacturing backend APIs using plain English. Instead of navigating dashboards or writing API calls manually, users simply ask questions like:

- *"Show me all production lines"*
- *"What's the status of edge device edge-1?"*
- *"Get purchase history for user with email john@comau.com"*

The system uses a local **Ollama LLM** to:
1. **Understand** user intent
2. **Route** to the correct backend API(s)
3. **Execute** the API call(s)
4. **Interpret** the raw data into a human-readable answer

### Key Design Principle
> **Zero-code API addition**: New backend APIs are added by editing a single JSON file (`api-registry.json`). No JavaScript changes required.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER (Browser)                           │
│                    public/index.html + app_new.js                │
└────────────────────────────┬────────────────────────────────────┘
                             │  HTTP (SSE streaming)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EXPRESS SERVER (server.js)                     │
│                        Port: 3000                                │
│                                                                  │
│  Routes:                                                         │
│  ├── POST /api/chat       →  routes/chat.js      (main brain)   │
│  ├── GET  /api/health     →  routes/health.js    (status check) │
│  ├── GET  /api/models     →  routes/models.js    (list models)  │
│  ├── GET  /api/registry   →  routes/registry.js  (list APIs)   │
│  └── POST /api/registry/reload → hot-reload API registry        │
│                                                                  │
│  Core Modules:                                                   │
│  ├── core/config.js       →  Environment variables               │
│  ├── core/registry.js     →  API registry loader & describer    │
│  ├── core/ollama.js       →  LLM communication helper           │
│  ├── core/prompts.js      →  System prompts & templates         │
│  └── core/executor.js     →  HTTP executor, filters, chains     │
└──────────┬──────────────────────────────┬───────────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────┐     ┌──────────────────────────────┐
│    OLLAMA SERVICE    │     │     COMAU BACKEND API        │
│  (Local LLM Engine)  │     │  (External REST Service)     │
│                       │     │                              │
│  Default Model:       │     │  Base URL configured via     │
│  qwen2.5-coder:3b    │     │  BACKEND_URL env variable    │
│                       │     │                              │
│  Port: 11434          │     │  Endpoints defined in        │
│  API: /api/chat       │     │  api-registry.json           │
│       /api/tags       │     │                              │
└─────────────────────┘     └──────────────────────────────┘
```

### Service Composition (Docker Compose)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `ollama` | `ollama/ollama:latest` | 11434 | Local LLM inference engine (GPU-accelerated) |
| `comauchatassistant` | `itdgtpconreg01cnr.azurecr.io/comauchatassistant:0.0.1_TC1` | 3000 | Chat assistant application |

Both services communicate over a `chat-network` Docker bridge network.

---

## 3. Project Structure

```
comauchatassistant/
├── server.js                    # Application entry point
├── package.json                 # Dependencies & scripts
├── api-registry.json            # Config-driven API catalog (THE key file)
├── chatAssistant.Dockerfile     # Docker build instructions
├── docker-compose.yml           # Multi-service orchestration
├── Jenkinsfile                  # CI/CD pipeline definition
├── Banner.txt                   # ASCII art displayed on startup
├── CHANGELOG.md                 # Version history
├── README.md                    # Quick-start guide
├── sign_docker_image.sh         # Docker image signing (Notary)
├── sign_docker_image_for_azure.sh
│
├── core/                        # Business logic modules
│   ├── config.js                # Environment variable loader
│   ├── registry.js              # API registry management
│   ├── ollama.js                # Ollama LLM interaction
│   ├── prompts.js               # LLM prompt templates
│   └── executor.js              # HTTP execution engine
│
├── routes/                      # Express route handlers
│   ├── chat.js                  # POST /api/chat — main chat endpoint
│   ├── health.js                # GET /api/health — status check
│   ├── models.js                # GET /api/models — list Ollama models
│   └── registry.js              # GET /api/registry — list registered APIs
│
└── public/                      # Frontend (served as static files)
    ├── index.html               # Chat UI shell
    ├── app_new.js               # Frontend JavaScript (SSE client)
    └── style.css                # Styling
```

---

## 4. Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Runtime** | Node.js | 22 |
| **Web Framework** | Express.js | 4.18.2 |
| **HTTP Client** | node-fetch | 2.7.0 |
| **CORS** | cors | 2.8.5 |
| **Env Config** | dotenv | 16.3.1 |
| **Dev Tool** | nodemon | 3.0.2 |
| **LLM Engine** | Ollama | latest |
| **Default Model** | qwen2.5-coder:3b | — |
| **Container** | Docker + Docker Compose | — |
| **CI/CD** | Jenkins | — |
| **Registry** | Azure Container Registry (ACR) | — |
| **Frontend** | Vanilla HTML/CSS/JS (no framework) | — |

---

## 5. Core Modules — Deep Dive

### 5.1 `core/config.js` — Configuration

Loads environment variables with sensible defaults using `dotenv`.

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama service base URL |
| `OLLAMA_MODEL` | `qwen2.5-coder:3b` | LLM model to use |
| `BACKEND_URL` | `http://localhost:8080/api/v1` | Comau backend API base URL |
| `PORT` | `3000` | Express server port |

---

### 5.2 `core/registry.js` — API Registry Manager

Manages the lifecycle of the API registry loaded from `api-registry.json`.

**Functions:**

| Function | Description |
|----------|-------------|
| `loadRegistry()` | Reads `api-registry.json` from disk, parses it, and overrides `baseUrl` with `BACKEND_URL` env if set. Called once at startup. |
| `reloadRegistry()` | Hot-reloads the registry without restarting the server. Called via `POST /api/registry/reload`. |
| `getRegistry()` | Returns the currently cached registry object. |
| `buildAPIDescription()` | Generates a complete text description of all APIs and dependency chains for the LLM prompt. This is what "teaches" the AI about available endpoints. |

---

### 5.3 `core/ollama.js` — LLM Communication

Handles all interactions with the Ollama API.

**Functions:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `callOllama` | `(systemPrompt, userMessage, enableThink?)` | Sends a chat request to Ollama (`POST /api/chat`). Returns `{ thinking, content }`. When `enableThink=true`, activates chain-of-thought (for models like deepseek-r1, qwen3). |
| `extractJSON` | `(text)` | Parses JSON from LLM text output. Tries three strategies: ` ```json ``` ` blocks → ` ``` ``` ` blocks → raw `{...}` match. |
| `fetchOllamaModels` | `()` | Lists available models via `GET /api/tags`. |

---

### 5.4 `core/prompts.js` — Prompt Engineering

Contains all LLM prompt templates. This is the "brain programming" of the assistant.

**Identity:**
```
You are the Comau AI Assistant, a high-performance administrative intelligence agent.
Your goal is to help managers oversee Comau's manufacturing systems, seller performance,
and product inventories.
```

**Three Prompt Templates:**

| Function | Purpose | Used When |
|----------|---------|-----------|
| `buildClassifyPrompt(apiDescription, chainDescriptions)` | Intent classification + API routing. Instructs the LLM to decide if the user needs an API call, which API to call, what parameters to fill, or whether to use a dependency chain. | Step 1 of every chat request |
| `buildInterpretPrompt(userMessage, apiResults)` | Converts raw API response data into a human-readable, conversational answer with formatting. | Step 3, when API data was fetched |
| `buildGeneralPrompt(userMessage, conversationHistory)` | Answers general knowledge questions (no API needed). Includes last 4 conversation turns for context. | Step 3, for non-API questions |

**Classify Prompt Output Format (JSON):**
```json
{
  "requiresAPI": true,
  "reason": "User wants to see all production lines",
  "chainId": null,
  "apiId": "get_plant_lines",
  "pathParams": {},
  "requestBody": null,
  "clientFilter": null,
  "multipleAPIs": false,
  "apiCalls": []
}
```

---

### 5.5 `core/executor.js` — HTTP Execution Engine

Executes the actual HTTP calls to the Comau backend.

**Functions:**

| Function | Description |
|----------|-------------|
| `executeAPICall({ method, url, body }, jwtToken)` | Makes a single HTTP request. Attaches JWT `Authorization` header if provided. Throws `UNAUTHORIZED_OR_FORBIDDEN` on 401/403. |
| `applyClientFilter(records, clientFilter, send)` | Filters an array of records client-side. Supports operators: `eq` (exact match), `contains` (substring), `gt`, `lt`, `gte`, `lte` (numeric). Used when no server-side filter exists. |
| `executeDependencyChain(chain, userMessage, jwtToken, send)` | Runs a multi-step API workflow. Resolves inter-step variable references (e.g., `$resolvedUserId`). Matches user input tokens to records for entity resolution. |

---

## 6. Routes — API Endpoints

### 6.1 `POST /api/chat` — Main Chat Endpoint

**The brain of the application.** Receives a user message and returns a streaming response via Server-Sent Events (SSE).

**Request Body:**
```json
{
  "message": "Show me all production lines",
  "conversationHistory": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello! How can I help?" }
  ],
  "jwtToken": "eyJhbGciOi..."
}
```

**SSE Event Types Emitted:**

| Event | Payload | Description |
|-------|---------|-------------|
| `status` | `{ step, message }` | Progress indicator (🧠 Understanding, ⚙️ Planning, 🔍 Calling...) |
| `api_call` | `{ method, url, body, name }` | Shows which API was called |
| `data` | `{ rows, count, apiName }` | Raw data returned from the API |
| `thinking` | `{ content }` | Chain-of-thought reasoning (if model supports it) |
| `auth_token` | `{ token }` | JWT token from login/register responses |
| `answer` | `{ content }` | Final human-readable answer (markdown) |
| `error_partial` | `{ message, api? }` | Non-fatal error for a specific API call |
| `error` | `{ message }` | Fatal error |
| `done` | `{ requiresAPI, apisCalled, totalResults }` | Completion summary |

---

### 6.2 `GET /api/health` — Health Check

Returns system status for Ollama, backend connectivity, model info, and registered API count.

**Response:**
```json
{
  "status": "ok",
  "ollama": "connected",
  "backend": "connected",
  "backendUrl": "http://172.22.10.25:8080/api/v1",
  "model": "qwen2.5-coder:3b",
  "registeredAPIs": 15,
  "availableModels": ["qwen2.5-coder:3b", "deepseek-r1:latest"]
}
```

---

### 6.3 `GET /api/models` — List Available Models

Returns all models available on the Ollama instance.

**Response:**
```json
{
  "models": [
    { "name": "qwen2.5-coder:3b", "size": 1900000000 }
  ]
}
```

---

### 6.4 `GET /api/registry` — List Registered APIs

Returns a summary of all APIs registered in `api-registry.json`.

---

### 6.5 `POST /api/registry/reload` — Hot-Reload Registry

Reloads `api-registry.json` from disk without restarting the server. Useful after adding new APIs.

**Response:**
```json
{ "message": "Registry reloaded", "count": 15 }
```

---

## 7. Frontend

A **vanilla HTML/CSS/JS** single-page application with a modern dark-themed chat interface.

### Features

| Feature | Description |
|---------|-------------|
| **Real-time SSE streaming** | Messages stream in progressively with step-by-step status indicators |
| **Model selector** | Dropdown to switch Ollama models dynamically |
| **Health status indicators** | Live Ollama + Backend connection status pills in sidebar |
| **Dark/Light theme** | Toggle between themes, persisted in `localStorage` |
| **Suggested queries** | Pre-built query chips for quick access |
| **Chat history** | Recent conversations stored in sidebar |
| **JWT auth support** | Stores JWT token in `localStorage` from login responses |
| **API call visualization** | Shows the actual API call made (method, URL, body) |
| **Thinking block** | Displays chain-of-thought reasoning from thinking models |
| **Data preview** | Renders raw data tables before the interpreted answer |
| **Copy to clipboard** | Copy API calls, code blocks, and answers |
| **Mobile responsive** | Collapsible sidebar for mobile devices |
| **2000 char limit** | Input character counter |

### Key State Variables (app_new.js)

| Variable | Type | Description |
|----------|------|-------------|
| `isStreaming` | boolean | Prevents duplicate sends while waiting for response |
| `conversation` | array | Full conversation history sent with each request |
| `selectedModel` | string | Currently selected Ollama model |
| `jwtToken` | string | JWT for authenticated API calls, stored in `localStorage` |

---

## 8. API Registry — The Config-Driven Engine

`api-registry.json` is the **single source of truth** for all backend APIs the AI can call. The AI reads this file to understand what endpoints exist, their parameters, and when to use them.

### Structure

```json
{
  "baseUrl": "http://placeholder-overridden-by-env/api/v1",
  "serviceName": "Comau Chat Assistant",
  "description": "Comau backend API — manages users, products, ...",
  "dependencyChains": [ ... ],
  "apis": [ ... ]
}
```

### Registered APIs (as of current version)

| API ID | Method | Path | Description |
|--------|--------|------|-------------|
| `get_device_status_history` | GET | `/edgemonitor/device-status-history` | Device status history with time range filter |
| `get_edges_last_statuses` | GET | `/edgemonitor/edges-last-statuses` | All edges/collectors/devices with latest status |
| `get_last_statuses` | GET | `/edgemonitor/last-statuses` | Last N status changes for edge/collector/device |
| `get_plant_lines` | GET | `/lines` | All production lines with pagination |
| `get_line` | GET | `/lines/{lineId}` | Single line by ID |
| `get_line_areas` | GET | `/lines/{lineId}/areas` | Areas + stations for a line |
| `get_line_stations` | GET | `/lines/{lineId}/stations` | Stations for a line |
| `get_all_line_links` | GET | `/line-links` | Links between production lines |
| `get_line_link_by_id` | GET | `/line-links/{id}` | Single line link by ID |
| `get_cycle_configuration` | GET | `/cycle-configuration` | Cycle-time configs for all stations |
| `get_cycle_configuration_by_station` | GET | `/cycle-configuration/{stationId}` | Cycle-time config for specific station |
| `get_all_line_buffers` | GET | `/line-buffer` | All line buffer configurations |
| `get_line_buffer_by_id` | GET | `/line-buffer/{id}` | Single line buffer by ID |
| `get_station_link_buffer` | GET | `/station-links/station-link-buffer` | Station link buffer configurations |

### API Object Schema

```json
{
  "id": "unique_api_identifier",
  "name": "Human Readable Name",
  "description": "What this API does — the AI reads this to decide when to use it",
  "method": "GET|POST|PUT|DELETE",
  "path": "/endpoint/{pathParam}",
  "parameters": [
    {
      "name": "paramName",
      "in": "path|query",
      "type": "String|integer",
      "required": true,
      "description": "Parameter description for the AI"
    }
  ],
  "requestBody": {
    "type": "JSON",
    "fields": [
      { "name": "fieldName", "type": "string", "required": true, "description": "..." }
    ]
  },
  "responseExample": { ... },
  "keywords": ["trigger", "words", "that", "help", "AI", "match"]
}
```

---

## 9. Request Lifecycle — End-to-End Flow

```
User types: "Show me all production lines"
    │
    ▼
┌────────────────────────────────────────────────────────┐
│  STEP 1: CLASSIFY INTENT                                │
│                                                          │
│  Frontend → POST /api/chat { message, history, jwt }    │
│                                                          │
│  Server sends SSE: status → "🧠 Understanding..."       │
│                                                          │
│  Builds classify prompt with full API description        │
│  Calls Ollama → gets JSON response:                      │
│  {                                                       │
│    "requiresAPI": true,                                  │
│    "apiId": "get_plant_lines",                           │
│    "pathParams": {},                                     │
│    "clientFilter": null                                  │
│  }                                                       │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│  STEP 2: EXECUTE API                                     │
│                                                          │
│  Server sends SSE: status → "⚙️ Planning API calls..."  │
│  Server sends SSE: api_call → { GET, /lines }           │
│  Server sends SSE: status → "🔍 Calling Get Plant Lines" │
│                                                          │
│  executor.js → GET http://backend:8080/api/v1/lines      │
│  (with JWT Authorization header if provided)             │
│                                                          │
│  Receives: [{ id: 1, name: "Stellantis Line", ... }]    │
│                                                          │
│  If clientFilter specified → applyClientFilter()         │
│                                                          │
│  Server sends SSE: data → { rows: [...], count: 1 }     │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│  STEP 3: INTERPRET RESULTS                               │
│                                                          │
│  Server sends SSE: status → "💬 Crafting your answer..." │
│                                                          │
│  Builds interpret prompt with user question + API data   │
│  Calls Ollama → gets human-readable markdown answer      │
│                                                          │
│  Server sends SSE: answer → { content: "Here are..." }  │
│  Server sends SSE: done → { requiresAPI: true, ... }    │
└────────────────────────────────────────────────────────┘
```

### Alternative Flows

| Scenario | Behavior |
|----------|----------|
| **General knowledge question** (e.g., "What is Java?") | Step 1 returns `requiresAPI: false` → skips Step 2 → Step 3 uses `buildGeneralPrompt` |
| **Dependency chain** (e.g., "Purchase history for phone 555-1234") | Step 2 runs `executeDependencyChain()` — multiple sequential API calls with value extraction between steps |
| **Client-side filter** (e.g., "Show users with role OWNER") | Step 2 fetches all records, then applies `applyClientFilter()` locally |
| **Multiple APIs** | Step 1 sets `multipleAPIs: true` + `apiCalls[]` → Step 2 iterates and calls each |
| **Auth error (401/403)** | Sends `error_partial` SSE event telling user to sign in |

---

## 10. Environment Variables & Configuration

### Application Environment Variables

| Variable | Default | Docker Override | Description |
|----------|---------|-----------------|-------------|
| `PORT` | `3000` | `3000` | Express server port |
| `OLLAMA_URL` | `http://localhost:11434` | `http://ollama-service:11434` | Ollama service URL |
| `OLLAMA_MODEL` | `qwen2.5-coder:3b` | `qwen2.5-coder:3b` | LLM model name |
| `BACKEND_URL` | `http://localhost:8080/api/v1` | `${BACKEND_URL}` from host env | Comau backend API base URL |

### Docker Build Arguments

| Arg | Description |
|-----|-------------|
| `HTTP_PROXY` | Corporate HTTP proxy for `npm install` |
| `HTTPS_PROXY` | Corporate HTTPS proxy for `npm install` |

---

## 11. Docker & Deployment

### Dockerfile (`chatAssistant.Dockerfile`)

```dockerfile
FROM shrdcomauingridacr01.azurecr.io/node/node:22   # Internal Node 22 base image
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Docker Compose (`docker-compose.yml`)

Runs two services:

1. **`ollama`** — Ollama LLM inference engine
   - Persistent volume: `ollama_storage` (keeps downloaded models)
   - GPU pass-through via NVIDIA Container Toolkit
   - Port: 11434

2. **`comauchatassistant`** — This application
   - Depends on `ollama`
   - Port: 3000
   - Environment variables for connecting to Ollama and backend

### Deployment Commands

```bash
# Start all services
docker-compose up -d

# Pull AI model (first time only)
docker exec -it ollama-service ollama pull qwen2.5-coder:3b

# View logs
docker-compose logs -f comauchatassistant

# Restart after api-registry.json changes
docker-compose restart comauchatassistant

# Or hot-reload without restart:
curl -X POST http://localhost:3000/api/registry/reload
```

### GPU Support

The `docker-compose.yml` reserves all NVIDIA GPUs for the Ollama service. **Prerequisites:**
- NVIDIA Container Toolkit installed
- WSL2 enabled (Windows)

To run **without GPU**, remove the `deploy.resources.reservations.devices` block from the `ollama` service.

---

## 12. CI/CD — Jenkins Pipeline

The `Jenkinsfile` defines a multi-stage pipeline:

### Pipeline Stages

| Stage | Description | Condition |
|-------|-------------|-----------|
| **Initialize** | Prints config info | Always |
| **Install Dependencies** | `npm install` with proxy config | Always |
| **Run Tests** | `npm test` | `RUN_TESTS == true` |
| **Build Docker Image** | Builds image from `chatAssistant.Dockerfile` | `BUILD_IMAGE == true` |
| **Push Image To Azure ACR** | Tags & pushes to `itdgtpconreg01cnr.azurecr.io` | `PUSH_AZURE == true` |
| **Push Image To Platform Registry** | Tags & pushes to `shrdcomauingridacr01.azurecr.io` | `PUSH_PLATFORM_REGISTRY == true` |

### Pipeline Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `NODE_VERSION` | `22` | Node.js version |
| `APP_TAG` | `latest` | Local Docker image tag |
| `BRANCH_NAME` | `develop` | Git branch to build |
| `PROXY_HOST` | `172.22.33.174` | Corporate proxy host |
| `PROXY_PORT` | `3128` | Corporate proxy port |
| `HOST_DOCKER_REPO` | `172.22.176.195` | Nexus Docker registry |
| `PORT_DOCKER_REPO` | `8083` | Nexus Docker registry port |
| `ACR_SERVER` | `itdgtpconreg01cnr.azurecr.io` | Azure Container Registry |
| `PLATFORM_REGISTRY` | `shrdcomauingridacr01.azurecr.io` | Platform Registry |
| `COMAUCHATASSISTANT_TAG` | `latest` | Final pushed image tag |
| `RUN_TESTS` | `true` | Run npm tests |
| `BUILD_IMAGE` | `true` | Build Docker image |
| `PUSH_AZURE` | `false` | Push to Azure ACR |
| `PUSH_PLATFORM_REGISTRY` | `false` | Push to Platform Registry |
| `DEPLOY_SERVICE` | `false` | Deploy service |

### Jenkins Credentials Used

| Credential ID | Purpose |
|---------------|---------|
| `registry-pass` | Docker registry password |
| `proxy-pass` | Proxy authentication |
| `DOCKER_CONTENT_TRUST_ROOT_PASSPHRASE` | DCT root key |
| `DOCKER_CONTENT_TRUST_REPOSITORY_PASSPHRASE` | DCT repo key |
| `DCT_KEYS_PATH` | Path to DCT signing keys |
| `ingrid_acr_shared_registry` | Platform ACR credentials |
| `f54bada6-e0bc-4c30-9843-006c20c654da` | Azure ACR credentials |

---

## 13. How to Add a New API (Zero-Code)

To make the AI aware of a new backend endpoint:

### Step 1: Edit `api-registry.json`

Add a new object to the `"apis"` array:

```json
{
  "id": "get_all_workers",
  "name": "Get All Workers",
  "description": "Retrieves a list of all factory workers with their roles and assigned stations.",
  "method": "GET",
  "path": "/workers",
  "parameters": [],
  "responseExample": [
    { "id": 1, "name": "John Doe", "role": "Operator", "stationId": 5 }
  ],
  "keywords": ["workers", "employees", "factory staff", "operators"]
}
```

### Step 2: Reload (pick one)

- **Hot-reload** (no restart): `POST http://localhost:3000/api/registry/reload`
- **Restart server**: `npm start` or `docker-compose restart comauchatassistant`

### Step 3: Test

Ask the AI: *"Show me all workers"* — it will automatically route to your new API.

### Tips for Good API Definitions

- **`description`**: Write it clearly — the LLM reads this to decide when to use the API
- **`keywords`**: Add diverse trigger words users might say
- **`responseExample`**: Helps the LLM understand the data shape (optional but recommended)
- **`parameters`**: Document all path/query params with types and descriptions

---

## 14. Dependency Chains — Multi-Step Workflows

Dependency chains solve the problem of entity resolution — when a user refers to an entity by name/email/phone instead of an internal ID.

### Example: "Get purchase history for user with phone 555-1234"

```
Chain: purchases_by_user_phone
Step 1: Call get_all_users → filter by phone → extract userId → save as $resolvedUserId
Step 2: Call get_purchases_by_user with userId = $resolvedUserId
```

### Registered Chains

| Chain ID | Trigger | Steps |
|----------|---------|-------|
| `purchases_by_user_phone` | User identified by phone number | `get_all_users` (filter phone) → `get_purchases_by_user` |
| `purchases_by_user_email` | User identified by email | `get_all_users` (filter email) → `get_purchases_by_user` |
| `purchases_by_user_name` | User identified by name | `get_all_users` (filter name) → `get_purchases_by_user` |

### Chain Step Schema

```json
{
  "apiId": "get_all_users",
  "filterBy": "phone",
  "filterValueFrom": "userInput",
  "extractField": "id",
  "saveAs": "resolvedUserId"
}
```

### How Matching Works (`executor.js`)

The chain executor tokenizes the user's message and checks if any token (>2 chars) is a substring of the target field value in the fetched records. This is a fuzzy match approach.

---

## 15. Security Considerations

| Area | Current State | Recommendation |
|------|---------------|----------------|
| **Authentication** | JWT passed in request body, forwarded to backend as `Authorization: Bearer` header | Consider passing JWT via HTTP header from client |
| **Input validation** | Only checks `message` is non-empty | Add message length limits, rate limiting |
| **CORS** | Wide open (`cors()` with no config) | Restrict to known origins in production |
| **Proxy env vars** | Set in Dockerfile via build args | Ensure they're cleared after build (multi-stage) |
| **Docker image** | No `.dockerignore` | Add `.dockerignore` to exclude `.git`, `node_modules`, etc. |
| **API keys/secrets** | Managed via Jenkins credentials + env vars | Good practice — no secrets in code |
| **LLM prompt injection** | No sanitization of user input before LLM | Consider input sanitization for prompt injection defense |
| **Error exposure** | Raw error messages sent to client in some paths | Sanitize error messages in production |

---

## 16. Known Limitations & Improvement Areas

| Area | Description |
|------|-------------|
| **No request timeout** | Ollama calls in `core/ollama.js` have no timeout — a stuck model hangs the request forever |
| **No rate limiting** | `/api/chat` has no rate limiter — vulnerable to abuse |
| **No health check in Docker** | `docker-compose.yml` has no `healthcheck` for Ollama — app may start before Ollama is ready |
| **No `.dockerignore`** | `COPY . .` copies everything including `.git`, `node_modules` |
| **No test suite** | `npm test` has no tests defined |
| **No WebSocket** | Uses SSE (unidirectional) — cannot cancel in-flight requests |
| **Conversation not persisted** | Chat history exists only in frontend memory — lost on page refresh |
| **Model switching** | Frontend has model selector but the backend always uses `OLLAMA_MODEL` from env — model selection is not actually sent to the backend |
| **Single-threaded** | No clustering — single Node.js process handles all requests |
| **Chain matching** | Token-based fuzzy matching may produce false positives on common words |

---

## Quick Reference — npm Scripts

```bash
npm start       # Start production server (node server.js)
npm run dev     # Start with auto-reload (nodemon server.js)
```

---

*End of documentation.*
