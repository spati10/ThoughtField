# ThoughtField

> Seed any text. Watch 25 living agents simulate a world. Predict what happens next.

ThoughtField is an open-source social simulation engine built on the [Stanford Generative Agents](https://arxiv.org/abs/2304.03442) architecture. You paste a news article, policy document, or any text — ThoughtField generates a cast of diverse AI agents with unique personalities, memories, and beliefs, drops them into a shared world, and lets them live, talk, argue, and react. The emergent behavior of 25 minds produces a structured prediction report.

---

## How it works

```
Seed text  →  Extract world state  →  Generate N personas
     →  Agents live in parallel  →  Memories accumulate
          →  Reflections form  →  Emergent behaviors surface
               →  Prediction report
```

Every agent has three cognitive layers, mirroring the Stanford paper:

- **Memory stream** — every observation, conversation, and reflection stored in ChromaDB with semantic retrieval scored by recency × importance × relevance
- **Reflection engine** — when enough important things happen, agents synthesize raw observations into higher-level insights that reshape all future decisions
- **Daily planning** — each morning agents generate a full hourly plan; injected world events cause replanning mid-day

---

## Demo

| Seed | Question | Result |
|---|---|---|
| University cuts arts funding 40%, faculty votes no-confidence | What happens in 7 days? | Student strike forms by day 3, faculty solidarity forces emergency negotiations |
| City rezones waterfront for luxury development | Will residents resist? | Grassroots coalition successfully delays permits through media pressure |
| Tech company lays off 15% via email, CEO bonus leaked | How does workforce respond? | Viral LinkedIn post triggers board inquiry within 2 weeks |

---

## Features

- **Any seed text** — news articles, policy docs, fictional stories, social media threads, research briefs
- **Auto-generated personas** — N diverse agents from all sides of every conflict, with occupations, beliefs, memories, and relationships seeded from your text
- **Live town map** — Canvas 2D visualization of agents moving, talking, and reacting in real time
- **Speech bubbles** — agents' exact words appear above them as they speak to each other
- **God mode event injection** — push any world event mid-simulation and watch all agents react
- **Agent memory panel** — click any agent to see their full memory stream, reflections, and daily plan
- **Prediction report** — structured output with confidence score, key drivers, alternative scenarios, faction dynamics, and uncertainty notes

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 14)                  │
│   SeedForm → /sim/[id] live canvas → /report/[id]        │
│   WebSocket client · Zustand state · Canvas 2D            │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP + WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                   Backend (FastAPI)                       │
│   POST /simulate  ·  WS /ws/sim/{id}  ·  GET /report     │
│   POST /event (god mode)  ·  GET /status                  │
└────┬──────────────┬──────────────────────┬──────────────┘
     │              │                      │
┌────▼────┐   ┌─────▼──────┐   ┌──────────▼──────────┐
│  Redis  │   │  ChromaDB  │   │   OpenAI API         │
│ pub/sub │   │  (memory   │   │ gpt-4o-mini (ticks)  │
│  state  │   │  vectors)  │   │ gpt-4o (reflect+     │
└─────────┘   └────────────┘   │         report)      │
                                └─────────────────────┘
```

### Simulation engine

Each agent runs a full cognitive tick every 2 real seconds (= 10 sim-minutes):

```
perceive → retrieve memories → sync plan → decide action
→ move on grid → speak to nearby agents → store observation
→ maybe reflect (background task)
```

All 25 agents tick in parallel via `asyncio.gather()`. State is broadcast to the frontend over Redis pub/sub → WebSocket every tick.

---

## Project structure

```
ThoughtField/
├── backend/
│   ├── app/
│   │   ├── main.py                   # FastAPI entry point
│   │   ├── api/
│   │   │   ├── simulate.py           # POST /simulate
│   │   │   ├── report.py             # GET /report/{id}
│   │   │   ├── event.py              # POST /event (god mode)
│   │   │   └── ws.py                 # WebSocket /ws/sim/{id}
│   │   ├── agents/
│   │   │   ├── agent.py              # Agent class + tick loop
│   │   │   ├── memory.py             # MemoryStream (ChromaDB)
│   │   │   └── cognition.py          # plan / act / reflect / speak
│   │   ├── engine/
│   │   │   ├── simulation.py         # Main simulation runner
│   │   │   ├── clock.py              # SimClock (1s = 10 sim-min)
│   │   │   └── world.py              # 40×40 tile map + areas
│   │   ├── ingestion/
│   │   │   ├── extractor.py          # Seed text → world state
│   │   │   └── personas.py           # World state → N personas
│   │   ├── report/
│   │   │   └── reporter.py           # ReportAgent
│   │   └── db/
│   │       ├── redis_client.py       # Redis singleton
│   │       └── chroma_client.py      # ChromaDB singleton
│   ├── requirements.txt
│   └── .env
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx              # Homepage / seed form
│       │   ├── sim/[id]/page.tsx     # Live simulation view
│       │   └── report/[id]/page.tsx  # Prediction report
│       ├── components/
│       │   ├── TownMap.tsx           # Canvas 2D agent map
│       │   ├── AgentPanel.tsx        # Agent list sidebar
│       │   ├── EventFeed.tsx         # Live speech feed
│       │   ├── InjectEvent.tsx       # God mode input
│       │   ├── SimClock.tsx          # Time + progress bar
│       │   ├── SeedForm.tsx          # Reusable seed input
│       │   └── ReportView.tsx        # Reusable report display
│       ├── hooks/
│       │   ├── useSimSocket.ts       # WebSocket → Zustand
│       │   └── useSimStore.ts        # Global state
│       └── lib/
│           ├── api.ts                # Typed API client
│           └── types.ts              # Shared TypeScript types
└── docker-compose.yml
```

---

## Getting started

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker (for Redis)
- OpenAI API key with gpt-4o access

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/ThoughtField.git
cd ThoughtField
```

