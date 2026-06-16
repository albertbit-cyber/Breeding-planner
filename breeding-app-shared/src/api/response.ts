export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  message: string;
  code?: string;
  errors?: Record<string, string[]>;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface HealthCheckResponse {
  ok: boolean;
  status: "ok" | "degraded";
  service: string;
  timestamp: string;
}

export interface DatabaseCheckResponse extends HealthCheckResponse {
  database: "ok" | "unavailable";
}
