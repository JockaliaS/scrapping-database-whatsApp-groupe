# ============================================================
# Stage 1: Build dependencies (cached unless Cargo.toml changes)
# ============================================================
FROM rust:1.83-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# ============================================================
# Stage 2: Build application (only recompiles our code)
# ============================================================
FROM deps AS builder
COPY src ./src
RUN touch src/main.rs && cargo build --release

# ============================================================
# Stage 3: Runtime — minimal image
# ============================================================
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates libssl3 curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/radar-backend /usr/local/bin/radar-backend
COPY migrations ./migrations
ENV RUST_LOG=info
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1
EXPOSE 8000
CMD ["radar-backend"]
