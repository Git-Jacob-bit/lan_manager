from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .database import engine, Base
from .routers import machines, metrics, actions # Importujesz swoje routery

# --- KONFIGURACJA STARTOWA ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(title="LAN Machine Manager API", lifespan=lifespan)

# --- KONFIGURACJA CORS (Dla Reacta) ---
# Bez tego przeglądarka zablokuje zapytania z portu Vite (np. 5173) do FastAPI (8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # W produkcji zmieniasz na konkretny IP frontendu
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- PODPIĘCIE ROUTERÓW ---
app.include_router(machines.router)
app.include_router(metrics.router)
app.include_router(actions.router)

@app.get("/")
async def root():
    return {"status": "ok", "message": "Backend FastAPI w trybie Headless działa prawidłowo!"}