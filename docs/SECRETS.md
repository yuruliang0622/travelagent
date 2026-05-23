# Secrets And Environment

## Local Files

- Frontend: copy `.env.example` to `.env.local`.
- Backend: copy `backend/.env.example` to `backend/.env`.

Do not commit real `.env` files.

## Google Cloud Secrets

Store these in Secret Manager:

- `MONGODB_URI`
- `MONGODB_MCP_SERVER_URL`, if hosted separately
- `GOOGLE_MAPS_API_KEY`
- `OPENWEATHER_API_KEY`, if used
- OAuth client secrets, if login is added

Vertex AI should use the Cloud Run service account instead of static keys. MongoDB Atlas should use a narrow database user and IP/network access appropriate for the deployed service.

## Cloud Run Environment

Recommended non-secret variables:

- `APP_ENV=production`
- `FRONTEND_ORIGIN=https://<web-service-url>`
- `GOOGLE_CLOUD_PROJECT=<project-id>`
- `GOOGLE_CLOUD_LOCATION=us-central1`
- `GEMINI_MODEL=gemini-2.5-flash`
- `MONGODB_DATABASE=trip_agent`
- `MONGODB_VECTOR_INDEX=trip_agent_vector_index`
- `ENABLE_LIVE_GEMINI=true`
- `ENABLE_LIVE_MAPS=true`
- `ENABLE_MONGODB_MCP=true`

Recommended service account roles:

- `Vertex AI User`
- `Secret Manager Secret Accessor`
- `Logs Writer`
