FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY data/ ./data/

# Expose Flask (5000) and Syslog UDP (515)
EXPOSE 5000
EXPOSE 515/udp

CMD ["python", "backend/app.py"]