### 2. Backend setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate        # Mac/Linux
venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Open .env and add your OPENAI_API_KEY
```

### 3. Frontend setup

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

### 4. Start services

You need three terminals:

**Terminal 1 — Redis:**
```bash
docker run -d -p 6379:6379 --name thoughtfield-redis redis:alpine
```

**Terminal 2 — Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 3 — Frontend:**
```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Configuration

All backend settings are in `backend/.env`:

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | required | Your OpenAI API key |
| `AGENT_MODEL` | `gpt-4o-mini` | Model for agent action decisions (called every tick) |
| `REFLECT_MODEL` | `gpt-4o` | Model for planning, reflection, speech |
| `REPORT_MODEL` | `gpt-4o` | Model for final prediction report |
| `SIM_TICK_SECONDS` | `2.0` | Real seconds per simulation tick |
| `SIM_TICK_MINUTES` | `10` | Sim minutes that advance per tick |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `CHROMA_PATH` | `./chroma_db` | ChromaDB persistence directory |

### Cost estimates

| Setup | Cost per simulation |
|---|---|
| 10 agents, 2 days (dev) | ~$0.05–0.15 |
| 20 agents, 3 days (standard) | ~$0.30–0.80 |
| 50 agents, 5 days (full) | ~$1.50–4.00 |
| Local Ollama (llama3.1:8b) | Free |

**Tip:** Set `AGENT_MODEL=gpt-4o-mini` and `REFLECT_MODEL=gpt-4o-mini` during development. Switch `REFLECT_MODEL` and `REPORT_MODEL` to `gpt-4o` only for final runs.

---

## API reference

### Start a simulation

```http
POST /api/simulate
Content-Type: application/json

{
  "seed": "Your news article or text here...",
  "question": "What happens in the next 7 days?",
  "n_agents": 20,
  "sim_days": 3
}
```

Response:
```json
{
  "sim_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "initializing",
  "n_agents": 20,
  "sim_days": 3
}
```

### Poll status

```http
GET /api/simulate/{sim_id}/status
```

### Inject a world event (god mode)

```http
POST /api/event
Content-Type: application/json

{
  "sim_id": "550e8400-...",
  "event_text": "The university president just resigned live on camera."
}
```

### Get prediction report

```http
GET /api/report/{sim_id}
```

### Live WebSocket stream

```
WS ws://localhost:8000/ws/sim/{sim_id}
```

Receives a JSON snapshot every tick with agent positions, speeches, sim time, and events.

---

## The cognitive architecture

Based on [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442) (Park et al., Stanford 2023).

### Memory retrieval formula

```
score = recency + importance + relevance

recency    = 0.995 ^ age_in_hours          (exponential decay)
importance = LLM-rated 1–10, normalized    (gpt-4o-mini per memory)
relevance  = cosine_similarity(query, memory_embedding)
```

### Reflection trigger

```python
if sum(importance for memory in last_20_memories) >= 100:
    trigger_reflection()
```

High-importance days (protests, crises, confrontations) trigger reflection after ~14 observations. Quiet days take ~33. Reflections are stored back into the memory stream and influence all future decisions.

### Model usage per tick per agent

| Call | Model | Frequency |
|---|---|---|
| Rate importance | gpt-4o-mini | Every observation |
| Decide action | gpt-4o-mini | Every tick |
| Generate speech | gpt-4o | When speaking |
| Daily plan | gpt-4o | Once per sim-day |
| Reflect | gpt-4o | When threshold hit |
| Final report | gpt-4o | Once per simulation |

---

## Running with Docker Compose

Start the entire stack with one command:

```bash
docker compose up --build
```

This starts Redis, the FastAPI backend, and the Next.js frontend together.

---

## Roadmap

- [ ] Frontend UI redesign — logo, polished layouts, animations
- [ ] Local LLM support — full Ollama integration for zero-cost runs
- [ ] Shareable simulation links — public URLs for each completed sim
- [ ] Custom world maps — upload your own tile map JSON
- [ ] Agent conversation threading — track full dialogue trees between specific agents
- [ ] Scenario presets — one-click setup for common simulation types
- [ ] Export — download simulation as JSON, PDF report, or video replay
- [ ] Multi-language seed support — run simulations from non-English source text

---

## Academic foundation

ThoughtField implements the architecture described in:

> Park, J. S., O'Brien, J. C., Cai, C. J., Morris, M. R., Liang, P., & Bernstein, M. S. (2023). **Generative Agents: Interactive Simulacra of Human Behavior.** *UIST 2023.* https://arxiv.org/abs/2304.03442

The memory stream, reflection engine, and planning modules follow the paper's design directly. The seed ingestion pipeline, world state extraction, prediction report generation, and live visualization are original extensions.

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Acknowledgements

- [Stanford HAI](https://hai.stanford.edu/) — Generative Agents paper and original Smallville simulation
- [CAMEL-AI](https://github.com/camel-ai/camel) — multi-agent framework inspiration
- [ChromaDB](https://www.trychroma.com/) — vector storage for agent memory
- [FastAPI](https://fastapi.tiangolo.com/) — async Python web framework
- [Next.js](https://nextjs.org/) — React framework

---

<div align="center">
  <sub>Built with the Stanford Generative Agents architecture · MIT License</sub>
</div>