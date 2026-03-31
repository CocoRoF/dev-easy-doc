# DEV EASY DOC

간단한 문서 파일 공유 및 뷰어 시스템입니다.
HTML, XLSX, XLS, CSV 파일을 업로드하고 브라우저에서 바로 확인할 수 있습니다.

## 구조

```
dev-easy-doc/
├── docker-compose.yml       # Docker 오케스트레이션
├── backend/
│   ├── Dockerfile           # 백엔드 컨테이너
│   ├── requirements.txt     # Python 의존성
│   └── main.py              # FastAPI 백엔드
├── frontend/
│   ├── index.html           # 메인 HTML
│   ├── css/style.css        # 스타일시트
│   └── js/app.js            # 프론트엔드 로직
└── nginx/
    └── nginx.conf           # Nginx 설정
```

## 로컬 개발

### 요구사항
- Python 3.10+
- pip

### 실행

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

브라우저에서 http://localhost:8000 으로 접속합니다.
(백엔드가 프론트엔드 정적 파일도 함께 서빙합니다)

## Docker 배포

```bash
docker compose up -d --build
```

포트 **58399** 에서 서비스됩니다.
Cloudflare Tunnel로 58399 포트를 연결하면 외부 접속이 가능합니다.

### 볼륨
- `upload_data` : 업로드된 파일이 영구 저장되는 Docker 볼륨

### 서비스 중지

```bash
docker compose down
```

파일 데이터를 유지한 채 중지됩니다. 볼륨까지 삭제하려면:

```bash
docker compose down -v
```

## API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/files?sort=name` | 파일 목록 (sort: name, date, type, size) |
| POST | `/api/upload` | 파일 업로드 (multipart/form-data, field: `files`) |
| GET | `/api/files/{filename}` | 파일 다운로드/조회 |
| DELETE | `/api/files/{filename}` | 파일 삭제 |

## 지원 파일 형식

| 형식 | 확장자 | 뷰어 |
|------|--------|------|
| HTML | .html, .htm | iframe 렌더링 |
| Excel | .xlsx, .xls | 테이블 렌더링 (SheetJS) |
| CSV | .csv | 테이블 렌더링 (SheetJS) |

최대 파일 크기: **50MB**
