FROM golang:alpine as builder

ENV DEBIAN_FRONTEND noninteractive
WORKDIR /app

COPY . .
RUN go mod tidy && apk add upx && \
    GOOS=linux go build -o anysub . && \
    upx anysub && \
    chmod a+rx anysub

# Certificates and timezone data stage
FROM alpine:3.19 as certs
RUN apk update && apk add --no-cache ca-certificates tzdata

# Start from a complete image and include timezone data
FROM scratch
COPY --from=certs /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
# Include timezone data
COPY --from=certs /usr/share/zoneinfo /usr/share/zoneinfo

WORKDIR /app
COPY --from=builder /app/anysub /app/anysub

# Ensure the app uses the right timezone by setting the TZ environment variable
ENV TZ="Europe/Warsaw"
ENV PATH="/app:$PATH"

EXPOSE 1337
CMD ["/app/anysub"]