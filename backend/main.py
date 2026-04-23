import os
import secrets
import shutil
import unicodedata
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="DEV EASY DOC API")

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {
    ".html", ".htm", ".xlsx", ".xls", ".csv",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg",
}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# ==============================================
# Authentication
# ==============================================

APP_PASSWORD = os.environ.get("APP_PASSWORD", "admin1020")
_valid_tokens: set[str] = set()

AUTH_COOKIE_NAME = "dev_easy_doc_token"
AUTH_EXEMPT_PATHS = {"/api/auth/login"}


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path

    # Skip auth for non-API routes (static files), login endpoint, and CORS preflight
    if not path.startswith("/api/") or path in AUTH_EXEMPT_PATHS or request.method == "OPTIONS":
        return await call_next(request)

    # Check Authorization header first, then fall back to cookie
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token:
        token = request.cookies.get(AUTH_COOKIE_NAME, "")
    if not token or token not in _valid_tokens:
        return JSONResponse(status_code=401, content={"detail": "인증이 필요합니다"})

    return await call_next(request)


class AuthLogin(BaseModel):
    password: str


@app.post("/api/auth/login")
async def auth_login(data: AuthLogin):
    if not secrets.compare_digest(data.password, APP_PASSWORD):
        raise HTTPException(status_code=401, detail="비밀번호가 올바르지 않습니다")
    token = secrets.token_hex(32)
    _valid_tokens.add(token)
    response = JSONResponse({"token": token})
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=86400 * 30,
    )
    return response


@app.post("/api/auth/logout")
async def auth_logout(request: Request):
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token:
        token = request.cookies.get(AUTH_COOKIE_NAME, "")
    _valid_tokens.discard(token)
    response = JSONResponse({"message": "로그아웃 되었습니다"})
    response.delete_cookie(AUTH_COOKIE_NAME)
    return response


@app.get("/api/auth/verify")
async def auth_verify():
    return {"valid": True}


def secure_name(name: str) -> str:
    """Sanitize a single file/folder name segment while preserving Unicode."""
    name = unicodedata.normalize("NFC", name)
    name = name.replace("\x00", "")
    name = Path(name).name
    name = name.replace("..", "")
    name = name.strip(". ")
    if not name:
        name = "unnamed"
    return name


def resolve_safe_path(relative_path: str) -> Path:
    """Resolve a relative path under UPLOAD_DIR, ensuring no escape."""
    parts = relative_path.replace("\\", "/").split("/")
    clean_parts = [secure_name(p) for p in parts if p and p != "."]
    resolved = UPLOAD_DIR
    for part in clean_parts:
        resolved = resolved / part
    try:
        resolved.resolve().relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="접근이 거부되었습니다")
    return resolved


def get_folder_path(folder: Optional[str]) -> Path:
    if not folder or folder == "/" or folder == ".":
        return UPLOAD_DIR
    return resolve_safe_path(folder)


def get_relative_path(full_path: Path) -> str:
    try:
        return str(full_path.relative_to(UPLOAD_DIR)).replace("\\", "/")
    except ValueError:
        return full_path.name


# ==============================================
# File & Folder listing
# ==============================================

@app.get("/api/files")
async def list_files(folder: str = "", sort: str = "name", order: str = "asc"):
    if sort not in ("name", "date", "type", "size"):
        sort = "name"
    if order not in ("asc", "desc"):
        order = "asc"
    is_desc = order == "desc"

    folder_path = get_folder_path(folder)
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다")

    folders = []
    files = []

    for item in folder_path.iterdir():
        if item.name.startswith("."):
            continue
        if item.is_dir():
            count = sum(1 for x in item.iterdir() if not x.name.startswith("."))
            folders.append({
                "name": item.name,
                "path": get_relative_path(item),
                "isFolder": True,
                "itemCount": count,
                "modified": item.stat().st_mtime,
            })
        elif item.is_file() and item.suffix.lower() in ALLOWED_EXTENSIONS:
            stat = item.stat()
            files.append({
                "name": item.name,
                "path": get_relative_path(item),
                "isFolder": False,
                "size": stat.st_size,
                "type": item.suffix.lower().lstrip("."),
                "modified": stat.st_mtime,
            })

    folders.sort(key=lambda x: x["name"].lower(), reverse=is_desc)

    if sort == "name":
        files.sort(key=lambda x: x["name"].lower(), reverse=is_desc)
    elif sort == "date":
        files.sort(key=lambda x: x["modified"], reverse=not is_desc)
    elif sort == "type":
        files.sort(key=lambda x: (x["type"], x["name"].lower()), reverse=is_desc)
    elif sort == "size":
        files.sort(key=lambda x: x["size"], reverse=not is_desc)

    breadcrumb = []
    if folder and folder != "/" and folder != ".":
        parts = folder.replace("\\", "/").split("/")
        accumulated = ""
        for part in parts:
            part = secure_name(part)
            accumulated = f"{accumulated}/{part}" if accumulated else part
            breadcrumb.append({"name": part, "path": accumulated})

    return {
        "currentFolder": folder or "",
        "breadcrumb": breadcrumb,
        "items": folders + files,
    }


