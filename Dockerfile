FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1 \
    PORT=7860 \
    SDL_AUDIODRIVER=dummy \
    IS_CLOUD=true \
    TF_ENABLE_ONEDNN_OPTS=0 \
    GRPC_POLL_STRATEGY=epoll1 \
    LD_PRELOAD="/usr/lib/x86_64-linux-gnu/libtcmalloc_minimal.so.4"

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    libglib2.0-0 \
    libasound2 \
    libtcmalloc-minimal4 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd -m -u 1000 user
RUN chown -R user:user /app
USER user

EXPOSE 7860

CMD ["python", "-m", "flask", "run", "--host=0.0.0.0", "--port=7860"]