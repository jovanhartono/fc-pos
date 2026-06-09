declare module "bun" {
  interface Env {
    DATABASE_URL_DEV: string;
    DATABASE_URL_PROD: string;
    JWT_SECRET: string;
  }
}
