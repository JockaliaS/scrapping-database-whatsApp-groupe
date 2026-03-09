mod config;
mod db;
mod errors;
mod models;
mod routes;
mod services;
mod ws;

use std::sync::Arc;
use std::time::Instant;

use axum::{
    extract::{Query, State, WebSocketUpgrade},
    http::{HeaderMap, Method},
    response::IntoResponse,
    routing::{delete, get, patch, post, put},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use jsonwebtoken::{decode, DecodingKey, Validation};
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use uuid::Uuid;

use crate::config::Config;
use crate::routes::auth::Claims;
use crate::routes::scan::ScanStore;
use crate::services::evolution::EvolutionService;
use crate::services::gemini::GeminiService;
use crate::ws::manager::WsManager;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub redis: Option<deadpool_redis::Pool>,
    pub config: Arc<Config>,
    pub gemini: Option<Arc<GeminiService>>,
    pub evolution: Option<Arc<EvolutionService>>,
    pub ws_manager: WsManager,
    pub scans: ScanStore,
    pub start_time: Instant,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let config = Config::from_env();
    let config = Arc::new(config);

    // Database
    let db = db::init_pool(&config.database_url).await;
    db::run_migrations(&db).await;
    db::seed_admin(&db, &config).await;

    // Redis
    let redis = match deadpool_redis::Config::from_url(&config.redis_url)
        .create_pool(Some(deadpool_redis::Runtime::Tokio1))
    {
        Ok(pool) => {
            tracing::info!("Redis pool created");
            Some(pool)
        }
        Err(e) => {
            tracing::warn!("Redis not available: {}", e);
            None
        }
    };

    // Gemini
    let gemini_key = get_config_value(&db, "gemini_api_key")
        .await
        .or_else(|| config.gemini_api_key.clone());
    let gemini = gemini_key.map(|key| {
        tracing::info!("Gemini API configured");
        Arc::new(GeminiService::new(key))
    });

    // Evolution API
    let evolution_key = get_config_value(&db, "evolution_api_key")
        .await
        .or_else(|| config.evolution_api_key.clone());
    let evolution = evolution_key.map(|key| {
        let url = config.evolution_api_url.clone();
        tracing::info!("Evolution API configured");
        Arc::new(EvolutionService::new(url, key))
    });

    let state = AppState {
        db,
        redis,
        config: config.clone(),
        gemini,
        evolution,
        ws_manager: WsManager::new(),
        scans: routes::scan::new_scan_store(),
        start_time: Instant::now(),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE, Method::OPTIONS])
        .allow_headers(Any);

    // Public routes
    let public_routes = Router::new()
        .route("/health", get(routes::health::health_check))
        .route("/auth/login", post(routes::auth::login))
        .route("/auth/register", post(routes::auth::register))
        .route("/webhook/hub-spoke", post(routes::webhook::hub_spoke_webhook))
        .route("/webhook/whatsapp/{user_id}", post(routes::webhook::per_user_webhook));

    // Authenticated routes
    let api_routes = Router::new()
        .route("/api/profile", get(profile_get).put(profile_update))
        .route("/api/profile/generate-keywords", post(profile_generate))
        .route("/api/groups", get(groups_list))
        .route("/api/groups/sync", post(groups_sync))
        .route("/api/groups/{id}/toggle", put(groups_toggle))
        .route("/api/opportunities", get(opportunities_list))
        .route("/api/opportunities/{id}", get(opportunities_get))
        .route("/api/opportunities/{id}/status", patch(opportunities_status))
        .route("/api/contacts/{phone}/history", get(contacts_history))
        .route("/api/scan/historical", post(scan_start))
        .route("/api/scan/status/{scan_id}", get(scan_status))
        .route("/api/whatsapp/connect", post(whatsapp_connect))
        .route("/api/whatsapp/qr", get(whatsapp_qr))
        .route("/api/whatsapp/status", get(whatsapp_status))
        .route("/api/whatsapp/disconnect", delete(whatsapp_disconnect))
        .route("/api/whatsapp/connect-existing", post(whatsapp_connect_existing))
        .route("/api/whatsapp/instances", get(whatsapp_instances))
        .route("/api/whatsapp/test-alert", post(whatsapp_test_alert));

    // Admin routes
    let admin_routes = Router::new()
        .route("/api/admin/users", get(admin_list_users))
        .route("/api/admin/users/{id}", patch(admin_update_user))
        .route("/api/admin/config", get(admin_get_config).put(admin_update_config))
        .route("/api/admin/logs", get(admin_get_logs))
        .route("/api/admin/hub-spoke-tokens", get(admin_list_tokens).post(admin_create_token))
        .route("/api/admin/hub-spoke-tokens/{id}", delete(admin_delete_token))
        .route("/api/admin/groups", post(admin_create_group));

    // WebSocket route
    let ws_route = Router::new().route("/ws", get(ws_handler));

    let app = Router::new()
        .merge(public_routes)
        .merge(api_routes)
        .merge(admin_routes)
        .merge(ws_route)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", config.port);
    tracing::info!("Starting Radar backend on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn get_config_value(db: &PgPool, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM system_config WHERE key = $1")
        .bind(key)
        .fetch_optional(db)
        .await
        .ok()
        .flatten()
}

