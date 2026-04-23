import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import get_settings
from app.routers import impact as impact_router
from app.routers import ingest as ingest_router
from app.routers import interview as interview_router
from app.routers import query as query_router
from app.routers import repos as repos_router

# Configure structured logging for the 'postmortem' logger tree. `errors.py`
# logs via `logging.getLogger('postmortem')`; this module adds a single stream
# handler with a timestamped format so operators can diff request lifecycles
# across Cloud Run's log stream.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
logging.getLogger("postmortem").setLevel(logging.INFO)


class HealthResponse(BaseModel):
    status: str
    service: str
    environment: str


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Postmortem API",
        description="Decision archaeology for any codebase.",
        version="0.1.0",
    )
    # All current API routes are GET. Keep the method list tight so a future
    # mutating route doesn't inherit an overly-permissive CORS surface without
    # an explicit change.
    allowed_origins = [o.strip() for o in settings.frontend_origin.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["X-Ingest-Token", "Content-Type"],
    )

    app.include_router(repos_router.router)
    app.include_router(query_router.router)
    app.include_router(ingest_router.router)
    app.include_router(impact_router.router)
    app.include_router(interview_router.router)

    @app.get("/healthz", response_model=HealthResponse)
    async def healthz() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service="postmortem-backend",
            environment=settings.environment,
        )

    return app


app = create_app()
