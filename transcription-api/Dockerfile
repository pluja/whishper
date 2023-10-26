FROM python:3.11-slim

WORKDIR /app

RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get -qq update \
    && apt-get -qq install --no-install-recommends \
    ffmpeg curl\
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements.txt
RUN pip3 install -r requirements.txt
RUN pip3 install python-multipart

COPY . .

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
CMD ["python3", "healthcheck.py"]

EXPOSE 8000
CMD ["python3", "main.py"]