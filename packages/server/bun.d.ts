declare module "bun" {
  interface Env {
    DATABASE_URL?: string;
    DATABASE_URL_DEV: string;
    DATABASE_URL_PROD: string;
    JWT_SECRET: string;
    STORAGE_PREFIX?: string;
  }
}
