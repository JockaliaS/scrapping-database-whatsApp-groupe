# ============================================================
# Stage 1: cargo-chef — compute dependency recipe
# ============================================================
FROM rust:1.77-slim AS chef
RUN cargo install cargo-chef --locked
WORKDIR /app

# ============================================================
# Stage 2: Prepare — generate recipe.json (dependency lock)
# ============================================================
FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo chef prepare --recipe-path recipe.json

# ============================================================
# Stage 3: Build dependencies (cached unless Cargo.toml changes)
# ============================================================
FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
# This layer is cached as long as dependencies don't change
RUN cargo chef cook --release --recipe-path recipe.json

# Now copy actual source and build (only recompiles our code)
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

# ============================================================
# Stage 4: Runtime — minimal image
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
