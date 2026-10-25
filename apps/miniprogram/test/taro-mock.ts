const storage = new Map<string, unknown>();

type RequestResult = { statusCode: number; data: unknown };
type RequestHandler = (options: {
  url: string;
  method?: string;
  data?: unknown;
  header?: Record<string, string>;
}) => Promise<RequestResult>;

let requestHandler: RequestHandler = async () => ({
  statusCode: 200,
  data: {},
});

export const __setRequestHandler = (handler: RequestHandler): void => {
  requestHandler = handler;
};

const Taro = {
  reLaunch: async (_options: { url: string }): Promise<void> => {},
  request: (options: {
    url: string;
    method?: string;
    data?: unknown;
    header?: Record<string, string>;
  }) => requestHandler(options),
  getStorageSync: (key: string): unknown => storage.get(key) ?? "",
  setStorageSync: (key: string, value: unknown): void => {
    storage.set(key, value);
  },
  removeStorageSync: (key: string): void => {
    storage.delete(key);
  },
};

export default Taro;