// --- JWT extraction helper ---
fn extract_user_id(headers: &HeaderMap, jwt_secret: &str) -> Result<Uuid, errors::AppError> {
    let token = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| errors::AppError::Unauthorized("Missing token".into()))?;

    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| errors::AppError::Unauthorized("Invalid token".into()))?;

    data.claims
        .sub
        .parse::<Uuid>()
        .map_err(|_| errors::AppError::Unauthorized("Invalid user ID".into()))
}

fn extract_admin_id(headers: &HeaderMap, jwt_secret: &str) -> Result<Uuid, errors::AppError> {
    let token = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| errors::AppError::Unauthorized("Missing token".into()))?;

    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| errors::AppError::Unauthorized("Invalid token".into()))?;

    if data.claims.role != "admin" {
        return Err(errors::AppError::Forbidden("Admin access required".into()));
    }

    data.claims
        .sub
        .parse::<Uuid>()
        .map_err(|_| errors::AppError::Unauthorized("Invalid user ID".into()))
}

// --- Route handlers that extract JWT and delegate ---

async fn profile_get(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::profile::get_profile(State(state), user_id).await.map(|j| j.into_response())
}

async fn profile_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::Json<models::profile::ProfileUpdate>,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::profile::update_profile(State(state), user_id, body).await.map(|j| j.into_response())
}

async fn profile_generate(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::Json<models::profile::GenerateKeywordsRequest>,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::profile::generate_keywords(State(state), user_id, body).await.map(|j| j.into_response())
}

async fn groups_list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::groups::list_groups(State(state), user_id).await.map(|j| j.into_response())
}

async fn groups_sync(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::groups::sync_groups(State(state), user_id).await.map(|j| j.into_response())
}

async fn groups_toggle(
    State(state): State<AppState>,
    headers: HeaderMap,
    path: axum::extract::Path<Uuid>,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::groups::toggle_group(State(state), user_id, path).await.map(|j| j.into_response())
}

async fn opportunities_list(
    State(state): State<AppState>,
    Query(filter): Query<models::opportunity::OpportunityFilter>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::opportunities::list_opportunities(State(state), user_id, Query(filter)).await.map(|j| j.into_response())
}

async fn opportunities_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    path: axum::extract::Path<Uuid>,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::opportunities::get_opportunity(State(state), user_id, path).await.map(|j| j.into_response())
}

async fn opportunities_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    path: axum::extract::Path<Uuid>,
    body: axum::Json<models::opportunity::StatusUpdate>,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::opportunities::update_status(State(state), user_id, path, body).await.map(|j| j.into_response())
}

async fn contacts_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(phone): axum::extract::Path<String>,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;

    let contact = sqlx::query_as::<_, models::contact::Contact>(
        "SELECT * FROM contacts WHERE phone = $1"
    )
    .bind(&phone)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| errors::AppError::NotFound("Contact not found".into()))?;

    let opportunities = sqlx::query_as::<_, models::opportunity::Opportunity>(
        r#"SELECT o.* FROM opportunities o
           JOIN contacts c ON o.contact_id = c.id
           WHERE c.phone = $1 AND o.user_id = $2
           ORDER BY o.created_at DESC"#,
    )
    .bind(&phone)
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    Ok(axum::Json(serde_json::json!({
        "contact": contact,
        "opportunities": opportunities,
    })).into_response())
}

async fn scan_start(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::Json<routes::scan::ScanRequest>,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::scan::start_scan(State(state), user_id, body).await.map(|(s, j)| (s, j).into_response())
}

async fn scan_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    path: axum::extract::Path<Uuid>,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::scan::get_scan_status(State(state), user_id, path).await.map(|j| j.into_response())
}

async fn whatsapp_connect(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::whatsapp::connect(State(state), user_id).await.map(|j| j.into_response())
}

async fn whatsapp_qr(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::whatsapp::get_qr(State(state), user_id).await.map(|j| j.into_response())
}

async fn whatsapp_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::whatsapp::get_status(State(state), user_id).await.map(|j| j.into_response())
}

async fn whatsapp_disconnect(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::whatsapp::disconnect(State(state), user_id).await.map(|s| s.into_response())
}

