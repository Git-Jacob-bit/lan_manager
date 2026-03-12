import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

# Pobieramy URL z docker-compose, a jeśli go nie ma (np. lokalnie), używamy domyślnego
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:password123@db:5432/lan_manager")

engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
Base = declarative_base()

# Funkcja dostarczająca sesję bazy danych do naszych endpointów
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
