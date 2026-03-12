from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from datetime import datetime, timezone, timedelta
from typing import List

# Importy z katalogu wyżej (..)
from ..database import get_db
from ..models import Machine, MetricSnapshot
from ..schemas import MetricCreate, MetricResponse

# Tworzymy router. Wszystkie endpointy tutaj będą zaczynać się od /machines
router = APIRouter(prefix="/machines", tags=["Metrics"])

@router.get("/{mac}/metrics/latest", response_model=MetricResponse)
async def get_latest_metrics(mac: str, db: AsyncSession = Depends(get_db)):
    query = select(Machine).where(Machine.mac == mac)
    result = await db.execute(query)
    machine = result.scalars().first()

    if not machine:
        raise HTTPException(status_code=404, detail="Maszyna nie znaleziona")

    metric_query = select(MetricSnapshot).where(
        MetricSnapshot.machine_id == machine.id
    ).order_by(MetricSnapshot.timestamp.desc()).limit(1)
    
    metric_result = await db.execute(metric_query)
    latest_metric = metric_result.scalars().first()

    if not latest_metric:
        raise HTTPException(status_code=404, detail="Brak metryk dla tej maszyny")

    return latest_metric


@router.get("/{mac}/metrics", response_model=List[MetricResponse])
async def get_metrics_history(mac: str, limit: int = 50, db: AsyncSession = Depends(get_db)):
    query = select(Machine).where(Machine.mac == mac)
    result = await db.execute(query)
    machine = result.scalars().first()

    if not machine:
        raise HTTPException(status_code=404, detail="Maszyna nie znaleziona")

    metric_query = select(MetricSnapshot).where(
        MetricSnapshot.machine_id == machine.id
    ).order_by(MetricSnapshot.timestamp.desc()).limit(limit)
    
    metric_result = await db.execute(metric_query)
    metrics = metric_result.scalars().all()

    return metrics


@router.post("/{mac}/metrics")
async def add_machine_metrics(mac: str, metrics: MetricCreate, db: AsyncSession = Depends(get_db)):
    query = select(Machine).where(Machine.mac == mac)
    result = await db.execute(query)
    machine = result.scalars().first()

    if not machine:
        raise HTTPException(status_code=404, detail="Maszyna nie zarejestrowana")

    new_metric = MetricSnapshot(
            machine_id=machine.id,
            cpu_usage=metrics.cpu_usage,
            ram_usage=metrics.ram_usage,
            disk_usage=metrics.disk_usage,
            net_sent=metrics.net_sent,
            net_recv=metrics.net_recv,
            disk_health=metrics.disk_health,
            dockers=metrics.dockers
        )
    db.add(new_metric)

    machine.last_seen = datetime.now(timezone.utc)
    machine.status = "online"

    # Czyszczenie starych danych (Retencja: 1 godzina - zgodnie z Twoim oryginalnym kodem)
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=1)
    delete_query = delete(MetricSnapshot).where(
        MetricSnapshot.machine_id == machine.id,
        MetricSnapshot.timestamp < cutoff_time
    )
    await db.execute(delete_query)

    await db.commit()
    return {"status": "ok", "message": "Metryki zapisane, stare dane wyczyszczone"}


# Ten endpoint z oryginalnego main.py też wrzucamy tutaj (szybkie wyłączenie maszyny)
@router.post("/{mac}/offline")
async def mark_machine_offline(mac: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Machine).where(Machine.mac == mac))
    machine = result.scalars().first()

    if machine:
        machine.status = "offline"
        await db.commit()
        print(f"⚠️ Maszyna {mac} zgłosiła wyłączenie. Status zmieniony na OFFLINE.")
    return {"status": "success"}