# ==============================================
# Upload (supports folder parameter)
# ==============================================

@app.post("/api/upload")
async def upload_files(files: List[UploadFile] = File(...), folder: str = Form("")):
    folder_path = get_folder_path(folder)
    folder_path.mkdir(parents=True, exist_ok=True)

    results = []
    for file in files:
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            results.append({
                "filename": file.filename,
                "success": False,
                "error": f"허용되지 않는 파일 형식: {ext}",
            })
            continue

        safe = secure_name(file.filename)
        file_path = folder_path / safe
        overwritten = file_path.exists()

        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE:
            results.append({
                "filename": file.filename,
                "success": False,
                "error": "파일 크기 초과 (최대 50MB)",
            })
            continue

        with open(file_path, "wb") as f:
            f.write(contents)

        results.append({"filename": safe, "success": True, "overwritten": overwritten})

    return {"results": results}


# ==============================================
# Folder management
# ==============================================

class FolderCreate(BaseModel):
    name: str
    parent: str = ""


class ItemMove(BaseModel):
    source: str
    destination: str


class ItemRename(BaseModel):
    path: str
    newName: str


@app.post("/api/folders")
async def create_folder(data: FolderCreate):
    parent_path = get_folder_path(data.parent)
    if not parent_path.exists():
        raise HTTPException(status_code=404, detail="상위 폴더를 찾을 수 없습니다")

    folder_name = secure_name(data.name)
    new_folder = parent_path / folder_name

    if new_folder.exists():
        raise HTTPException(status_code=409, detail="이미 존재하는 폴더입니다")

    new_folder.mkdir(parents=True, exist_ok=True)
    return {"name": folder_name, "path": get_relative_path(new_folder)}


@app.delete("/api/folders/{folder_path:path}")
async def delete_folder(folder_path: str):
    target = resolve_safe_path(folder_path)

    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다")

    if target == UPLOAD_DIR:
        raise HTTPException(status_code=400, detail="루트 폴더는 삭제할 수 없습니다")

    shutil.rmtree(target)
    return {"message": "폴더가 삭제되었습니다"}


@app.post("/api/move")
async def move_item(data: ItemMove):
    source = resolve_safe_path(data.source)
    if not source.exists():
        raise HTTPException(status_code=404, detail="원본을 찾을 수 없습니다")

    dest_folder = get_folder_path(data.destination)
    if not dest_folder.exists():
        dest_folder.mkdir(parents=True, exist_ok=True)

    target = dest_folder / source.name
    if target.exists():
        raise HTTPException(status_code=409, detail="대상 위치에 동일한 이름이 존재합니다")

    shutil.move(str(source), str(target))
    return {"newPath": get_relative_path(target)}


@app.post("/api/rename")
async def rename_item(data: ItemRename):
    source = resolve_safe_path(data.path)
    if not source.exists():
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다")

    new_name = secure_name(data.newName)
    target = source.parent / new_name

    if target.exists():
        raise HTTPException(status_code=409, detail="동일한 이름이 이미 존재합니다")

    source.rename(target)
    return {"newPath": get_relative_path(target), "newName": new_name}


# ==============================================
# File retrieval
# ==============================================

@app.get("/api/files/{file_path:path}")
async def get_file(file_path: str):
    target = resolve_safe_path(file_path)

    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

    media_types = {
        ".html": "text/html; charset=utf-8",
        ".htm": "text/html; charset=utf-8",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xls": "application/vnd.ms-excel",
        ".csv": "text/csv; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
        ".svg": "image/svg+xml",
    }
    ext = target.suffix.lower()
    media_type = media_types.get(ext, "application/octet-stream")

    inline_types = {".html", ".htm", ".csv"} | IMAGE_EXTENSIONS
    if ext in inline_types:
        return FileResponse(target, media_type=media_type)
    else:
        return FileResponse(target, filename=target.name, media_type=media_type)


# ==============================================
# File deletion
# ==============================================

@app.delete("/api/files/{file_path:path}")
async def delete_file(file_path: str):
    target = resolve_safe_path(file_path)

    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

    target.unlink()
    return {"message": "파일이 삭제되었습니다"}


# ==============================================
# Static file serving for local development
# ==============================================

_frontend_path = Path(__file__).parent.parent / "frontend"
if _frontend_path.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_path), html=True), name="frontend")
