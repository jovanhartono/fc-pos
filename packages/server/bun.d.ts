declare module "bun" {
  interface Env {
    JWT_SECRET: string;
    DATABASE_URL_DEV: string;
    DATABASE_URL_PROD: string;
  }
}
