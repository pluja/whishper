FROM devopsworks/golang-upx:latest as builder

ENV DEBIAN_FRONTEND noninteractive
WORKDIR /app

COPY . .
RUN go mod tidy
RUN GOOS=linux go build -o anysub . && \
    upx anysub

RUN chmod a+rx anysub

FROM pluja/whisperx-api:latest

COPY --from=builder /app/anysub /usr/bin/anysub
COPY worker.entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]