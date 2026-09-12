# Two stages so one Render Free service serves the API and the built UI.
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.26-alpine AS api
WORKDIR /src
COPY go.mod ./
COPY server/ ./server/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/preflight ./server/cmd/preflight

FROM alpine:3.21
RUN adduser -D -u 10001 preflight
WORKDIR /app
COPY --from=api /out/preflight /app/preflight
COPY --from=web /app/web/dist /app/web/dist
# Prepared, read-only data. The raw Olist CSVs are not shipped.
COPY data/*.json /app/data/
USER preflight
ENV PORT=8080 DATA_DIR=/app/data WEB_DIR=/app/web/dist
EXPOSE 8080
CMD ["/app/preflight"]
