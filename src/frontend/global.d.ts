declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<string | string[]>;
    };
  }

  namespace JSX {
    interface IntrinsicElements {
      "l-trefoil": {
        size?: number | string;
        color?: string;
        speed?: number | string;
        stroke?: number | string;
        "stroke-length"?: number | string;
        "bg-opacity"?: number | string;
      };
    }
  }
}

export {};
