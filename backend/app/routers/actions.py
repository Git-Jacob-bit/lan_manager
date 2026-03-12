from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
import socket
import binascii

from ..database import get_db
from ..models import Machine

# W starym kodzie te endpointy miały prefix /api/machines, więc go zachowujemy, 
# żeby frontend i agent nie przestały działać.
router = APIRouter(prefix="/api/machines", tags=["Actions"])


@router.post("/{mac}/wake")
async def wake_machine(mac: str):
    clean_mac = mac.replace(":", "").replace("-", "")
    if len(clean_mac) != 12:
        raise HTTPException(status_code=400, detail="Nieprawidłowy format adresu MAC")

    try:
        mac_bytes = binascii.unhexlify(clean_mac)
        magic_packet = b'\xff' * 6 + mac_bytes * 16

        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            # Jeśli wcześniej używałeś bind (np. do 192.168.0.4), dodaj tę linijkę tutaj:
            # sock.bind(('192.168.0.4', 0))
            sock.sendto(magic_packet, ('255.255.255.255', 9))
            
        return {"status": "success", "message": f"Wysłano sygnał budzenia do {mac}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Błąd Wake-on-LAN: {str(e)}")


@router.post("/{mac}/power")
async def perform_power_action(mac: str, request: Request, db: AsyncSession = Depends(get_db)):
    data = await request.json()
    action = data.get("action") # Oczekujemy "shutdown" lub "reboot"

    result = await db.execute(select(Machine).where(Machine.mac == mac))
    machine = result.scalars().first()
    
    if not machine:
        raise HTTPException(status_code=404, detail="Maszyna nie znaleziona")

    # Wysyłamy prośbę do Agenta na porcie 8001
    agent_url = f"http://{machine.ip}:8001/machine/power?action={action}"
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(agent_url, timeout=5.0)
            resp.raise_for_status()
            return {"status": "success", "message": f"Rozkaz {action} wysłany do maszyny."}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Błąd komunikacji z Agentem: {str(e)}")


@router.post("/{mac}/docker/action")
async def perform_docker_action(mac: str, request: Request, db: AsyncSession = Depends(get_db)):
    data = await request.json()
    container_name = data.get("container_name")
    action = data.get("action") # start, stop, restart

    result = await db.execute(select(Machine).where(Machine.mac == mac))
    machine = result.scalars().first()
    
    if not machine:
        raise HTTPException(status_code=404, detail="Maszyna nie znaleziona")
        
    agent_url = f"http://{machine.ip}:8001/docker/action?name={container_name}&action={action}"
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(agent_url, timeout=10.0)
            resp.raise_for_status()
            return {"status": "success"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Błąd komunikacji z Agentem: {str(e)}")