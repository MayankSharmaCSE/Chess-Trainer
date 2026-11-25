"""SQLAlchemy engine/session/Base. SQLite by default, Postgres via DATABASE_URL."""

from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import DATABASE_URL


class Base(DeclarativeBase):
    pass


connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
# pre_ping: hosted Postgres drops idle connections; reconnect instead of 500ing.
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Nullable columns added after a table first shipped. create_all() never
# alters existing tables, and data.db is gitignored, so every existing dev DB
# would otherwise 500 with "no such column". Additive + idempotent only.
ADDITIVE_COLUMNS: dict[str, list[str]] = {
    "training_drills": [
        "acceptable_ucis",
        "coaching_hint",
        "coaching_hint_source",
        "coaching_reveal",
        "coaching_reveal_source",
    ],
    "endgame_attempts": [
        "session_id",
    ],
    "users": [
        "password_changed_at",
        "session_version",
    ],
    "password_reset_tokens": [
        "sent_at",
    ],
}


def add_missing_columns(bind: Engine | None = None) -> list[str]:
    """ALTER TABLE ... ADD COLUMN for any ADDITIVE_COLUMNS the DB lacks."""
    bind = bind or engine
    insp = inspect(bind)
    added: list[str] = []
    for table, names in ADDITIVE_COLUMNS.items():
        if not insp.has_table(table):
            continue  # create_all() builds it with every column
        have = {c["name"] for c in insp.get_columns(table)}
        model_table = Base.metadata.tables[table]
        with bind.begin() as conn:
            for name in names:
                if name in have:
                    continue
                col = model_table.c[name]
                ddl_type = col.type.compile(dialect=bind.dialect)
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl_type}"))
                added.append(f"{table}.{name}")
    return added


def init_db() -> None:
    # Import models so tables are registered before create_all.
    from app.models import account, analysis, bot, endgame, game, training, user  # noqa: F401

    Base.metadata.create_all(bind=engine)
    add_missing_columns(engine)

    from app.models.bot import Bot, DEFAULT_BOTS

    with SessionLocal() as db:
        for b_data in DEFAULT_BOTS:
            existing = db.get(Bot, b_data["id"])
            if existing is None:
                db.add(Bot(**b_data))
            else:
                for k, v in b_data.items():
                    setattr(existing, k, v)
        db.commit()
