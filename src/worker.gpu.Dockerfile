FROM golang:alpine as builder

ENV DEBIAN_FRONTEND noninteractive
WORKDIR /app

COPY . .
RUN go mod tidy && apk add upx && \
    GOOS=linux go build -o anysub . && \
    upx anysub && \
    chmod a+rx anysub

FROM pluja/whisperx-api:latest

COPY --from=builder /app/anysub /usr/bin/anysub
COPY worker.entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]