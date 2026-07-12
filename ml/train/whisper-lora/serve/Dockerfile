# STT serving image (UNTESTED UNTIL DATA — no model exists to bake in yet).
#
# CPU-only base for smoke tests. For GPU serving on Modal/RunPod, swap the base
# image for nvidia/cuda:12.2.2-cudnn8-runtime-ubuntu22.04 + python3.11 (see
# README.md) or use Modal's image builder instead of this Dockerfile.
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

# Mount or COPY the converted CTranslate2 model at /model.
ENV MODEL_DIR=/model \
    DEVICE=cpu \
    PORT=8000

EXPOSE 8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
