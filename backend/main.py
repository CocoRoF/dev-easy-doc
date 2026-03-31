import os
import unicodedata
from pathlib import Path
from typing import List

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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

ALLOWED_EXTENSIONS = {".html", ".htm", ".xlsx", ".xls", ".csv"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


def secure_filename(filename: str) -> str:
    """Sanitize filename while preserving Unicode characters (e.g., Korean)."""
    filename = unicodedata.normalize("NFC", filename)
    # Remove null bytes
    filename = filename.replace("\x00", "")
    # Keep only the filename part (strip directory components)
    filename = Path(filename).name
    # Remove path traversal patterns
    filename = filename.replace("..", "")
    # Strip leading/trailing whitespace and dots
    filename = filename.strip(". ")
    if not filename:
        filename = "unnamed"
    return filename


@app.get("/api/files")
async def list_files(sort: str = "name"):
    if sort not in ("name", "date", "type", "size"):
        sort = "name"

    files = []
    for f in UPLOAD_DIR.iterdir():
        if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS:
            stat = f.stat()
            files.append({
                "name": f.name,
                "size": stat.st_size,
                "type": f.suffix.lower().lstrip("."),
                "modified": stat.st_mtime,
            })

    if sort == "name":
        files.sort(key=lambda x: x["name"].lower())
    elif sort == "date":
        files.sort(key=lambda x: x["modified"], reverse=True)
    elif sort == "type":
        files.sort(key=lambda x: (x["type"], x["name"].lower()))
    elif sort == "size":
        files.sort(key=lambda x: x["size"], reverse=True)

    return {"files": files}


@app.post("/api/upload")
async def upload_files(files: List[UploadFile] = File(...)):
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

        safe_name = secure_filename(file.filename)
        file_path = UPLOAD_DIR / safe_name

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

        results.append({"filename": safe_name, "success": True})

    return {"results": results}


@app.get("/api/files/{filename:path}")
async def get_file(filename: str):
    safe_name = secure_filename(filename)
    file_path = UPLOAD_DIR / safe_name

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

    # Ensure the resolved path is within UPLOAD_DIR (prevent path traversal)
    try:
        file_path.resolve().relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="접근이 거부되었습니다")

    media_types = {
        ".html": "text/html; charset=utf-8",
        ".htm": "text/html; charset=utf-8",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xls": "application/vnd.ms-excel",
        ".csv": "text/csv; charset=utf-8",
    }
    ext = file_path.suffix.lower()
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(file_path, filename=safe_name, media_type=media_type)


@app.delete("/api/files/{filename:path}")
async def delete_file(filename: str):
    safe_name = secure_filename(filename)
    file_path = UPLOAD_DIR / safe_name

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

    try:
        file_path.resolve().relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="접근이 거부되었습니다")

    file_path.unlink()
    return {"message": "파일이 삭제되었습니다"}


# For local development: serve frontend static files
# In Docker, nginx handles this (the frontend directory won't exist in the container)
_frontend_path = Path(__file__).parent.parent / "frontend"
if _frontend_path.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_path), html=True), name="frontend")
