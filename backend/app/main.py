from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import get_settings
from app.routers import impact as impact_router
from app.routers import ingest as ingest_router
from app.routers import query as query_router
from app.routers import repos as repos_router


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
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(repos_router.router)
    app.include_router(query_router.router)
    app.include_router(ingest_router.router)
    app.include_router(impact_router.router)

    @app.get("/healthz", response_model=HealthResponse)
    async def healthz() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service="postmortem-backend",
            environment=settings.environment,
        )

    return app


app = create_app()
