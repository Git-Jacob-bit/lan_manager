from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .database import Base

class Machine(Base):
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    ip = Column(String, nullable=False)
    tailscale_ip = Column(String, nullable=True) # <-- NOWA KOLUMNA (Może być pusta, jeśli ktoś nie ma Tailscale)
    mac = Column(String, unique=True, nullable=False)
    status = Column(String, default="offline")
    last_seen = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relacja do tabeli z metrykami (usunięcie maszyny usunie też jej metryki)
    metrics = relationship("MetricSnapshot", back_populates="machine", cascade="all, delete-orphan")


class MetricSnapshot(Base):
    __tablename__ = "metric_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    # Klucz obcy wskazujący na konkretną maszynę
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False)
    
    # Czas pomiaru
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # --- PODSTAWOWE DANE TELEMETRYCZNE ---
    cpu_usage = Column(Float, nullable=False)
    ram_usage = Column(Float, nullable=False)
    disk_usage = Column(Float, nullable=False)

    # --- NOWE METRYKI (Sieć, Dysk, Docker) ---
    net_sent = Column(Float, default=0.0)      # Wysłane dane
    net_recv = Column(Float, default=0.0)      # Pobrane dane
    disk_health = Column(String, default="OK") # Status dysku (np. OK, Warning)
    dockers = Column(JSON, default=list)       # Lista kontenerów w formacie JSON

    # Odniesienie zwrotne do maszyny
    machine = relationship("Machine", back_populates="metrics")