async fn whatsapp_connect_existing(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::Json<routes::whatsapp::ConnectExistingRequest>,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::whatsapp::connect_existing(State(state), user_id, body).await.map(|j| j.into_response())
}

async fn whatsapp_instances(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, errors::AppError> {
    let _user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::whatsapp::list_evolution_instances(State(state)).await.map(|j| j.into_response())
}

async fn whatsapp_test_alert(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, errors::AppError> {
    let user_id = extract_user_id(&headers, &state.config.jwt_secret)?;
    routes::whatsapp::test_alert(State(state), user_id).await.map(|j| j.into_response())
}

// Admin routes
async fn admin_list_users(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, errors::AppError> {
    let admin_id = extract_admin_id(&headers, &state.config.jwt_secret)?;
    routes::admin::list_users(State(state), admin_id).await.map(|j| j.into_response())
}

async fn admin_update_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    path: axum::extract::Path<Uuid>,
    body: axum::Json<models::user::AdminUserUpdate>,
) -> Result<impl IntoResponse, errors::AppError> {
    let admin_id = extract_admin_id(&headers, &state.config.jwt_secret)?;
    routes::admin::update_user(State(state), admin_id, path, body).await.map(|j| j.into_response())
}

async fn admin_get_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, errors::AppError> {
    let admin_id = extract_admin_id(&headers, &state.config.jwt_secret)?;
    routes::admin::get_config(State(state), admin_id).await.map(|j| j.into_response())
}

async fn admin_update_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::Json<Vec<routes::admin::ConfigEntry>>,
) -> Result<impl IntoResponse, errors::AppError> {
    let admin_id = extract_admin_id(&headers, &state.config.jwt_secret)?;
    routes::admin::update_config(State(state), admin_id, body).await.map(|s| s.into_response())
}

async fn admin_get_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, errors::AppError> {
    let admin_id = extract_admin_id(&headers, &state.config.jwt_secret)?;
    routes::admin::get_logs(State(state), admin_id).await.map(|j| j.into_response())
}

async fn admin_list_tokens(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, errors::AppError> {
    let admin_id = extract_admin_id(&headers, &state.config.jwt_secret)?;
    routes::admin::list_hub_spoke_tokens(State(state), admin_id).await.map(|j| j.into_response())
}

async fn admin_create_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::Json<routes::admin::CreateTokenRequest>,
) -> Result<impl IntoResponse, errors::AppError> {
    let admin_id = extract_admin_id(&headers, &state.config.jwt_secret)?;
    routes::admin::create_hub_spoke_token(State(state), admin_id, body).await.map(|(s, j)| (s, j).into_response())
}

async fn admin_delete_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    path: axum::extract::Path<Uuid>,
) -> Result<impl IntoResponse, errors::AppError> {
    let admin_id = extract_admin_id(&headers, &state.config.jwt_secret)?;
    routes::admin::delete_hub_spoke_token(State(state), admin_id, path).await.map(|s| s.into_response())
}

async fn admin_create_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::Json<routes::admin::CreateGroupRequest>,
) -> Result<impl IntoResponse, errors::AppError> {
    let admin_id = extract_admin_id(&headers, &state.config.jwt_secret)?;
    routes::admin::create_group(State(state), admin_id, body).await.map(|(s, j)| (s, j).into_response())
}

// WebSocket handler
#[derive(Deserialize)]
struct WsQuery {
    token: String,
}

async fn ws_handler(
    State(state): State<AppState>,
    Query(query): Query<WsQuery>,
    ws: WebSocketUpgrade,
) -> Result<impl IntoResponse, errors::AppError> {
    let data = decode::<Claims>(
        &query.token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| errors::AppError::Unauthorized("Invalid token".into()))?;

    let user_id: Uuid = data
        .claims
        .sub
        .parse()
        .map_err(|_| errors::AppError::Unauthorized("Invalid user ID".into()))?;

    Ok(ws.on_upgrade(move |socket| handle_ws(socket, state, user_id)))
}

async fn handle_ws(
    socket: axum::extract::ws::WebSocket,
    state: AppState,
    user_id: Uuid,
) {
    let (mut ws_sink, mut ws_stream) = socket.split();

    let mut rx = state.ws_manager.add_connection(user_id).await;

    // Forward messages from channel to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sink
                .send(axum::extract::ws::Message::Text(msg.into()))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    // Read from WebSocket (just to detect disconnection)
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(_)) = ws_stream.next().await {}
    });

    // Wait for either task to complete
    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }

    // Note: cleanup happens when the sender is dropped
    tracing::info!("WebSocket disconnected for user {}", user_id);
}

use serde::Deserialize;
