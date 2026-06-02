// Ensure environment variables are set before any test runs.
// Tests use mock values — no real database connection is made.
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "test-secret-for-vitest-only";
process.env.NODE_ENV = "test";
