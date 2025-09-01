declare module "bun" {
  type Env = {
    JWT_SECRET: string;
    DATABASE_URL_DEV: string;
    DATABASE_URL_PROD: string;
  };
}
