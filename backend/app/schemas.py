from pydantic import BaseModel
from typing import List, Any, Optional
from datetime import datetime

# --- METRYKI ---
class MetricCreate(BaseModel):
    cpu_usage: float
    ram_usage: float
    disk_usage: float
    net_sent: float = 0.0
    net_recv: float = 0.0
    disk_health: str = "OK"
    dockers: Optional[List[Any]] = []

class MetricResponse(BaseModel):
    id: int
    timestamp: datetime
    cpu_usage: float
    ram_usage: float
    disk_usage: float
    net_sent: float
    net_recv: float
    disk_health: str
    dockers: Optional[List[Any]] = []

    class Config:
        from_attributes = True

# --- MASZYNY ---
class MachineResponse(BaseModel):
    id: int
    name: str
    ip: str
    mac: str
    tailscale_ip: Optional[str] = None
    status: str
    last_seen: datetime

    class Config:
        from_attributes = True