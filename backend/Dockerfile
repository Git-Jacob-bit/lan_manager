# Używamy lekkiego obrazu Pythona
FROM python:3.11-slim

# Blokujemy tworzenie plików .pyc i wymuszamy natychmiastowe wypisywanie logów
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Ustawiamy katalog roboczy
WORKDIR /app

# Instalujemy pakiety systemowe wymagane przez niektóre biblioteki Pythona (np. asyncpg)
RUN apt-get update \
    && apt-get install -y gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Kopiujemy najpierw plik z zależnościami i je instalujemy (optymalizacja cache Dockera)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Kopiujemy resztę kodu aplikacji
COPY . .

# Uruchamiamy serwer developerski uvicorn z włączonym hot-reload
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
