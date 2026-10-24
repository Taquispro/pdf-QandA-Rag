# Papertrail frontend

React + TypeScript interface for the Spring Boot PDF Q&A API.

## Run locally

1. Start the backend from `backend/pdf-qa` with `mvn spring-boot:run` and set `GEMINI_API_KEY`.
2. In this directory, run `npm install` and `npm run dev`.
3. Open the Vite URL (default `http://localhost:5173`).

The API base defaults to `http://localhost:8080`. Set `VITE_API_BASE_URL` in a `.env` file to point the frontend at another backend URL. The backend CORS configuration currently allows the default Vite origin.

The interface supports all backend routes: list, upload, and delete PDFs under `/api/documents`, and ask questions at `/api/ask` with optional document IDs and a configurable retrieval count (`topK`). Uploaded files must be non-empty PDFs no larger than the backend's configured 25 MB limit.
