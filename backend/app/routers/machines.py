from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import datetime, timezone
from typing import List, Optional

# Importy z katalogu wyżej (..)
from ..database import get_db
from ..models import Machine, MetricSnapshot  # <-- DODANO MetricSnapshot
from ..schemas import MachineResponse

# Tworzymy router dla bazowych operacji na maszynach
router = APIRouter(prefix="/machines", tags=["Machines"])

@router.get("/", response_model=List[MachineResponse])
async def get_machines(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Machine))
    machines = result.scalars().all()

    now = datetime.now(timezone.utc)
    changes_made = False

    for machine in machines:
        # Sprawdzamy, czy maszyna od ponad 10 sekund nic nie wysłała
        if (now - machine.last_seen).total_seconds() > 10:
            if machine.status != "offline":
                machine.status = "offline"
                changes_made = True

    if changes_made:
        await db.commit()

    return machines


# Frontend i Agent używają tego endpointu do rejestracji / aktualizacji IP
@router.post("/")
async def register_machine(name: str, ip: str, mac: str, tailscale_ip: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query = select(Machine).where(Machine.mac == mac)
    result = await db.execute(query)
    existing_machine = result.scalars().first()

    if existing_machine:
        # Maszyna już istnieje, aktualizujemy jej dane
        existing_machine.name = name
        existing_machine.ip = ip
        existing_machine.tailscale_ip = tailscale_ip
        existing_machine.status = "online"
        existing_machine.last_seen = datetime.now(timezone.utc)
        
        await db.commit()
        await db.refresh(existing_machine)
        return existing_machine
    else:
        # Nowa maszyna - dodajemy do bazy
        new_machine = Machine(
            name=name, 
            ip=ip, 
            mac=mac, 
            tailscale_ip=tailscale_ip, 
            status="online"
        )
        db.add(new_machine)
        await db.commit()
        await db.refresh(new_machine)
        return new_machine

@router.get("/{mac}")
async def get_machine(mac: str, db: AsyncSession = Depends(get_db)):
    # 1. Szukamy maszyny w bazie danych po adresie MAC
    result = await db.execute(select(Machine).where(Machine.mac == mac))
    machine = result.scalars().first()
    
    # Jeśli maszyna nie istnieje, zwracamy błąd 404
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    # 2. Szukamy najświeższych metryk dla tej maszyny, aby pobrać listę kontenerów (dockers)
    metric_query = (
        select(MetricSnapshot)
        .where(MetricSnapshot.machine_id == machine.id)
        .order_by(desc(MetricSnapshot.timestamp))
        .limit(1)
    )
    metric_result = await db.execute(metric_query)
    latest_metric = metric_result.scalars().first()
    
    # 3. Tworzymy słownik łączący dane maszyny z najnowszą listą dockers.
    # Używamy słownika, aby FastAPI łatwo zamieniło go na JSON dla Reacta.
    machine_data = {
        "id": machine.id,
        "name": machine.name,
        "ip": machine.ip,
        "tailscale_ip": machine.tailscale_ip,
        "mac": machine.mac,
        "status": machine.status,
        "last_seen": machine.last_seen,
        # Doklejamy kontenery, jeśli istnieją. W przeciwnym wypadku pusta lista.
        "dockers": latest_metric.dockers if latest_metric and latest_metric.dockers else []
    }
    
    return machine_data