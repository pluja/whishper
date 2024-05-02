FROM python:3.12-slim

WORKDIR /app

COPY . .

RUN export DEBIAN_FRONTEND=noninteractive && \
    apt-get -qq update && \
    apt-get -qq install ffmpeg curl git && \
    rm -rf /var/lib/apt/lists/* &&\
    pip install --upgrade pip && \
    pip install -r requirements.txt &&\
    pip install python-multipart && \
    rm -rf /root/.cache/pip/

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
    CMD ["python3", "healthcheck.py"]

EXPOSE 8000
CMD ["python3", "main.py"]
