FROM node:20-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV VITE_API_URL=https://api.radar.jockaliaservices.fr
ENV VITE_WS_URL=wss://api.radar.jockaliaservices.fr
RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache curl
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -f http://localhost:80/health || exit 1
EXPOSE 80
