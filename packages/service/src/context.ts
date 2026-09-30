export type AppContext = {
  configDir: string;
  defaultsDir: string;
  webDist: string;
  port: number;
  token: string;
  version: string;
  home?: string;
  extraOrigins?: string[];
  open: (target: string) => Promise<void>;
  loginItem: { enable: () => Promise<void>; disable: () => Promise<void>; isEnabled: () => Promise<boolean> };
};
